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

import { Router } from "../../navigation/router.js";

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

import { cleanDisplayText, MAX_PAUSE_OVERLAY_CAST } from "./playerScreenHelpers-02-language-code-aliases.js";

export function normalizeWebOsHtmlSubtitleText(value) {
  const text = String(value ?? "");
  // LG webOS renders U+2026 at the mid-line in the HTML subtitle overlay. Keep the
  // source cue unchanged and use the verified baseline-safe equivalent only here.
  return Environment.isWebOS() ? text.replace(/\u2026/g, "...") : text;
}

export function stableSubtitleTextKey(value = "") {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeSubtitleRenderMode(value) {
  return String(value || "")
    .trim()
    .toLowerCase() === "html"
    ? "html"
    : "native";
}

export function capitalizeDisplayLabel(value) {
  const text = cleanDisplayText(value);
  if (!text) {
    return "";
  }
  const locale = typeof I18n.getLocale === "function" ? I18n.getLocale() : undefined;
  return `${text.charAt(0).toLocaleUpperCase(locale)}${text.slice(1)}`;
}

export function extractReleaseYear(value) {
  return String(value ?? "").match(/\b(19|20)\d{2}\b/)?.[0] || "";
}

export function normalizeComparableText(value) {
  return cleanDisplayText(value).toLowerCase().replace(/[_-]+/g, " ");
}

export function extractPauseOverlayCast(data = {}) {
  const result = [];
  const seen = new Set();
  const collections = [data?.castItems, data?.castMembers, data?.cast, data?.credits?.cast];

  const pushEntry = (entry) => {
    if (!entry) {
      return;
    }
    const name =
      typeof entry === "string" ? cleanDisplayText(entry) : cleanDisplayText(entry?.name || entry?.fullName || entry?.actor || "");
    if (!name) {
      return;
    }
    const character = typeof entry === "string" ? "" : cleanDisplayText(entry?.character || entry?.role || "");
    const key = normalizeComparableText(`${name}|${character}`);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push({ name, character });
  };

  collections.forEach((collection) => {
    if (!Array.isArray(collection)) {
      return;
    }
    collection.forEach(pushEntry);
  });

  return result.slice(0, MAX_PAUSE_OVERLAY_CAST);
}

export function pushUniqueText(target, value) {
  const text = cleanDisplayText(value);
  if (!text) {
    return;
  }
  const normalized = normalizeComparableText(text);
  if (target.some((entry) => normalizeComparableText(entry) === normalized)) {
    return;
  }
  target.push(text);
}

export function flattenTrackMetadata(value, into = []) {
  if (value === null || value === undefined) {
    return into;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => flattenTrackMetadata(entry, into));
    return into;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((entry) => flattenTrackMetadata(entry, into));
    return into;
  }
  const text = cleanDisplayText(value);
  if (text) {
    into.push(text);
  }
  return into;
}

export function isGenericAudioTrackLabel(value) {
  const normalized = normalizeComparableText(value);
  return (
    normalized === "" ||
    /^audio\s*\d*$/.test(normalized) ||
    /^track\s*\d*$/.test(normalized) ||
    normalized === "soundhandler" ||
    normalized === "sound handler"
  );
}

export function isGenericSubtitleTrackLabel(value) {
  const normalized = normalizeComparableText(value);
  return /^subtitles?\s*\d*$/.test(normalized) || /^text\s*\d*$/.test(normalized);
}

export function getTrackMetadataStrings(track = {}) {
  const values = [];
  [
    track?.name,
    track?.label,
    track?.title,
    track?.language,
    track?.lang,
    track?.channels,
    track?.characteristics,
    track?.kind,
    track?.role,
    track?.accessibility,
    track?.forced,
    track?.isForced,
    track?.sdh,
    track?.isSdh,
    track?.is_sdh,
    track?.cc,
    track?.closedCaption,
    track?.closedCaptions,
    track?.closed_caption,
    track?.hearingImpaired,
    track?.hearing_impaired,
    track?.codec,
    track?.codecs,
    track?.audioCodec,
    track?.codecProfile,
    track?.profile,
    track?.codec_profile,
    track?.codec_id,
    track?.codec_name,
    track?.codec_tag_string,
    track?.mimeType,
    track?.mime_type,
    track?.sampleMimeType,
    track?.sample_mime_type,
    track?.format,
    track?.format_name,
    track?.format_long_name,
    track?.channelCount,
    track?.audioSampleRate,
    track?.sampleRate,
    track?.extraInfo,
    track?.attrs
  ].forEach((value) => flattenTrackMetadata(value, values));
  return values;
}

export function normalizeTrackCodecText(value) {
  return cleanDisplayText(value).toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function isTx3gSubtitleCodec(value) {
  const normalized = normalizeTrackCodecText(value);
  return ["TX3G", "MOV TEXT", "MPEG 4 TIMED TEXT", "MPEG-4 TIMED TEXT"].includes(normalized);
}

export function getTx3gSubtitleCodecValue(track = {}) {
  return (
    track?.codec ||
    track?.subtitleCodec ||
    track?.codec_name ||
    track?.codec_id ||
    track?.format ||
    track?.raw?.codec ||
    track?.raw?.codec_name ||
    track?.raw?.codec_id ||
    track?.raw?.format ||
    ""
  );
}

export function isTx3gSubtitleTrack(track = {}) {
  return isTx3gSubtitleCodec(getTx3gSubtitleCodecValue(track));
}

export function isSubRipSubtitleCodec(value) {
  const normalized = cleanDisplayText(value)
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  return ["subrip", "srt", "stext/utf8", "stext/srt", "text/utf8", "text/srt", "text/xsubrip", "application/xsubrip"].includes(normalized);
}

export const SUBTITLE_CODEC_DISPLAY_LABELS = new Map([
  ["application/pgs", "PGS"],
  ["hdmv/pgs", "PGS"],
  ["hdmvpgs", "PGS"],
  ["pgs", "PGS"],
  ["application/dvbsubs", "DVB"],
  ["application/dvbsubtitle", "DVB"],
  ["dvb", "DVB"],
  ["dvbsub", "DVB"],
  ["dvbsubs", "DVB"],
  ["application/ttml+xml", "TTML"],
  ["application/ttml", "TTML"],
  ["text/ttml", "TTML"],
  ["ttml", "TTML"],
  ["application/tx3g", "TX3G"],
  ["text/tx3g", "TX3G"],
  ["tx3g", "TX3G"],
  ["application/xvobsub", "VobSub"],
  ["vobsub", "VobSub"],
  ["application/xwebvtt", "VTT"],
  ["text/vtt", "VTT"],
  ["text/webvtt", "VTT"],
  ["vtt", "VTT"],
  ["webvtt", "VTT"]
]);
