/* eslint-disable no-unused-vars */
import * as internals from "./webosEngineFsResolver.js";

export function createWebOsEngineFsResolverMethods03() {
  const { Platform, isWebOsCompanionServiceAvailable, requestWebOsCompanionService, normalizeInfoHash, withTimeout, describeError } =
    internals;

  return {
    async remove(infoHash, { timeoutMs = 5000 } = {}) {
      const normalizedInfoHash = normalizeInfoHash(infoHash);
      if (!Platform.isWebOS() || !normalizedInfoHash) {
        return { status: "unsupported" };
      }
      if (!isWebOsCompanionServiceAvailable()) {
        return { status: "unavailable" };
      }
      try {
        const result = await withTimeout(
          requestWebOsCompanionService({
            method: "torrentRemove",
            parameters: {
              infoHash: normalizedInfoHash,
              timeoutMs
            }
          }),
          Math.max(1000, Number(timeoutMs || 5000) + 1000),
          "webOS EngineFS remove request timed out"
        );
        return result?.payload?.returnValue === false
          ? { status: "error", detail: result.payload.errorText || "" }
          : { status: "success", payload: result?.payload || null };
      } catch (error) {
        return {
          status: "error",
          detail: describeError(error)
        };
      }
    }
  };
}
