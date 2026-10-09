import { validatePluginFetchRequest } from "../core/player/pluginSecurity.js";

const DEFAULT_RESPONSE_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const activeRequests = new Map();

function abortError(message = "Plugin request cancelled") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function responseLimit(request) {
  const requested =
    Number(request.maxResponseBytes || request.maxBodyBytes) || DEFAULT_RESPONSE_BYTES;
  return Math.floor(Math.max(1, Math.min(MAX_RESPONSE_BYTES, requested)));
}

function responseHeaders(response) {
  const result = {};
  const suffix = "\n...[truncated]";
  response.headers?.forEach?.((value, name) => {
    const text = String(value);
    result[String(name).toLowerCase()] =
      text.length > 8192 ? text.slice(0, 8192 - suffix.length) + suffix : text;
  });
  return result;
}

function binaryString(bytes) {
  const chunks = [];
  for (let index = 0; index < bytes.length; index += 8192) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(index, index + 8192)));
  }
  return chunks.join("");
}

async function responseText(bytes, contentType) {
  const match = String(contentType || "").match(/(?:^|;)\s*charset\s*=\s*["']?([^;"'\s]+)/i);
  const charset = String(match?.[1] || "utf8")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  if (
    [
      "iso88591",
      "iso-8859-1",
      "latin1",
      "latin-1",
      "windows1252",
      "windows-1252",
      "cp1252",
      "cp-1252"
    ].includes(charset)
  ) {
    // Match the service's Buffer latin1 decoding, including bytes 0x80-0x9f.
    return binaryString(bytes);
  }
  if (["utf16le", "utf-16le", "ucs2", "ucs-2"].includes(charset)) {
    const units = new Uint16Array(Math.floor(bytes.length / 2));
    for (let index = 0; index < units.length; index += 1)
      units[index] = bytes[index * 2] | (bytes[index * 2 + 1] << 8);
    const chunks = [];
    for (let index = 0; index < units.length; index += 8192) {
      chunks.push(String.fromCharCode.apply(null, units.subarray(index, index + 8192)));
    }
    return chunks.join("");
  }
  if (typeof TextDecoder === "function")
    return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
  if (typeof Response === "function") {
    // Decode only the already bounded bytes on runtimes without TextDecoder.
    // Response.text strips a leading BOM; the service preserves it.
    const text = await new Response(bytes).text();
    return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? `\uFEFF${text}` : text;
  }
  throw new Error("UTF-8 plugin response decoding is unavailable");
}

async function readResponseBytes(response, limit, state) {
  if (response.body === null) return { bytes: new Uint8Array(0), truncated: false };
  if (typeof response.body?.getReader !== "function") {
    // A whole-body fallback would allocate an unbounded response before applying
    // the quota. Report the missing transport capability instead.
    throw new Error("Streaming plugin responses are unavailable");
  }
  const reader = response.body.getReader();
  state.reader = reader;
  const chunks = [];
  let length = 0;
  let truncated = false;
  try {
    while (true) {
      if (state.aborted) throw state.error;
      const { done, value } = await reader.read();
      if (state.aborted) throw state.error;
      if (done) break;
      if (!value?.byteLength) continue;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      const remaining = limit - length;
      const part = chunk.subarray(0, Math.min(remaining, chunk.length));
      if (part.length) {
        // Do not retain the rest of a large browser-provided chunk through a
        // subarray sharing its backing buffer.
        chunks.push(part.length === chunk.length ? chunk : new Uint8Array(part));
        length += part.length;
      }
      if (part.length < chunk.length) {
        truncated = true;
        void reader.cancel().catch(() => {});
        break;
      }
    }
  } finally {
    state.reader = null;
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });
  return { bytes, truncated };
}

export function cancelBrowserPluginRequest(requestId) {
  const state = activeRequests.get(String(requestId || "").slice(0, 128));
  if (!state || state.aborted) return false;
  state.abort();
  return true;
}

export async function fetchBrowserPluginRequest(request = {}) {
  const validation = validatePluginFetchRequest(request, {
    maxBodyBytes: Number(request.maxBodyBytes || DEFAULT_RESPONSE_BYTES)
  });
  if (!validation.ok) throw new Error(validation.reason);
  if (request.signal?.aborted) throw request.signal.reason || abortError();
  const requestId = String(request.requestId || "").slice(0, 128);
  if (requestId && activeRequests.has(requestId)) throw new Error("Duplicate plugin request id");
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const state = { aborted: false, error: null, reader: null, abort: null };
  let rejectAbort;
  const aborted = new Promise((_, reject) => {
    rejectAbort = reject;
  });
  state.abort = (error = abortError()) => {
    if (state.aborted) return;
    state.aborted = true;
    state.error = error;
    controller?.abort();
    if (state.reader) void state.reader.cancel().catch(() => {});
    rejectAbort(error);
  };
  const onAbort = () => state.abort(request.signal.reason || abortError());
  if (requestId) activeRequests.set(requestId, state);
  request.signal?.addEventListener?.("abort", onAbort, { once: true });
  if (request.signal?.aborted) onAbort();
  const timeoutMs = Number(request.timeoutMs || 30000);
  const timer = setTimeout(
    () => state.abort(abortError("Plugin provider request timed out")),
    Number.isFinite(timeoutMs) ? Math.max(1, timeoutMs) : 30000
  );
  try {
    const perform = async () => {
      if (state.aborted) throw state.error;
      const requestBody =
        validation.bodyKind === "base64"
          ? Uint8Array.from(atob(validation.bodyBase64), (char) => char.charCodeAt(0))
          : validation.bodyKind === "text"
            ? validation.body
            : new Uint8Array(0);
      const methodHasBody =
        ["POST", "PUT", "PATCH"].includes(validation.method) ||
        (validation.method === "DELETE" && validation.bodyKind !== "none");
      const response = await fetch(validation.url, {
        method: validation.method,
        headers: validation.headers,
        redirect: validation.followRedirects ? "follow" : "manual",
        body: methodHasBody ? requestBody : undefined,
        signal: controller?.signal || request.signal
      });
      if (state.aborted) throw state.error;
      if (response.type === "opaqueredirect") {
        // A browser hides the status and Location even when the provider asked
        // for manual redirects. Do not present its original URL as a stream.
        throw new Error("Browser cannot expose a manual redirect target");
      }
      const headers = responseHeaders(response);
      const { bytes, truncated } = await readResponseBytes(response, responseLimit(request), state);
      return {
        returnValue: true,
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        statusText: response.statusText,
        url: response.url || validation.url,
        body: await responseText(bytes, headers["content-type"]),
        ...(request.responseEncoding === "base64" ? { bodyBase64: btoa(binaryString(bytes)) } : {}),
        headers,
        truncated
      };
    };
    return await Promise.race([perform(), aborted]);
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener?.("abort", onAbort);
    if (requestId && activeRequests.get(requestId) === state) activeRequests.delete(requestId);
  }
}
