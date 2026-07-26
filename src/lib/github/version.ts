const SEMVER_SERIES = /^(?:v)?(\d+)\.(\d+)(?:\.\d+)?(?:[-+].*)?$/;
const PATCHES_PER_MINOR = 100;

/**
 * package.json sürümünün major/minor serisini korur; patch numarasını GitHub'ın
 * varsayılan dalındaki toplam commit sayısından üretir.
 */
export function buildGithubVersion(
  baseVersion: string,
  commitCount: number,
): string {
  const match = SEMVER_SERIES.exec(baseVersion.trim());
  const major = match ? Number(match[1]) : 1;
  const baseMinor = match ? Number(match[2]) : 0;
  const safeCount = Number.isSafeInteger(commitCount) && commitCount >= 0
    ? commitCount
    : 0;
  const minor = baseMinor + Math.floor(safeCount / PATCHES_PER_MINOR);
  const patch = safeCount % PATCHES_PER_MINOR;
  return `${major}.${minor}.${patch}`;
}

/** GitHub REST API Link başlığındaki son sayfa numarasını okur. */
export function lastPageFromLinkHeader(linkHeader: string | null): number | null {
  if (!linkHeader) return null;

  for (const part of linkHeader.split(",")) {
    if (!/;\s*rel="last"\s*$/.test(part)) continue;
    const urlMatch = /<([^>]+)>/.exec(part);
    if (!urlMatch) return null;

    const page = Number(new URL(urlMatch[1]).searchParams.get("page"));
    return Number.isSafeInteger(page) && page > 0 ? page : null;
  }

  return null;
}
