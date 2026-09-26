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

// Windows 上用一个隐藏的 PowerShell 每 1.5 秒读一次前台窗口。主程序退出时它也会自己结束。
const SCRIPT = String.raw`
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class PetFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint procId);
}
"@
$parent = __PARENT__
$last = ''
while ($true) {
  if (-not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit }
  $h = [PetFg]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 512
  [void][PetFg]::GetWindowText($h, $sb, 512)
  $procId = [uint32]0
  [void][PetFg]::GetWindowThreadProcessId($h, [ref]$procId)
  $name = ''
  try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch {}
  $line = @{ p = $name; t = $sb.ToString() } | ConvertTo-Json -Compress
  if ($line -ne $last) { [Console]::Out.WriteLine($line); [Console]::Out.Flush(); $last = $line }
  Start-Sleep -Milliseconds 1500
}
`;

function watchForeground(onKind) {
  if (process.platform !== 'win32') return () => {};
  const encoded = Buffer.from(SCRIPT.replace('__PARENT__', String(process.pid)), 'utf16le').toString('base64');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let buffered = '';
  let lastKind;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffered += chunk;
    let newline;
    while ((newline = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, newline).replace(/^\uFEFF/, '').trim();
      buffered = buffered.slice(newline + 1);
      let kind = null;
      try { const info = JSON.parse(line); kind = classify(info.p, info.t); } catch {}
      if (kind !== lastKind) { lastKind = kind; onKind(kind); }
    }
  });
  child.on('error', () => {});
  return () => { try { child.kill(); } catch {} };
}

module.exports = { classify, watchForeground };
