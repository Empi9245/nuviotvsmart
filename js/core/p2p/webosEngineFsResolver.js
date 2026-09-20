import { Platform } from "../../platform/index.js";
import {
  isWebOsCompanionServiceAvailable,
  requestWebOsCompanionService
} from "../../platform/webos/webosCompanionService.js";
import { TorrentSettingsStore } from "../../data/local/torrentSettingsStore.js";
import { createWebOsEngineFsResolverMethods01 } from "./webOsEngineFsResolverMethods-01-can-resolve-stream.js";
import { createWebOsEngineFsResolverMethods02 } from "./webOsEngineFsResolverMethods-02-resolve.js";
import { createWebOsEngineFsResolverMethods03 } from "./webOsEngineFsResolverMethods-03-remove.js";

export {
  Platform,
  isWebOsCompanionServiceAvailable,
  requestWebOsCompanionService,
  TorrentSettingsStore
};
export * from "./webOsEngineFsResolverHelpers-01-enginefs-create-timeout-ms.js";
export * from "./webOsEngineFsResolverHelpers-02-describe-error.js";
export * from "./webOsEngineFsResolverHelpers-03-wait-for-engine-fs-ready.js";
export * from "./webOsEngineFsResolverHelpers-04-normalize-engine-fs-state.js";

export const WebOsEngineFsResolver = {
  ...createWebOsEngineFsResolverMethods01(),
  ...createWebOsEngineFsResolverMethods02(),
  ...createWebOsEngineFsResolverMethods03()
};
