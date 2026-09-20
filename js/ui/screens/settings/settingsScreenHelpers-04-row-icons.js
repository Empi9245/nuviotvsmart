import { Router } from "../../navigation/router.js";

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

import { SECTION_ICONS } from "./settingsScreenHelpers-03-clamp-subtitle-text-opacity.js";

export const ROW_ICONS = {
  external: '<path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14z"></path><path d="M5 5h7v2H7v10h10v-5h2v7H5z"></path>',
  chevron: '<path d="m9 6 6 6-6 6"></path>',
  expand: '<path d="m7 10 5 5 5-5"></path>',
  qr: '<path d="M3 3h7v7H3zm2 2v3h3V5zm6-2h2v2h-2zm3 0h7v7h-7zm2 2v3h3V5zM3 14h7v7H3zm2 2v3h3v-3zm8-1h2v2h-2zm2 2h2v2h-2zm-4 0h2v2h-2zm8-3h2v2h-2zm-6 6h2v2h-2zm3-3h5v5h-5zm2 2v1h1v-1z"></path>',
  phone: '<path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 3v13h10V5zm4 15h2v1h-2z"></path>',
  plus: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"></path>',
  back: '<path d="m15 6-6 6 6 6"></path>',
  check: '<path d="m5 13 4 4L19 7"></path>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4"></path><path d="M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"></path>',
  trash:
    '<path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 12h10l1-12"></path><path d="M9 7V4h6v3"></path>',
  plugins:
    '<path d="m11 17-5-5.28 1.4-1.42 3.6 3.8L17.6 7.5 19 8.92 11 17zM12 22q-2.075 0-3.9-.788t-3.175-2.137Q3.6 17.725 2.8 15.9T2 12q0-2.075.788-3.9t2.137-3.175Q6.275 3.6 8.1 2.8T12 2q2.075 0 3.9.788t3.175 2.137Q20.4 6.275 21.2 8.1T22 12q0 2.075-.788 3.9t-2.137 3.175Q17.725 20.4 15.9 21.2T12 22z"></path>'
};

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function formatSettingsVersionLabel(value) {
  const normalized = String(value || "").trim();
  const shortMatch = normalized.match(/^(\d+\.\d+)\.0$/);
  if (shortMatch) {
    return shortMatch[1];
  }
  return normalized || "0.0.0";
}

export function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

export function arePluginsSupported() {
  return TizenCapabilities.canUsePlugins();
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

export function renderLayoutPreviewMarkup(layoutId) {
  const normalized = String(layoutId || "classic").toLowerCase();
  if (normalized === "modern") {
    return `
      <span class="settings-layout-preview-modern-stage">
        <span class="settings-layout-preview-modern-hero"></span>
        <span class="settings-layout-preview-modern-row">
          ${Array.from({ length: 12 }, (_, index) => `<span class="settings-layout-preview-modern-card${index % 3 === 1 ? " is-strong" : ""}"></span>`).join("")}
        </span>
      </span>
    `;
  }

  if (normalized === "grid") {
    return `
      <span class="settings-layout-preview-grid-canvas">
        ${Array.from(
          { length: 35 },
          (_, index) => `
          <span class="settings-layout-preview-grid-cell${Math.floor(index / 5) % 3 === 2 ? " is-dim" : ""}"></span>
        `
        ).join("")}
      </span>
    `;
  }

  return `
    <span class="settings-layout-preview-classic-stage">
      <span class="settings-layout-preview-classic-row is-top">
        ${Array.from({ length: 7 }, () => '<span class="settings-layout-preview-classic-card"></span>').join("")}
      </span>
      <span class="settings-layout-preview-classic-row is-featured">
        ${Array.from({ length: 7 }, () => '<span class="settings-layout-preview-classic-card is-strong"></span>').join("")}
      </span>
      <span class="settings-layout-preview-classic-row is-bottom">
        ${Array.from({ length: 7 }, () => '<span class="settings-layout-preview-classic-card"></span>').join("")}
      </span>
    </span>
  `;
}

export function renderLayoutPreviewPlaceholderMarkup() {
  return `
    <span class="settings-layout-preview-placeholder" aria-hidden="true">
      <span class="settings-layout-placeholder-line is-short"></span>
      <span class="settings-layout-placeholder-panel"></span>
      <span class="settings-layout-placeholder-bars">
        <span class="settings-layout-placeholder-line"></span>
        <span class="settings-layout-placeholder-line"></span>
        <span class="settings-layout-placeholder-line"></span>
      </span>
    </span>
  `;
}

export function setLayoutPreviewMetric(node, name, value) {
  if (!node?.style || !Number.isFinite(value)) return;
  node.style.setProperty(name, `${Math.round(value * 100) / 100}px`);
}

export function syncLayoutPreviewMetrics(root) {
  const previews = Array.from(root?.querySelectorAll?.(".settings-layout-preview") || []);
  previews.forEach((preview) => {
    const card = preview.closest?.(".settings-layout-card");
    const cardRect = card?.getBoundingClientRect?.();
    if (!card || !cardRect) return;

    const cardStyle = getComputedStyle(card);
    const previewStyle = getComputedStyle(preview);
    const paddingX = (parseFloat(cardStyle.paddingLeft) || 0) + (parseFloat(cardStyle.paddingRight) || 0);
    const borderX = (parseFloat(cardStyle.borderLeftWidth) || 0) + (parseFloat(cardStyle.borderRightWidth) || 0);
    const previewRect = preview.getBoundingClientRect?.();
    const width = Math.max(0, previewRect?.width || cardRect.width - paddingX - borderX);
    const height = Math.max(0, parseFloat(previewStyle.height) || previewRect?.height || 224);
    if (!width || !height) return;

    if (preview.classList.contains("settings-layout-preview-modern")) {
      const cardHeight = height * 0.24;
      const cardWidth = cardHeight * 1.45;
      const gap = width * 0.03;
      setLayoutPreviewMetric(preview, "--settings-layout-modern-card-width", cardWidth);
      setLayoutPreviewMetric(preview, "--settings-layout-modern-gap", gap);
      setLayoutPreviewMetric(preview, "--settings-layout-modern-cycle-width", (cardWidth + gap) * 3);
      return;
    }

    if (preview.classList.contains("settings-layout-preview-grid")) {
      const gap = width * 0.025;
      const cardWidth = (width - gap * 6) / 5;
      const cardHeight = cardWidth * 1.4;
      setLayoutPreviewMetric(preview, "--settings-layout-grid-gap", gap);
      setLayoutPreviewMetric(preview, "--settings-layout-grid-card-width", cardWidth);
      setLayoutPreviewMetric(preview, "--settings-layout-grid-card-height", cardHeight);
      setLayoutPreviewMetric(preview, "--settings-layout-grid-canvas-height", cardHeight * 7 + gap * 6);
      setLayoutPreviewMetric(preview, "--settings-layout-grid-cycle-height", (cardHeight + gap) * 3);
      return;
    }

    if (preview.classList.contains("settings-layout-preview-classic")) {
      const rowSpacing = height * 0.04;
      const rowHeight = (height - rowSpacing * 4) / 3;
      const cardWidth = width / 5.5;
      const gap = width / 40;
      setLayoutPreviewMetric(preview, "--settings-layout-classic-row-spacing", rowSpacing);
      setLayoutPreviewMetric(preview, "--settings-layout-classic-row-height", rowHeight);
      setLayoutPreviewMetric(preview, "--settings-layout-classic-card-width", cardWidth);
      setLayoutPreviewMetric(preview, "--settings-layout-classic-gap", gap);
      setLayoutPreviewMetric(preview, "--settings-layout-classic-cycle-width", (cardWidth + gap) * 2);
    }
  });
}

export function syncLayoutPreviewMetricsSoon(root) {
  if (!root) return;
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => syncLayoutPreviewMetrics(root));
    return;
  }
  syncLayoutPreviewMetrics(root);
}

export function iconSvg(path, className = "settings-inline-icon", viewBox = "0 0 24 24") {
  return `<svg class="${className}" viewBox="${viewBox}" aria-hidden="true" focusable="false">${path}</svg>`;
}

export function translateOptionLabel(option, fallback = "") {
  if (!option) {
    return fallback;
  }
  if (option.labelKey) {
    return t(option.labelKey, option.labelParams || {}, option.label || fallback);
  }
  return String(option.label || fallback);
}

export function translateOptionCaption(option, fallback = "") {
  if (!option) {
    return fallback;
  }
  if (option.captionKey) {
    return t(option.captionKey, option.captionParams || {}, option.caption || fallback);
  }
  return String(option.caption || fallback);
}

export function translateSectionCopy(section) {
  if (!section) {
    return { label: "", subtitle: "" };
  }
  return {
    label: section.labelKey ? t(section.labelKey, section.labelParams || {}, section.label || "") : String(section.label || ""),
    subtitle: section.subtitleKey
      ? t(section.subtitleKey, section.subtitleParams || {}, section.subtitle || "")
      : String(section.subtitle || "")
  };
}

export function renderSectionNavIcon(sectionId) {
  if (sectionId === "trakt") {
    return '<span class="settings-nav-icon settings-nav-icon-material material-icons" aria-hidden="true">sync</span>';
  }
  if (sectionId === "playback") {
    return iconSvg(
      '<path d="M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18c.62-.39.62-1.29 0-1.69L9.54 5.98C8.87 5.55 8 6.03 8 6.82z"></path>',
      "settings-nav-icon settings-nav-icon-svg"
    );
  }
  const iconName = SECTION_ICONS[sectionId] || "settings";
  return `<span class="settings-nav-icon settings-nav-icon-material material-icons" aria-hidden="true">${iconName}</span>`;
}
