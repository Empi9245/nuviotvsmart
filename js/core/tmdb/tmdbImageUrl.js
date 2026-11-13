const TMDB_IMAGE_HOST_PATTERN = /^(?:https?:)?\/\/image\.tmdb\.org\//i;

// These widths are used by TMDB's poster/backdrop image endpoints. A caller
// can cap small card artwork without changing the full-screen hero policy.
const TMDB_IMAGE_WIDTHS = new Set([92, 154, 185, 300, 342, 500, 780, 1280]);

let cachedCardPosterSize = null;

// Upstream card callers ask for one poster rendition. VIDAA paints 342px
// tiles, so keep the smaller source there; other platforms keep Android's
// w500 default.
export function preferredTmdbCardPosterSize() {
  if (cachedCardPosterSize === null) {
    const root = globalThis;
    const vidaa =
      root?.__NUVIO_PLATFORM__ === "vidaa" ||
      Boolean(root?.Hisense_GetOSVersion || root?.Hisense_GetFirmWareVersion);
    cachedCardPosterSize = vidaa ? "w342" : "w500";
  }
  return cachedCardPosterSize;
}

export function resetPreferredTmdbCardPosterSizeForTests() {
  cachedCardPosterSize = null;
}

export function limitTmdbImageWidth(value, maxWidth) {
  if (
    typeof value !== "string" ||
    !TMDB_IMAGE_HOST_PATTERN.test(value) ||
    !TMDB_IMAGE_WIDTHS.has(maxWidth)
  ) {
    return value;
  }
  return value.replace(
    /^((?:https?:)?\/\/image\.tmdb\.org\/t\/p\/)(original|w(\d+))\//i,
    (match, prefix, size, width) =>
      size.toLowerCase() === "original" || Number(width) > maxWidth
        ? `${prefix}w${maxWidth}/`
        : match
  );
}

/**
 * Keep Home artwork within the source sizes used by Android TV.
 * Keep unrelated artwork URLs byte-for-byte unchanged.
 */
export function normalizeTmdbBackdropUrl(value) {
  const normalized = String(value || "").trim();
  if (!normalized || !TMDB_IMAGE_HOST_PATTERN.test(normalized)) {
    return normalized;
  }
  return normalized.replace(
    /^((?:https?:)?\/\/image\.tmdb\.org\/t\/p\/)(?:original|w780)\//i,
    "$1w1280/"
  );
}

/**
 * Grid tiles (catalog, discover, folders, search) render posters at the same
 * scale as Home cards. On VIDAA they must download the same small rendition as
 * Android's poster size (w342) instead of full-size artwork into a ~250px tile.
 */
export function limitTmdbPosterTileUrl(value) {
  return limitTmdbImageWidth(normalizeTmdbPosterUrl(value), 342);
}

export function normalizeTmdbPosterUrl(value) {
  const normalized = String(value || "").trim();
  if (!normalized || !TMDB_IMAGE_HOST_PATTERN.test(normalized)) {
    return normalized;
  }
  return normalized.replace(/^((?:https?:)?\/\/image\.tmdb\.org\/t\/p\/)original\//i, "$1w500/");
}
