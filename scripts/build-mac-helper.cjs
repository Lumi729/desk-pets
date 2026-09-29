const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
if (process.platform !== 'darwin') throw new Error('Mac helper must be built on macOS');
const root = path.join(__dirname, '..');
const out = path.join(root, 'build/native');
fs.mkdirSync(out, { recursive: true });
for (const arch of ['arm64', 'x86_64']) {
  execFileSync('xcrun', ['swiftc', '-O', '-target', `${arch}-apple-macosx12.0`,
    path.join(root, 'native/mac-foreground.swift'), '-o', path.join(out, `foreground-${arch}`)], { stdio: 'inherit' });
}
execFileSync('lipo', ['-create', path.join(out, 'foreground-arm64'), path.join(out, 'foreground-x86_64'), '-output', path.join(out, 'desk-pets-foreground')], { stdio: 'inherit' });
fs.chmodSync(path.join(out, 'desk-pets-foreground'), 0o755);
