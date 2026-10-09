import { PluginServiceClient } from "../../platform/pluginServiceClient.js";
import { Platform } from "../../platform/index.js";

const TMDB_FETCH_TIMEOUT_MS = 10000;
const TMDB_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

// Use the packaged TV network service for metadata as well as ID lookups.
// Direct fetch can fail on the same TV even when the service can reach TMDB.
export async function fetchTmdbJson(
  url,
  { signal = null, timeoutMs = TMDB_FETCH_TIMEOUT_MS, throwOnHttpError = false } = {}
) {
  const httpFailure = (status) => {
    if (!throwOnHttpError) return null;
    const error = new Error(`TMDB request failed (${status})`);
    error.status = Number(status);
    throw error;
  };
  if (signal?.aborted) throw new Error("TMDB request aborted");
  if (Platform.isWebOS() || Platform.isTizen()) {
    try {
      const result = await PluginServiceClient.fetch({
        url,
        method: "GET",
        maxResponseBytes: TMDB_MAX_RESPONSE_BYTES,
        timeoutMs,
        signal
      });
      if (!result?.ok && Number(result?.status) > 0) return httpFailure(result.status);
      if (result?.ok && !result.truncated) return JSON.parse(result.body || "");
    } catch (error) {
      if (signal?.aborted || Number(error?.status) > 0) throw error;
      // Older installs can lack the optional service. Keep direct fetch available.
    }
  }

  if (signal?.aborted) throw new Error("TMDB request aborted");
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let rejectDeadline;
  const deadline = new Promise((_, reject) => {
    rejectDeadline = reject;
  });
  const abortRequest = (error) => {
    try {
      controller?.abort();
    } catch (_) {
      // The deadline still settles runtimes without reliable fetch cancellation.
    }
    rejectDeadline(error);
  };
  const forwardAbort = () => abortRequest(new Error("TMDB request aborted"));
  signal?.addEventListener?.("abort", forwardAbort, { once: true });
  const timeoutId = setTimeout(
    () => abortRequest(new Error(`TMDB request timed out after ${timeoutMs}ms`)),
    timeoutMs
  );

  try {
    const request = (async () => {
      const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
      return response.ok ? response.json() : httpFailure(response.status);
    })();
    return await Promise.race([request, deadline]);
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener?.("abort", forwardAbort);
  }
}
