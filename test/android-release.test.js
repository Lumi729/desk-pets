const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

for (const state of ['missing', 'draft', 'published', 'unsigned']) {
  test(`Android publishing: ${state} release keeps desktop latest and existing packages safe`, { skip: process.platform === "win32" }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'android-release-'));
    try {
      fs.mkdirSync(path.join(dir, 'android/app/build/outputs/apk/debug'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'bin'));
      fs.writeFileSync(path.join(dir, 'android/app/build.gradle'), "versionName '0.2-preview'\n");
      fs.writeFileSync(path.join(dir, 'android/app/build/outputs/apk/debug/app-debug.apk'), 'test-package');
      const log = path.join(dir, 'calls.jsonl');
      fs.writeFileSync(path.join(dir, 'bin/gh'), `#!/usr/bin/env node
const fs=require('node:fs');const a=process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG,JSON.stringify(a)+'\\n');
if(a[1]==='view'){
  if(['missing','unsigned'].includes(process.env.RELEASE_STATE))process.exit(1);
  console.log(process.env.RELEASE_STATE==='draft'?'true':'false');
}
`, { mode: 0o755 });
      const result = spawnSync('bash', [path.resolve('android/scripts/publish-preview.sh')], {
        cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
          RUNNER_TEMP: dir, GITHUB_SHA: 'test-commit', RELEASE_STATE: state, CALL_LOG: log, ANDROID_SIGNED_APK: state==='unsigned'?'':path.join(dir,'android/app/build/outputs/apk/debug/app-debug.apk') }
      });
      if(state==='unsigned'){
        assert.notEqual(result.status,0);
        assert.ok(!fs.readFileSync(log,'utf8').includes('"create"'));
        assert.ok(!fs.readFileSync(log,'utf8').includes('"upload"'));
        return;
      }
      assert.equal(result.status, 0, result.stderr);
      const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      assert.ok(calls.every(a => a[2] === 'android-v0.2-preview'));
      if (state === 'published') {
        assert.equal(calls.length, 1, 'published APK must not be replaced');
      } else {
        const edit = calls.find(a => a[1] === 'edit');
        assert.ok(edit.includes('--draft=false'));
        assert.ok(edit.includes('--prerelease'));
        assert.ok(edit.includes('--latest=false'));
        if (state === 'missing') {
          const create = calls.find(a => a[1] === 'create');
          assert.ok(create.includes('--draft'), 'upload before making release public');
          assert.ok(create.includes('--latest=false'));
          assert.ok(create.includes('test-commit'));
          assert.ok(create.some(a => a.endsWith('lijianxue-android-0.2-preview.apk')));
          assert.ok(calls.indexOf(create) < calls.indexOf(edit));
        } else {
          assert.ok(calls.some(a => a[1] === 'upload' && a.includes('--clobber')));
          assert.ok(!calls.some(a => a[1] === 'create'));
        }
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}
