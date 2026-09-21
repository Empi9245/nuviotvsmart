import { Router } from "../../navigation/routerState.js";

import { ScreenUtils } from "../../navigation/screen.js";

import { addonRepository } from "../../../data/repository/addonRepository.js";

import { LocalStore } from "../../../core/storage/localStore.js";

import { SessionStore } from "../../../core/storage/sessionStore.js";

import { TmdbSettingsStore } from "../../../data/local/tmdbSettingsStore.js";

import { HomeCatalogStore } from "../../../data/local/homeCatalogStore.js";

import { accentColorForTheme, ThemeStore } from "../../../data/local/themeStore.js";

import { MemberAccessRepository } from "../../../data/remote/supabase/memberAccessRepository.js";

import { ThemeManager } from "../../theme/themeManager.js";

import { ThemeColors } from "../../theme/themeColors.js";

import { availableThemeIds, resolveThemeName } from "../../theme/themeAccess.js";

import { renderMemberBrandWordmark } from "../../components/memberBrandWordmark.js";

import { PlayerSettingsStore } from "../../../data/local/playerSettingsStore.js";

import {
  SUBTITLE_VERTICAL_OFFSET_DEFAULT,
  SUBTITLE_VERTICAL_OFFSET_MAX,
  SUBTITLE_VERTICAL_OFFSET_MIN,
  normalizeSubtitleVerticalOffset
} from "../../../core/player/subtitleVerticalOffset.js";

import {
  SUBTITLE_TEXT_OPACITY_MAX,
  SUBTITLE_TEXT_OPACITY_MIN,
  SUBTITLE_TEXT_OPACITY_STEP,
  normalizeSubtitleTextOpacity
} from "../../../core/player/subtitleTextOpacity.js";

import { TorrentSettingsStore } from "../../../data/local/torrentSettingsStore.js";

import { WebOsAudioCompatibilityStore } from "../../../data/local/webOsAudioCompatibilityStore.js";

import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";

import { ExperienceModeStore } from "../../../data/local/experienceModeStore.js";

import { MdbListSettingsStore } from "../../../data/local/mdbListSettingsStore.js";

import { AnimeSkipSettingsStore } from "../../../data/local/animeSkipSettingsStore.js";

import {
  DEBRID_SETTINGS_DEFAULTS,
  DEBRID_SORT_PROFILES,
  DEBRID_STREAM_AUDIO_CHANNELS,
  DEBRID_STREAM_AUDIO_TAGS,
  DEBRID_STREAM_ENCODES,
  DEBRID_STREAM_LANGUAGES,
  DEBRID_STREAM_QUALITIES,
  DEBRID_STREAM_RESOLUTIONS,
  DEBRID_STREAM_VISUAL_TAGS,
  DEFAULT_STREAM_PREFERENCES,
  normalizeDebridStreamPreferences,
  DebridSettingsStore
} from "../../../data/local/debridSettingsStore.js";

import { StreamBadgeSettingsStore } from "../../../data/local/streamBadgeSettingsStore.js";

import { DebridApi } from "../../../data/remote/api/debridApi.js";

import { DEBRID_AUTH_METHODS, DebridProviders } from "../../../core/debrid/debridProviders.js";

import { DEBRID_DEVICE_AUTH_STATUS, DebridDeviceAuthService } from "../../../core/debrid/debridDeviceAuthService.js";

import { ProfileManager } from "../../../core/profile/profileManager.js";

import { AuthManager } from "../../../core/auth/authManager.js";

import { SupabaseApi } from "../../../data/remote/supabase/supabaseApi.js";

import { Platform } from "../../../platform/index.js";

import { TizenCapabilities } from "../../../platform/tizen/tizenCapabilities.js";

import { isFastHorizontalNavigationEnabled } from "../../../platform/sharedKeys.js";

import { CW_DISPLAY_SNAPSHOT_KEY, CW_ENRICHMENT_CACHE_KEY } from "../home/homeConstants.js";

import { I18n } from "../../../i18n/index.js";

import { isContentRtl } from "../../../core/util/contentTextDirection.js";

import { PluginManager } from "../../../core/player/pluginManager.js";

import { QrCodeGenerator } from "../../../core/qr/qrCodeGenerator.js";

import { TraktAuthService } from "../../../data/repository/traktAuthService.js";

import { mdbListRepository } from "../../../data/repository/mdbListRepository.js";

import {
  getStreamBadgePreviewSections,
  normalizeStreamBadgeChipColor,
  STREAM_BADGE_IMPORT_LIMIT
} from "../../../core/streams/streamBadgeRules.js";

import {
  TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL,
  TraktLibrarySourceMode,
  TraktSettingsStore,
  WatchProgressSource
} from "../../../data/local/traktSettingsStore.js";

import {
  activateLegacySidebarAction,
  bindRootSidebarEvents,
  getRootSidebarNodes,
  getRootSidebarSelectedNode,
  getSidebarProfileState,
  isModernSidebarBlurAvailable,
  isSelectedSidebarAction,
  isRootSidebarNode,
  renderRootSidebar,
  setModernSidebarExpanded,
  setLegacySidebarExpanded
} from "../../components/sidebarNavigation.js";

import { renderLoadingIndicator } from "../../components/loadingIndicator.js";

import { getLatestAppUpdate } from "../../../core/update/appUpdateService.js";

import { showAppUpdatePrompt } from "../../components/appUpdatePrompt.js";

import { debridOptionList } from "./settingsScreenHelpers-05-mask-value.js";

export function debridRuleRows(preferences = {}) {
  return [
    {
      field: "preferredResolutions",
      titleKey: "debrid_picker_preferred_resolutions_title",
      subtitleKey: "debrid_picker_preferred_resolutions_subtitle",
      dialogTitleKey: "debrid_stream_resolutions_preferred",
      options: debridOptionList(DEBRID_STREAM_RESOLUTIONS),
      defaultWhenEmpty: DEFAULT_STREAM_PREFERENCES.preferredResolutions
    },
    {
      field: "requiredResolutions",
      titleKey: "debrid_picker_required_resolutions_title",
      subtitleKey: "debrid_picker_required_resolutions_subtitle",
      dialogTitleKey: "debrid_stream_resolutions_required",
      options: debridOptionList(DEBRID_STREAM_RESOLUTIONS)
    },
    {
      field: "excludedResolutions",
      titleKey: "debrid_picker_excluded_resolutions_title",
      subtitleKey: "debrid_picker_excluded_resolutions_subtitle",
      dialogTitleKey: "debrid_stream_resolutions_excluded",
      options: debridOptionList(DEBRID_STREAM_RESOLUTIONS)
    },
    {
      field: "preferredQualities",
      titleKey: "debrid_picker_preferred_qualities_title",
      subtitleKey: "debrid_picker_preferred_qualities_subtitle",
      dialogTitleKey: "debrid_stream_qualities_preferred",
      options: debridOptionList(DEBRID_STREAM_QUALITIES),
      defaultWhenEmpty: DEFAULT_STREAM_PREFERENCES.preferredQualities
    },
    {
      field: "requiredQualities",
      titleKey: "debrid_picker_required_qualities_title",
      subtitleKey: "debrid_picker_required_qualities_subtitle",
      dialogTitleKey: "debrid_stream_qualities_required",
      options: debridOptionList(DEBRID_STREAM_QUALITIES)
    },
    {
      field: "excludedQualities",
      titleKey: "debrid_picker_excluded_qualities_title",
      subtitleKey: "debrid_picker_excluded_qualities_subtitle",
      dialogTitleKey: "debrid_stream_qualities_excluded",
      options: debridOptionList(DEBRID_STREAM_QUALITIES)
    },
    {
      field: "preferredVisualTags",
      titleKey: "debrid_picker_preferred_visual_tags_title",
      subtitleKey: "debrid_picker_preferred_visual_tags_subtitle",
      dialogTitleKey: "debrid_stream_visual_tags_preferred",
      options: debridOptionList(DEBRID_STREAM_VISUAL_TAGS),
      defaultWhenEmpty: DEFAULT_STREAM_PREFERENCES.preferredVisualTags
    },
    {
      field: "requiredVisualTags",
      titleKey: "debrid_picker_required_visual_tags_title",
      subtitleKey: "debrid_picker_required_visual_tags_subtitle",
      dialogTitleKey: "debrid_stream_visual_tags_required",
      options: debridOptionList(DEBRID_STREAM_VISUAL_TAGS)
    },
    {
      field: "excludedVisualTags",
      titleKey: "debrid_picker_excluded_visual_tags_title",
      subtitleKey: "debrid_picker_excluded_visual_tags_subtitle",
      dialogTitleKey: "debrid_stream_visual_tags_excluded",
      options: debridOptionList(DEBRID_STREAM_VISUAL_TAGS)
    },
    {
      field: "preferredAudioTags",
      titleKey: "debrid_picker_preferred_audio_tags_title",
      subtitleKey: "debrid_picker_preferred_audio_tags_subtitle",
      dialogTitleKey: "debrid_stream_audio_tags_preferred",
      options: debridOptionList(DEBRID_STREAM_AUDIO_TAGS),
      defaultWhenEmpty: DEFAULT_STREAM_PREFERENCES.preferredAudioTags
    },
    {
      field: "requiredAudioTags",
      titleKey: "debrid_picker_required_audio_tags_title",
      subtitleKey: "debrid_picker_required_audio_tags_subtitle",
      dialogTitleKey: "debrid_stream_audio_tags_required",
      options: debridOptionList(DEBRID_STREAM_AUDIO_TAGS)
    },
    {
      field: "excludedAudioTags",
      titleKey: "debrid_picker_excluded_audio_tags_title",
      subtitleKey: "debrid_picker_excluded_audio_tags_subtitle",
      dialogTitleKey: "debrid_stream_audio_tags_excluded",
      options: debridOptionList(DEBRID_STREAM_AUDIO_TAGS)
    },
    {
      field: "preferredAudioChannels",
      titleKey: "debrid_picker_preferred_audio_channels_title",
      subtitleKey: "debrid_picker_preferred_audio_channels_subtitle",
      dialogTitleKey: "debrid_stream_channels_preferred",
      options: debridOptionList(DEBRID_STREAM_AUDIO_CHANNELS),
      defaultWhenEmpty: DEFAULT_STREAM_PREFERENCES.preferredAudioChannels
    },
    {
      field: "requiredAudioChannels",
      titleKey: "debrid_picker_required_audio_channels_title",
      subtitleKey: "debrid_picker_required_audio_channels_subtitle",
      dialogTitleKey: "debrid_stream_channels_required",
      options: debridOptionList(DEBRID_STREAM_AUDIO_CHANNELS)
    },
    {
      field: "excludedAudioChannels",
      titleKey: "debrid_picker_excluded_audio_channels_title",
      subtitleKey: "debrid_picker_excluded_audio_channels_subtitle",
      dialogTitleKey: "debrid_stream_channels_excluded",
      options: debridOptionList(DEBRID_STREAM_AUDIO_CHANNELS)
    },
    {
      field: "preferredEncodes",
      titleKey: "debrid_picker_preferred_encodes_title",
      subtitleKey: "debrid_picker_preferred_encodes_subtitle",
      dialogTitleKey: "debrid_stream_encodes_preferred",
      options: debridOptionList(DEBRID_STREAM_ENCODES),
      defaultWhenEmpty: DEFAULT_STREAM_PREFERENCES.preferredEncodes
    },
    {
      field: "requiredEncodes",
      titleKey: "debrid_picker_required_encodes_title",
      subtitleKey: "debrid_picker_required_encodes_subtitle",
      dialogTitleKey: "debrid_stream_encodes_required",
      options: debridOptionList(DEBRID_STREAM_ENCODES)
    },
    {
      field: "excludedEncodes",
      titleKey: "debrid_picker_excluded_encodes_title",
      subtitleKey: "debrid_picker_excluded_encodes_subtitle",
      dialogTitleKey: "debrid_stream_encodes_excluded",
      options: debridOptionList(DEBRID_STREAM_ENCODES)
    },
    {
      field: "preferredLanguages",
      titleKey: "debrid_picker_preferred_languages_title",
      subtitleKey: "debrid_picker_preferred_languages_subtitle",
      dialogTitleKey: "debrid_stream_languages_preferred",
      options: debridOptionList(DEBRID_STREAM_LANGUAGES)
    },
    {
      field: "requiredLanguages",
      titleKey: "debrid_picker_required_languages_title",
      subtitleKey: "debrid_picker_required_languages_subtitle",
      dialogTitleKey: "debrid_stream_languages_required",
      options: debridOptionList(DEBRID_STREAM_LANGUAGES)
    },
    {
      field: "excludedLanguages",
      titleKey: "debrid_picker_excluded_languages_title",
      subtitleKey: "debrid_picker_excluded_languages_subtitle",
      dialogTitleKey: "debrid_stream_languages_excluded",
      options: debridOptionList(DEBRID_STREAM_LANGUAGES)
    },
    {
      field: "requiredReleaseGroups",
      titleKey: "debrid_picker_required_release_groups_title",
      subtitleKey: "debrid_picker_required_release_groups_subtitle",
      dialogTitleKey: "debrid_stream_release_groups_required",
      textList: true
    },
    {
      field: "excludedReleaseGroups",
      titleKey: "debrid_picker_excluded_release_groups_title",
      subtitleKey: "debrid_picker_excluded_release_groups_subtitle",
      dialogTitleKey: "debrid_stream_release_groups_excluded",
      textList: true
    }
  ].map((row) => ({
    ...row,
    selectedValues: Array.isArray(preferences[row.field]) ? preferences[row.field] : []
  }));
}

export async function validateDebridApiKey(providerId, apiKey) {
  const normalized = String(apiKey || "").trim();
  if (!normalized) {
    return true;
  }
  const provider = DebridProviders.byId(providerId);
  if (!provider) {
    return false;
  }
  if (provider.id === "torbox") {
    return DebridApi.validateTorboxApiKey(normalized);
  }
  if (provider.id === "premiumize") {
    return DebridApi.validatePremiumizeApiKey(normalized);
  }
  if (provider.id === "realdebrid") {
    return DebridApi.validateRealDebridApiKey(normalized);
  }
  return false;
}

export function normalizeSelectableSubtitleLanguageCode(language) {
  const code = String(language ?? "")
    .trim()
    .toLowerCase();
  if (!code) {
    return "off";
  }
  switch (code) {
    case "pt-br":
    case "pt_br":
    case "br":
    case "pob":
      return "pt-br";
    case "pt-pt":
    case "pt_pt":
    case "por":
      return "pt";
    case "forced":
    case "force":
    case "forc":
      return "forced";
    case "none":
    case "off":
      return "off";
    default:
      return code;
  }
}
