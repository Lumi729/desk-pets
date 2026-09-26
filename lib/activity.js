// 看前台窗口是什么程序，只在本机内存里判断，得出一个类别（写代码/看视频/听歌）。
// 窗口标题不会被保存、打印或发给页面，更不会上传。
const { spawn } = require('node:child_process');

function classify(processName, title) {
  const p = String(processName || '').toLowerCase();
  const t = String(title || '').toLowerCase();
  if (p === 'code' || p === 'code - insiders' || t.endsWith('visual studio code')) return 'code';
  if (p === 'cloudmusic' || p === 'spotify') return 'music';
  if (t.includes('bilibili') || t.includes('哔哩哔哩') || t.includes('youtube')) return 'video';
  return null;
}

// Windows 上用一个隐藏的 PowerShell 每 0.15 秒看一次前台窗口的位置（给宠物站窗口顶用）。
// 只有打开「看我在做什么」时（full = true）才会顺便读程序名和标题。主程序退出时它也会自己结束。
const SCRIPT = String.raw`
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class PetFg {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint procId);
}
"@
[void][PetFg]::SetProcessDPIAware()
$parent = __PARENT__
$full = __FULL__
$skip = @('Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd')
$last = ''
$lastHandle = [IntPtr]::Zero
$name = ''
$tick = 0
while ($true) {
  $tick++
  if ($tick % 10 -eq 0 -and -not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit }
  $h = [PetFg]::GetForegroundWindow()
  $rect = ''
  if ($h -ne [IntPtr]::Zero -and [PetFg]::IsWindowVisible($h) -and -not [PetFg]::IsIconic($h)) {
    $cls = New-Object System.Text.StringBuilder 256
    [void][PetFg]::GetClassName($h, $cls, 256)
    if ($skip -notcontains $cls.ToString()) {
      $r = New-Object PetFg+RECT
      if ([PetFg]::DwmGetWindowAttribute($h, 9, [ref]$r, 16) -ne 0) { [void][PetFg]::GetWindowRect($h, [ref]$r) }
      $rect = "$($r.Left),$($r.Top),$($r.Right),$($r.Bottom)"
    }
  }
  $info = @{ h = $h.ToInt64(); r = $rect }
  if ($full) {
    if ($h -ne $lastHandle) {
      $procId = [uint32]0
      [void][PetFg]::GetWindowThreadProcessId($h, [ref]$procId)
      $name = ''
      try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch {}
    }
    $sb = New-Object System.Text.StringBuilder 512
    [void][PetFg]::GetWindowText($h, $sb, 512)
    $info.p = $name
    $info.t = $sb.ToString()
  }
  $lastHandle = $h
  $line = $info | ConvertTo-Json -Compress
  if ($line -ne $last) { [Console]::Out.WriteLine($line); [Console]::Out.Flush(); $last = $line }
  Start-Sleep -Milliseconds 150
}
`;

// 把 PowerShell 的一行输出变成 { handle, rect, kind }。标题只在这里用来分类，马上丢掉。
function parseLine(line, full) {
  const info = JSON.parse(line.replace(/^﻿/, '').trim());
  const nums = String(info.r || '').split(',').map(Number);
  const rect = nums.length === 4 && nums.every(Number.isFinite) && nums[2] > nums[0] && nums[3] > nums[1]
    ? { x: nums[0], y: nums[1], width: nums[2] - nums[0], height: nums[3] - nums[1] }
    : null;
  return { handle: info.h || 0, rect, kind: full ? classify(info.p, info.t) : null };
}

function watchForeground(onInfo, { full }) {
  if (process.platform !== 'win32') return () => {};
  const script = SCRIPT.replace('__PARENT__', String(process.pid)).replace('__FULL__', full ? '$true' : '$false');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let buffered = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffered += chunk;
    let newline;
    while ((newline = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      try { onInfo(parseLine(line, full)); } catch {}
    }
  });
  child.on('error', () => {});
  return () => { try { child.kill(); } catch {} };
}

module.exports = { classify, parseLine, watchForeground };
