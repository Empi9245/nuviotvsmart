import { PlayerController } from "../../../core/player/playerController.js";

import {
  audioTrackLabelConflictsWithCodec,
  formatAudioCodecName,
  getAuthoritativeAudioCodecValue,
  getAudioTrackCodecCompatibilityText,
  getAudioTrackLabelPrefix,
  mapAudioTrackNativeIndexes
} from "../../../core/player/audioTrackCodecMetadata.js";

import {
  canReleasePlayingNativeStartupAudioGate,
  hasOnlyImplicitStartupAudioOptions,
  selectStartupAudioFallbackOption,
  shouldAllowNativePlaybackDuringStartupAudioGate
} from "../../../core/player/startupAudioGatePolicy.js";

import {
  isRecoverableHlsFragmentTimeout,
  isExpiredStreamUrl,
  isTerminalHlsHttpStatus
} from "../../../core/player/hlsNetworkErrorPolicy.js";

import { deltaMsForKeyRepeat } from "../../../core/player/playerScrubRates.js";

import {
  ASPECT_MODE_DEFINITIONS,
  aspectModeIndex,
  normalizeAspectMode,
  parseAspectRatio,
  resolveAspectRender
} from "../../../core/player/playerAspect.js";

import { buildClockFormatOptions, resolveSystemHour12 } from "../../../core/player/clockFormat.js";

import { calculateRemainingPlaybackMilliseconds } from "../../../core/player/playbackEndTime.js";

import { resolveSubtitleStyleControlAvailability } from "../../../core/player/subtitlePresentationCapabilities.js";

import { shouldTreatAsNaturalPlaybackCompletion } from "../../../core/player/naturalPlaybackCompletion.js";

import { ensureWebOsImageProxyReady, normalizeImageUrl, onWebOsImageProxyReady } from "../../../core/media/imageProxy.js";

import {
  getCachedAddonLogoDisplayUrl,
  hasFailedAddonLogo,
  normalizeAddonLogoUrl,
  preloadAddonLogoImages,
  requestAddonLogo
} from "../../../core/media/addonLogoCache.js";

import { localMediaTracksRepository } from "../../../data/repository/localMediaTracksRepository.js";

import { localMediaSubtitleRepository } from "../../../data/repository/localMediaSubtitleRepository.js";

import { localMediaBitmapSubtitleRepository } from "../../../data/repository/localMediaBitmapSubtitleRepository.js";

import { localMediaEmbeddedSubtitleRepository } from "../../../data/repository/localMediaEmbeddedSubtitleRepository.js";

import { subtitleRepository } from "../../../data/repository/subtitleRepository.js";

import { streamRepository } from "../../../data/repository/streamRepository.js";

import { addonRepository } from "../../../data/repository/addonRepository.js";

import { parentalGuideRepository } from "../../../data/repository/parentalGuideRepository.js";

import { skipIntroRepository } from "../../../data/repository/skipIntroRepository.js";

import { PlayerSettingsStore } from "../../../data/local/playerSettingsStore.js";

import { DeviceLocalPlayerPreferences } from "../../../data/local/deviceLocalPlayerPreferences.js";

import { StreamBadgeSettingsStore } from "../../../data/local/streamBadgeSettingsStore.js";

import { TorrentSettingsStore } from "../../../data/local/torrentSettingsStore.js";

import { WebOsAudioCompatibilityStore } from "../../../data/local/webOsAudioCompatibilityStore.js";

import { matchStreamBadges } from "../../../core/streams/streamBadgeRules.js";

import { hasReleaseToken } from "../../../core/streams/releaseToken.js";

import { isAutoPlayEffectivelyEnabled, selectAutoPlayStream } from "../../../core/streams/streamAutoPlaySelector.js";

import { orderStreamsByAddonOrder } from "../../../core/streams/streamOrdering.js";

import { metaRepository } from "../../../data/repository/metaRepository.js";

import { I18n } from "../../../i18n/index.js";

import { Environment } from "../../../platform/environment.js";

import { TizenCapabilities } from "../../../platform/tizen/tizenCapabilities.js";

import { Router } from "../../navigation/routerState.js";

import { renderLoadingIndicator } from "../../components/loadingIndicator.js";

import { DirectDebridResolver } from "../../../core/debrid/directDebridResolver.js";

import { DebridStreamPresentation } from "../../../core/debrid/directDebridStreamPresentation.js";

import { TrackingScrobbleService } from "../../../data/repository/trackingScrobbleService.js";

import { WebOsEngineFsResolver } from "../../../core/p2p/webosEngineFsResolver.js";

import { TizenStreamingServerResolver } from "../../../core/p2p/tizenStreamingServerResolver.js";

import { TizenEngineFsService } from "../../../platform/tizen/tizenEngineFsService.js";

import { requestWebOsCompanionService, subscribeWebOsCompanionService } from "../../../platform/webos/webosCompanionService.js";

import { WebOsLunaService } from "../../../platform/webos/webosLunaService.js";

import { StreamPreferencesStore } from "../../../data/local/streamPreferencesStore.js";

import { buildStreamResumeIdentity } from "../../../core/streams/streamResumeIdentity.js";

import { TrackPreferencesStore } from "../../../data/local/trackPreferencesStore.js";

import { SubtitleDelayPreferencesStore } from "../../../data/local/subtitleDelayPreferencesStore.js";

import {
  SUBTITLE_AUTO_SYNC_MARGIN_MS,
  SUBTITLE_AUTO_SYNC_MAX_VISIBLE_CUES,
  SUBTITLE_DELAY_MAX_MS,
  SUBTITLE_DELAY_MIN_MS,
  SUBTITLE_DELAY_OVERLAY_TIMEOUT_MS,
  SUBTITLE_DELAY_STEP_MS,
  calculateSubtitleAutoSyncDelayMs,
  formatSubtitleAutoSyncDelay,
  formatSubtitleAutoSyncTimestamp,
  sanitizeSubtitleAutoSyncCueText,
  selectSubtitleAutoSyncVisibleCues
} from "../../../core/player/subtitleAutoSync.js";

import { buildSubtitleRequestHeaders } from "../../../core/player/subtitleRequestHeaders.js";

import { normalizeSubtitleLanguageAlias } from "../../../core/player/subtitleLanguageAliases.js";

import { mdbListRatingIcon } from "../../../core/util/mdbListRatingStatus.js";

import {
  hasEpisodeAired as hasEpisodeAiredRule,
  shouldEnterStillWatchingPrompt,
  shouldShowNextEpisodeCard as shouldShowNextEpisodeCardRule
} from "./playerNextEpisodeRules.js";

import {
  findActiveSkipInterval as findActiveSkipIntervalRule,
  findFollowingPostCreditsScene,
  getSkipIntervalTargetSeconds
} from "../../../core/player/skipIntervalRules.js";

import { normalizePlaybackDisplayLineBreaks, resolvePlaybackSourceName } from "./playbackDisplayText.js";

import { formatHeroRuntime } from "../detail/episodeCardMetadata.js";

import { localizedGenreLabel } from "../../../i18n/genreLabels.js";

import { contentTextDirection } from "../../../core/util/contentTextDirection.js";

import {
  buildInlineYoutubePlayerUrl,
  PostPlayRecommendationController,
  POST_PLAY_IN_APP_TRAILER_PLAYBACK_ENABLED
} from "./postPlayRecommendationController.js";

import { normalizePlayerEpisodeMetadata, resolvePostPlayEpisodeMetadataResolved } from "../../../core/player/playerEpisodeMetadata.js";

import {
  buildHtmlSubtitleCue,
  getSubtitleAssAlignment,
  getSubtitleAssAlignmentSettings,
  parseVttCueLayout
} from "../../../core/player/subtitleCueLayout.js";

import {
  SUBTITLE_VERTICAL_OFFSET_DEFAULT,
  SUBTITLE_VERTICAL_OFFSET_PLAYER_STEP,
  formatSubtitleVerticalOffset,
  getSubtitleVerticalOffsetVh,
  getSubtitleVerticalResidualOffsetVh,
  normalizeSubtitleVerticalOffset,
  splitSubtitleVerticalOffset
} from "../../../core/player/subtitleVerticalOffset.js";

import {
  SUBTITLE_TEXT_OPACITY_STEP,
  normalizeSubtitleTextOpacity,
  subtitleTextColorWithOpacity
} from "../../../core/player/subtitleTextOpacity.js";

import {
  BitmapSubtitleDecoder,
  normalizeBitmapSubtitleFormat,
  supportsBitmapSubtitleDecoding,
  warmBitmapSubtitleDecoder
} from "../../../core/player/bitmapSubtitleDecoder.js";

import { isAssSubtitle, convertAssBodyToVtt } from "../../../core/player/assSubtitle.js";

import { createAssRenderer } from "../../../core/player/assRenderer.js";

import { decodeSubtitleResponseBody } from "../../../core/player/subtitleCharsetDetector.js";

import { sanitizeSubtitleMojibake } from "../../../core/player/subtitleMojibakeSanitizer.js";

import {
  SUBTITLE_VIRTUALIZATION_DEFAULT_ROW_EXTENT,
  SUBTITLE_VIRTUALIZATION_MIN_WINDOW,
  SUBTITLE_VIRTUALIZATION_OVERSCAN_PX,
  SUBTITLE_VIRTUALIZATION_THRESHOLD,
  buildSubtitleVirtualModel,
  getSubtitleScrollTopForIndex,
  getSubtitleVirtualWindow
} from "./subtitleVirtualizer.js";

import {
  isTruthyTrackFlag,
  getTrackLanguageValue,
  normalizeTrackLanguageCode,
  inferTrackLanguageCodeFromText
} from "./playerScreenHelpers-05-normalize-track-language-code.js";
import {
  getTrackMetadataStrings,
  pushUniqueText,
  isGenericSubtitleTrackLabel
} from "./playerScreenHelpers-03-normalize-web-os-html-subtitle-text.js";
import { cleanDisplayText, t } from "./playerScreenHelpers-02-language-code-aliases.js";
import { detectTrackLanguageVariant } from "./playerScreenHelpers-07-detect-track-language-variant.js";

export function getTrackFlagCandidates(track = {}, keys = []) {
  const values = [];
  const pushFrom = (source) => {
    if (!source || typeof source !== "object") {
      return;
    }
    keys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        values.push(source[key]);
      }
    });
  };

  pushFrom(track);
  pushFrom(track?.extraInfo);
  pushFrom(track?.attrs);
  pushFrom(track?.tags);
  pushFrom(track?.disposition);
  pushFrom(track?.raw);
  pushFrom(track?.raw?.extraInfo);
  pushFrom(track?.raw?.attrs);
  pushFrom(track?.raw?.tags);
  pushFrom(track?.raw?.disposition);
  return values;
}

export function hasTruthyTrackFlag(track = {}, keys = []) {
  return getTrackFlagCandidates(track, keys).some((value) => isTruthyTrackFlag(value));
}

export function isSdhSubtitleTrack(track = {}) {
  if (
    isTruthyTrackFlag(track?.sdh) ||
    isTruthyTrackFlag(track?.isSdh) ||
    isTruthyTrackFlag(track?.is_sdh) ||
    isTruthyTrackFlag(track?.hearingImpaired) ||
    isTruthyTrackFlag(track?.hearing_impaired)
  ) {
    return true;
  }
  const searchText = getTrackMetadataStrings(track).join(" ").toLowerCase();
  return /\b(sdh|hearing impaired|hearing-impaired|hard of hearing|hoh)\b/.test(searchText);
}

export function isClosedCaptionTrack(track = {}) {
  if (
    isTruthyTrackFlag(track?.cc) ||
    isTruthyTrackFlag(track?.closedCaption) ||
    isTruthyTrackFlag(track?.closedCaptions) ||
    isTruthyTrackFlag(track?.closed_caption)
  ) {
    return true;
  }
  const searchText = getTrackMetadataStrings(track).join(" ").toLowerCase();
  return /\b(cc|closed captions?|closed-caption(?:ed)?|captioned)\b/.test(searchText);
}

export function detectChannelLayout(value) {
  const text = cleanDisplayText(value).toLowerCase();
  if (!text) {
    return "";
  }
  const explicitLayout = text.match(/\b(7\.1|5\.1|2\.1|2\.0|1\.0)\b/);
  if (explicitLayout) {
    if (explicitLayout[1] === "2.0") {
      return t("player.track.stereo", {}, "Stereo");
    }
    return explicitLayout[1];
  }
  const numericMatch = text.match(/\b([0-9]{1,2})(?:ch| channels?)\b/) || text.match(/^([0-9]{1,2})(?:\/[a-z0-9.]+)?$/);
  if (!numericMatch) {
    return "";
  }
  const channels = Number(numericMatch[1]);
  if (!Number.isFinite(channels) || channels <= 0) {
    return "";
  }
  if (channels >= 8) {
    return "7.1";
  }
  if (channels >= 6) {
    return "5.1";
  }
  if (channels === 2) {
    return t("player.track.stereo", {}, "Stereo");
  }
  if (channels === 1) {
    return "1.0";
  }
  return `${channels}ch`;
}

export function getTrackDescriptorLabels(track = {}) {
  const descriptors = [];
  const metadataStrings = getTrackMetadataStrings(track);
  const searchText = metadataStrings.join(" ").toLowerCase();

  const channelCandidates = [track?.channels, ...metadataStrings];
  for (const candidate of channelCandidates) {
    const channelLayout = detectChannelLayout(candidate);
    if (channelLayout) {
      pushUniqueText(descriptors, channelLayout);
      break;
    }
  }

  if (!descriptors.length) {
    if (/\bstereo\b/.test(searchText)) {
      pushUniqueText(descriptors, t("player.track.stereo", {}, "Stereo"));
    } else if (/\bsurround\b/.test(searchText)) {
      pushUniqueText(descriptors, t("player.track.surround", {}, "Surround"));
    }
  }

  if (/\b(atmos|joc)\b/.test(searchText)) {
    pushUniqueText(descriptors, "Dolby Atmos");
  } else if (/\b(eac3|ec-3|ddp|dolby digital plus)\b/.test(searchText)) {
    pushUniqueText(descriptors, "Dolby Digital Plus");
  } else if (/\b(ac3|ac-3|dolby digital)\b/.test(searchText)) {
    pushUniqueText(descriptors, "Dolby Digital");
  } else if (/\b(truehd)\b/.test(searchText)) {
    pushUniqueText(descriptors, "TrueHD");
  } else if (/\b(dts:x|dts-hd|dts)\b/.test(searchText)) {
    pushUniqueText(descriptors, "DTS");
  } else if (/\b(aac|mp4a)\b/.test(searchText)) {
    pushUniqueText(descriptors, "AAC");
  } else if (/\b(opus)\b/.test(searchText)) {
    pushUniqueText(descriptors, "Opus");
  } else if (/\b(flac)\b/.test(searchText)) {
    pushUniqueText(descriptors, "FLAC");
  } else if (/\b(mp3|mpeg audio)\b/.test(searchText)) {
    pushUniqueText(descriptors, "MP3");
  }

  if (isForcedSubtitleTrack(track)) {
    pushUniqueText(descriptors, t("sub_forced_lang", {}, "Forced"));
  }
  if (isSdhSubtitleTrack(track)) {
    pushUniqueText(descriptors, "SDH");
  }
  if (isClosedCaptionTrack(track)) {
    pushUniqueText(descriptors, "CC");
  }
  if (/\b(commentary)\b/.test(searchText)) {
    pushUniqueText(descriptors, t("player.track.commentary", {}, "Commentary"));
  }
  if (/\b(audio description|audio-description|describes-video|describes video|descriptive)\b/.test(searchText)) {
    pushUniqueText(descriptors, t("player.track.audioDescription", {}, "Audio description"));
  }

  return descriptors;
}

export function isForcedSubtitleTrack(track = {}) {
  if (
    hasTruthyTrackFlag(track, [
      "forced",
      "isForced",
      "is_forced",
      "forcedSubtitle",
      "forced_subtitle",
      "flagForced",
      "flag_forced",
      "defaultForced",
      "default_forced",
      "trackForced",
      "track_forced"
    ])
  ) {
    return true;
  }
  const searchText = getTrackMetadataStrings(track).join(" ").toLowerCase();
  const hasForcedName = /\b(forced|forc|forzato|forzata|forzati|forzate)\b/.test(searchText);
  // Match Android TV: anime releases commonly label forced dialogue tracks as
  // "Songs & Signs" without exposing "forced" in the track name.
  const isSongsAndSigns = searchText.includes("songs") && searchText.includes("sign");
  return hasForcedName || isSongsAndSigns;
}

export function isForcedAddonSubtitle(subtitle = {}) {
  return [subtitle?.id, subtitle?.url, subtitle?.addonName]
    .map((value) => cleanDisplayText(value).toLowerCase())
    .some((value) => value.includes("forced"));
}

export function getSubtitleEntryLanguageSource(entry = {}) {
  const track = entry?.track || entry;
  const explicitLanguage = getTrackLanguageValue(track) || getTrackLanguageValue(entry);
  if (explicitLanguage) {
    const normalizedLanguage = normalizeTrackLanguageCode(explicitLanguage);
    const metadataLanguage = inferTrackLanguageCodeFromText(getTrackMetadataStrings(track).join(" "));
    if (normalizedLanguage?.split("-")[0] === "ms" && metadataLanguage === "id") {
      return "id";
    }
    return detectTrackLanguageVariant(track, explicitLanguage);
  }
  const secondaryLanguage = normalizeTrackLanguageCode(entry.secondary) ? entry.secondary : "";
  if (secondaryLanguage) {
    return secondaryLanguage;
  }
  const fallbackLabel = entry.label || entry.title || "";
  return isGenericSubtitleTrackLabel(fallbackLabel) ? "" : fallbackLabel;
}
