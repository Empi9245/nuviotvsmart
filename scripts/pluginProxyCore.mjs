// Same-origin plugin network proxy, shared by the local serve.mjs server and
// the hosted Vercel function (api/plugin-proxy.js).
//
// Why: the VIDAA TV browser (and every plain browser) enforces CORS on
// cross-origin fetches. Plugin scrapers read arbitrary provider sites that do
// not send Access-Control-Allow-Origin, so every provider request fails with
// TypeError: Failed to fetch and stream discovery finds almost nothing. The
// TV keeps its browser limits (docs/vidaa-network-research.md, 8 Oct 2026
// device probe), so the requests are relayed server-side through the app's own
// origin, where no CORS rules apply. The client transport only uses this
// endpoint when the app is served over HTTP(S) and falls back to direct
// browser fetch when the endpoint is absent.

export {
  PLUGIN_PROXY_PATH,
  PLUGIN_PROXY_HEADER,
  isPluginProxyMissingStatus
} from "../js/core/player/pluginProxyProtocol.js";
import { PLUGIN_PROXY_HEADER } from "../js/core/player/pluginProxyProtocol.js";

const MAX_REQUEST_BODY_BYTES = 6 * 1024 * 1024;
// Stay under the 4.5 MB Serverless response budget; the client truncates at
// its own (smaller) plugin quota anyway.
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 25000;

// Hop-by-hop and framing headers must never be forwarded in either direction.
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "expect",
  "host",
  "content-length"
]);

// Response headers that would change the behaviour or security state of the
// app's own origin if a provider set them. Set-Cookie is preserved for scraper
// inspection under x-nuvio-proxy-set-cookie (JSON array) instead.
const RESPONSE_HEADER_DENYLIST = new Set([
  ...HOP_BY_HOP_HEADERS,
  "set-cookie",
  "clear-site-data",
  "content-encoding",
  "strict-transport-security",
  "content-security-policy",
  "content-security-policy-report-only",
  "report-to",
  "nel",
  "refresh",
  "alt-svc",
  "link"
]);

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function isBlockedTarget(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    /^127\./.test(host) ||
    /^169\.254\./.test(host)
  );
}

export function parsePluginProxyEnvelope(rawBody) {
  let envelope;
  try {
    envelope = JSON.parse(String(rawBody || ""));
  } catch (_) {
    return { ok: false, reason: "Invalid plugin proxy envelope" };
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return { ok: false, reason: "Invalid plugin proxy envelope" };
  }
  let parsed;
  try {
    parsed = new URL(String(envelope.url || ""));
  } catch (_) {
    return { ok: false, reason: "Invalid target URL" };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, reason: "Only HTTP(S) URLs are allowed" };
  }
  if (isBlockedTarget(parsed.hostname)) {
    return { ok: false, reason: "Target host is not allowed" };
  }
  const method = String(envelope.method || "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return { ok: false, reason: "Unsupported request method" };
  }
  const headers = {};
  if (envelope.headers != null) {
    if (typeof envelope.headers !== "object" || Array.isArray(envelope.headers)) {
      return { ok: false, reason: "Invalid request headers" };
    }
    Object.entries(envelope.headers).forEach(([key, value]) => {
      const name = String(key || "").trim();
      if (!name || value == null || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) return;
      headers[name] = String(value);
    });
  }
  const bodyKind = String(envelope.bodyKind || "none").toLowerCase();
  if (!["none", "text", "base64"].includes(bodyKind)) {
    return { ok: false, reason: "Unsupported request body type" };
  }
  const body = bodyKind === "text" ? String(envelope.body || "") : "";
  const bodyBase64 = bodyKind === "base64" ? String(envelope.bodyBase64 || "") : "";
  if (bodyKind === "base64" && !BASE64_PATTERN.test(bodyBase64)) {
    return { ok: false, reason: "Invalid binary request body" };
  }
  const bodyBytes =
    bodyKind === "base64"
      ? (bodyBase64.length / 4) * 3 -
        (bodyBase64.endsWith("==") ? 2 : bodyBase64.endsWith("=") ? 1 : 0)
      : Buffer.byteLength(body, "utf8");
  if (bodyBytes > MAX_REQUEST_BODY_BYTES) {
    return { ok: false, reason: "Request body exceeds the plugin proxy quota" };
  }
  return {
    ok: true,
    envelope: {
      url: parsed.toString(),
      method,
      headers,
      followRedirects: envelope.followRedirects !== false,
      bodyKind,
      body,
      ...(bodyKind === "base64" ? { bodyBase64 } : {})
    }
  };
}

async function readCappedBody(stream, limit) {
  if (!stream) return Buffer.alloc(0);
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      const chunk = Buffer.from(value);
      const remaining = limit - length;
      if (remaining <= 0) {
        void reader.cancel().catch(() => {});
        break;
      }
      const part = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      chunks.push(part);
      length += part.length;
      if (part.length < chunk.length) {
        void reader.cancel().catch(() => {});
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}

function upstreamRequestBody(envelope) {
  if (envelope.bodyKind === "base64") {
    return Buffer.from(envelope.bodyBase64, "base64");
  }
  if (envelope.bodyKind === "text") {
    return envelope.body;
  }
  return undefined;
}

function buildProxyResponse({ status, statusText, headers, body }) {
  return {
    status,
    headers: { ...headers, [PLUGIN_PROXY_HEADER]: "1" },
    body: body ?? Buffer.alloc(0),
    statusText
  };
}

export async function runPluginProxyHttp(
  rawBody,
  { timeoutMs = DEFAULT_UPSTREAM_TIMEOUT_MS, maxResponseBytes = MAX_RESPONSE_BYTES } = {}
) {
  const parsed = parsePluginProxyEnvelope(rawBody);
  if (!parsed.ok) {
    return buildProxyResponse({
      status: 400,
      statusText: "Bad Request",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: Buffer.from(parsed.reason, "utf8")
    });
  }
  const envelope = parsed.envelope;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const upstream = await fetch(envelope.url, {
      method: envelope.method,
      headers: envelope.headers,
      redirect: envelope.followRedirects ? "follow" : "manual",
      body: upstreamRequestBody(envelope),
      signal: controller.signal
    });
    const headers = {};
    const setCookies = [];
    upstream.headers.forEach((value, name) => {
      const key = String(name).toLowerCase();
      if (key === "set-cookie") {
        setCookies.push(String(value));
        return;
      }
      if (RESPONSE_HEADER_DENYLIST.has(key) || key.startsWith("x-nuvio-proxy")) return;
      headers[key] = String(value);
    });
    if (setCookies.length) {
      headers["x-nuvio-proxy-set-cookie"] = JSON.stringify(setCookies);
    }
    // The body is already decoded by fetch; never echo an upstream framing
    // header for bytes this proxy re-sends itself.
    delete headers["content-encoding"];
    delete headers["content-length"];
    headers["x-nuvio-proxy-final-url"] = String(upstream.url || envelope.url);
    if (upstream.statusText) {
      headers["x-nuvio-proxy-status-text"] = String(upstream.statusText).slice(0, 120);
    }
    const body = await readCappedBody(upstream.body, maxResponseBytes);
    return buildProxyResponse({
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
      body
    });
  } catch (error) {
    const message = String(error?.message || error || "Upstream request failed").slice(0, 300);
    return buildProxyResponse({
      status: 502,
      statusText: "Bad Gateway",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "x-nuvio-proxy-error": message
      },
      body: Buffer.from(message, "utf8")
    });
  } finally {
    clearTimeout(timer);
  }
}
