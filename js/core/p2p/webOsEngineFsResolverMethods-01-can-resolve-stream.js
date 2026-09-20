/* eslint-disable no-unused-vars */
import * as internals from "./webosEngineFsResolver.js";

export function createWebOsEngineFsResolverMethods01() {
  const { Platform, isWebOsCompanionServiceAvailable, ENGINEFS_KIND, isP2pEnabledForActiveProfile, getInfoHash, normalizeEngineFsState } =
    internals;

  return {
    canResolveStream(stream = {}) {
      return Platform.isWebOS() && isWebOsCompanionServiceAvailable() && isP2pEnabledForActiveProfile() && Boolean(getInfoHash(stream));
    },
    getResolvedStreamState(stream = {}) {
      const state = normalizeEngineFsState(stream.engineFs || stream.raw?.engineFs || null);
      if (!state || state.kind !== ENGINEFS_KIND) {
        return null;
      }
      return state;
    }
  };
}
