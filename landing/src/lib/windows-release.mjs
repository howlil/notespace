// Select the newest publicly published Notespace Windows installer.
// GitHub's /releases/latest does not include prereleases, so the beta channel
// must use the published release list instead.
const repoPrefix = "https://github.com/howlil/notespace/releases/download/";
const tagPattern = /^v(\d+\.\d+\.\d+(?:-beta\.\d+)?)$/;

export function latestWindowsInstaller(releases) {
  if (!Array.isArray(releases)) return null;
  const candidates = [];

  for (const release of releases) {
    if (!release || release.draft || !release.published_at) continue;
    const tag = typeof release.tag_name === "string" ? release.tag_name : "";
    const match = tagPattern.exec(tag);
    if (!match) continue;

    const expectedName = `Notespace_${match[1]}_x64_en-US.msi`;
    const publishedTime = Date.parse(release.published_at);
    if (!Number.isFinite(publishedTime)) continue;

    const asset = Array.isArray(release.assets)
      ? release.assets.find(item => item?.name === expectedName &&
          (item.state === undefined || item.state === "uploaded"))
      : null;
    if (!asset || typeof asset.browser_download_url !== "string") continue;

    // Never turn untrusted GitHub release metadata into an arbitrary redirect.
    const exactUrl = `${repoPrefix}${tag}/${expectedName}`;
    if (asset.browser_download_url !== exactUrl) continue;

    candidates.push({ url: exactUrl, version: match[1], publishedTime, stable: !release.prerelease });
  }

  candidates.sort((a, b) => b.publishedTime - a.publishedTime ||
    Number(b.stable) - Number(a.stable));
  return candidates[0] ?? null;
}
