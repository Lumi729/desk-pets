// 检查更新：去 GitHub Releases 看最新版本号。只读公开信息，不会发送任何你的数据。
const RELEASES_API = 'https://api.github.com/repos/Lumi729/desk-pets/releases/latest';
const RELEASES_PAGE = 'https://github.com/Lumi729/desk-pets/releases/latest';

// 「v1.2.10」和「1.2.9」这样比：一段一段比数字
function compareVersions(a, b) {
  const parts = v => String(v).trim().replace(/^v/i, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

// 有新版本就返回 { version, url }，没有返回 null；网络不通会抛错
async function checkForUpdate(currentVersion, fetchImpl = fetch) {
  const response = await fetchImpl(RELEASES_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'desk-pets' } });
  if (response.status === 404) return null; // 还没有发布过
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  const release = await response.json();
  if (release.draft || release.prerelease || !release.tag_name) return null;
  if (compareVersions(release.tag_name, currentVersion) <= 0) return null;
  const url = String(release.html_url || '').startsWith('https://github.com/') ? release.html_url : RELEASES_PAGE;
  return { version: release.tag_name.replace(/^v/i, ''), url };
}

module.exports = { compareVersions, checkForUpdate, RELEASES_PAGE };
