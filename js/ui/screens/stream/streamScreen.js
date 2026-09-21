import { Router } from "../../navigation/routerState.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { streamRepository } from "../../../data/repository/streamRepository.js";
import { addonRepository } from "../../../data/repository/addonRepository.js";
import { watchProgressRepository } from "../../../data/repository/watchProgressRepository.js";
import { isWatchProgressInProgress } from "../../../domain/model/watchProgress.js";
import { PlayerSettingsStore } from "../../../data/local/playerSettingsStore.js";
import { StreamPreferencesStore } from "../../../data/local/streamPreferencesStore.js";
import { PluginManager } from "../../../core/player/pluginManager.js";
import {
  PLUGIN_REPOSITORY_TYPES,
  isExecutableScraper,
  pluginSupportsType
} from "../../../core/player/pluginModels.js";
import {
  selectAutoPlayStream,
  isAutoPlayEffectivelyEnabled
} from "../../../core/streams/streamAutoPlaySelector.js";
import {
  orderSourceNames,
  orderStreamsByAddonOrder
} from "../../../core/streams/streamOrdering.js";
import { buildStreamResumeIdentity } from "../../../core/streams/streamResumeIdentity.js";
import { DirectDebridResolver } from "../../../core/debrid/directDebridResolver.js";
import {
  DirectDebridStreamPreparer,
  directDebridPreparationKey
} from "../../../core/debrid/directDebridStreamPreparer.js";
import { DebridStreamPresentation } from "../../../core/debrid/directDebridStreamPresentation.js";
import { contentTextDirection } from "../../../core/util/contentTextDirection.js";
import { WebOsEngineFsResolver } from "../../../core/p2p/webosEngineFsResolver.js";
import { TizenStreamingServerResolver } from "../../../core/p2p/tizenStreamingServerResolver.js";
import { DebridSettingsStore } from "../../../data/local/debridSettingsStore.js";
import { StreamBadgeSettingsStore } from "../../../data/local/streamBadgeSettingsStore.js";
import {
  ensureWebOsImageProxyReady,
  onWebOsImageProxyReady
} from "../../../core/media/imageProxy.js";
import {
  clearFailedAddonLogos,
  getCachedAddonLogoDisplayUrl,
  hasFailedAddonLogo,
  normalizeAddonLogoLookup,
  normalizeAddonLogoUrl,
  preloadAddonLogoImages,
  preloadAddonLogoUrls,
  rememberAddonLogoLookup,
  rememberFailedAddonLogo,
  requestAddonLogo,
  resolveAddonLogo
} from "../../../core/media/addonLogoCache.js";
import { Environment } from "../../../platform/environment.js";
import { getTvRuntimePerformanceProfile } from "../../../platform/tvRuntimePerformance.js";
import { WebOsLunaService } from "../../../platform/webos/webosLunaService.js";
import { I18n } from "../../../i18n/index.js";
import { localizedGenreText } from "../../../i18n/genreLabels.js";
import {
  matchStreamBadges,
  normalizeStreamBadgeChipColor,
  normalizeStreamBadgeRules
} from "../../../core/streams/streamBadgeRules.js";
import { normalizeMathematicalAlphanumericSymbols } from "../../../core/streams/streamDisplayText.js";
import { renderLoadingIndicator } from "../../components/loadingIndicator.js";
import {
  buildStreamVirtualModel,
  findStreamVirtualIndex,
  getStreamScrollTopForIndex,
  getStreamVirtualWindow,
  STREAM_VIRTUALIZATION_DEFAULT_ROW_EXTENT,
  STREAM_VIRTUALIZATION_MIN_WINDOW,
  STREAM_VIRTUALIZATION_OVERSCAN_PX,
  STREAM_VIRTUALIZATION_THRESHOLD
} from "./streamVirtualizer.js";
import { isStreamEmptyStateVisible } from "./streamEmptyState.js";
import { createStreamScreenMethods01 } from "./streamScreenMethods-01-cancel-scheduled-render.js";
import { createStreamScreenMethods02 } from "./streamScreenMethods-02-measure-stream-virtual-rows.js";
import { createStreamScreenMethods03 } from "./streamScreenMethods-03-mount.js";
import { createStreamScreenMethods04 } from "./streamScreenMethods-04-load-streams.js";
import { createStreamScreenMethods05 } from "./streamScreenMethods-05-maybe-auto-resume-stream.js";
import { createStreamScreenMethods06 } from "./streamScreenMethods-06-apply-addon-filter-dom-state.js";
import { createStreamScreenMethods07 } from "./streamScreenMethods-07-restore-stream-virtual-scroll-position.js";
import { createStreamScreenMethods08 } from "./streamScreenMethods-08-build-web-os-native-player-launch-parameters.js";
import { createStreamScreenMethods09 } from "./streamScreenMethods-09-render.js";
import { createStreamScreenMethods10 } from "./streamScreenMethods-10-play-stream.js";
import { createStreamScreenMethods11 } from "./streamScreenMethods-11-cleanup.js";

export {
  Router,
  ScreenUtils,
  streamRepository,
  addonRepository,
  watchProgressRepository,
  isWatchProgressInProgress,
  PlayerSettingsStore,
  StreamPreferencesStore,
  PluginManager,
  PLUGIN_REPOSITORY_TYPES,
  isExecutableScraper,
  pluginSupportsType,
  selectAutoPlayStream,
  isAutoPlayEffectivelyEnabled,
  orderSourceNames,
  orderStreamsByAddonOrder,
  buildStreamResumeIdentity,
  DirectDebridResolver,
  DirectDebridStreamPreparer,
  directDebridPreparationKey,
  DebridStreamPresentation,
  contentTextDirection,
  WebOsEngineFsResolver,
  TizenStreamingServerResolver,
  DebridSettingsStore,
  StreamBadgeSettingsStore,
  ensureWebOsImageProxyReady,
  onWebOsImageProxyReady,
  clearFailedAddonLogos,
  getCachedAddonLogoDisplayUrl,
  hasFailedAddonLogo,
  normalizeAddonLogoLookup,
  normalizeAddonLogoUrl,
  preloadAddonLogoImages,
  preloadAddonLogoUrls,
  rememberAddonLogoLookup,
  rememberFailedAddonLogo,
  requestAddonLogo,
  resolveAddonLogo,
  Environment,
  getTvRuntimePerformanceProfile,
  WebOsLunaService,
  I18n,
  localizedGenreText,
  matchStreamBadges,
  normalizeStreamBadgeChipColor,
  normalizeStreamBadgeRules,
  normalizeMathematicalAlphanumericSymbols,
  renderLoadingIndicator,
  buildStreamVirtualModel,
  findStreamVirtualIndex,
  getStreamScrollTopForIndex,
  getStreamVirtualWindow,
  STREAM_VIRTUALIZATION_DEFAULT_ROW_EXTENT,
  STREAM_VIRTUALIZATION_MIN_WINDOW,
  STREAM_VIRTUALIZATION_OVERSCAN_PX,
  STREAM_VIRTUALIZATION_THRESHOLD,
  isStreamEmptyStateVisible
};
export * from "./streamScreenHelpers-01-stream-badge-limit.js";
export * from "./streamScreenHelpers-02-flatten-streams.js";
export * from "./streamScreenHelpers-03-render-image-badge-chip.js";

export const StreamScreen = {
  ...createStreamScreenMethods01(),
  ...createStreamScreenMethods02(),
  ...createStreamScreenMethods03(),
  ...createStreamScreenMethods04(),
  ...createStreamScreenMethods05(),
  ...createStreamScreenMethods06(),
  ...createStreamScreenMethods07(),
  ...createStreamScreenMethods08(),
  ...createStreamScreenMethods09(),
  ...createStreamScreenMethods10(),
  ...createStreamScreenMethods11()
};
