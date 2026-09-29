const { spawn } = require('node:child_process');
const path = require('node:path');
function helperPath() {
  return __dirname.includes('app.asar')
    ? path.join(process.resourcesPath, 'native/desk-pets-foreground')
    : path.join(__dirname, '../build/native/desk-pets-foreground');
}
function watchMac(onInfo, { full, onFail = () => {}, parseLine, spawnProcess = spawn, executable = helperPath() }) {
  const child = spawnProcess(executable, ['--parent', String(process.pid), ...(full ? ['--full'] : [])], { stdio: ['ignore', 'pipe', 'ignore'] });
  let buffered = '', stopped = false;
  function fail(reason) {
    if (stopped) return;
    onInfo({ handle: 0, rect: null, kind: null, fullscreen: false });
    onFail(reason);
  }
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    if (stopped) return;
    buffered += chunk;
    if (buffered.length > 65536) { buffered = ''; fail('error'); return; }
    let at;
    while ((at = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, at); buffered = buffered.slice(at + 1);
      try {
        const info = JSON.parse(line);
        if (info.error === 'permission') fail('permission');
        else onInfo(parseLine(line, full));
      } catch { fail('error'); }
    }
  });
  child.on('error', error => fail(error.code === 'ENOENT' ? 'missing' : 'error'));
  child.on('exit', () => fail('exit'));
  return () => { stopped = true; child.kill(); };
}
function requestPermission() {
  const child = spawn(helperPath(), ['--request-permission'], { stdio: 'ignore' });
  child.on('error', () => {});
}
module.exports = { helperPath, watchMac, requestPermission };
