const BROWSER_RESTRICTED_HEADER_NAMES = new Set([
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "date",
  "dnt",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "permissions-policy",
  "range",
  "referer",
  "referrer",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "user-agent",
  "via"
]);

function normalizeHeaderEntries(headers = {}) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return [];
  }
  return Object.entries(headers)
    .map(([name, value]) => [String(name || "").trim(), String(value ?? "").trim()])
    .filter(([name, value]) => name && value)
    .filter(([name, value]) => !name.includes("\r") && !name.includes("\n") && !value.includes("\r") && !value.includes("\n"));
}

export function isBrowserRestrictedPlaybackHeader(name = "") {
  const normalized = String(name || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return true;
  }
  if (normalized.startsWith("sec-") || normalized.startsWith("proxy-")) {
    return true;
  }
  return BROWSER_RESTRICTED_HEADER_NAMES.has(normalized);
}

export function classifyWebPlaybackHeaders(headers = {}) {
  const forwardableHeaders = {};
  const declaredHeaderNames = [];
  const restrictedHeaderNames = [];

  normalizeHeaderEntries(headers).forEach(([name, value]) => {
    declaredHeaderNames.push(name);
    if (isBrowserRestrictedPlaybackHeader(name)) {
      restrictedHeaderNames.push(name);
      return;
    }
    forwardableHeaders[name] = value;
  });

  return {
    forwardableHeaders,
    declaredHeaderNames,
    restrictedHeaderNames
  };
}

export function normalizeNotWebReady(value) {
  return (
    value === true ||
    String(value || "")
      .trim()
      .toLowerCase() === "true"
  );
}

export function getStandaloneWebPlaybackCompatibility(headers = {}, notWebReady = false) {
  const classification = classifyWebPlaybackHeaders(headers);
  const normalizedNotWebReady = normalizeNotWebReady(notWebReady);
  const unsupportedStandalone = normalizedNotWebReady && classification.restrictedHeaderNames.length > 0;

  return {
    ...classification,
    notWebReady: normalizedNotWebReady,
    compatible: !unsupportedStandalone,
    standaloneCompatibility: unsupportedStandalone
      ? "unsupported standalone web stream"
      : classification.restrictedHeaderNames.length
        ? "direct playback attempt allowed"
        : "compatible standalone web stream"
  };
}

export function createWebPlaybackHeaderDiagnosticSnapshot(headers = {}, { notWebReady = false, playbackEngine = "" } = {}) {
  const compatibility = getStandaloneWebPlaybackCompatibility(headers, notWebReady);
  const browserSafeHeaderNames = Object.keys(compatibility.forwardableHeaders);
  const engine = String(playbackEngine || "")
    .trim()
    .toLowerCase();

  return {
    declaredHeaderNames: [...compatibility.declaredHeaderNames],
    browserSafeHeaderNames,
    forwardedHeaderNames: engine === "hls.js" ? [...browserSafeHeaderNames] : [],
    restrictedHeaderNames: [...compatibility.restrictedHeaderNames],
    notWebReady: compatibility.notWebReady,
    standaloneCompatibility: compatibility.standaloneCompatibility
  };
}
