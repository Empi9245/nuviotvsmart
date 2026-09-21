import { Router } from "../../navigation/routerState.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { TmdbMetadataService } from "../../../core/tmdb/tmdbMetadataService.js";
import { TmdbSettingsStore } from "../../../data/local/tmdbSettingsStore.js";
import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";
import { watchedItemsRepository } from "../../../data/repository/watchedItemsRepository.js";
import { watchedTitleStateRepository } from "../../../data/repository/watchedTitleStateRepository.js";
import { Environment } from "../../../platform/environment.js";
import { I18n } from "../../../i18n/index.js";
import {
  buildWatchedTitleIdSet,
  isTitleItemWatched,
  renderTitleWatchedBadge
} from "../../components/watchedTitleBadge.js";
import {
  posterItemFromNode,
  PosterOptionsDialogController
} from "../../components/posterOptionsMenu.js";
import { renderLoadingIndicator } from "../../components/loadingIndicator.js";

import { createTmdbEntityBrowseScreenMethods01 } from "./tmdbEntityBrowseScreenMethods-01-get-route-state-key.js";
import { createTmdbEntityBrowseScreenMethods02 } from "./tmdbEntityBrowseScreenMethods-02-bind-shell-events.js";
import { createTmdbEntityBrowseScreenMethods03 } from "./tmdbEntityBrowseScreenMethods-03-open-poster-options-menu.js";

export {
  Router,
  ScreenUtils,
  TmdbMetadataService,
  TmdbSettingsStore,
  LayoutPreferences,
  watchedItemsRepository,
  watchedTitleStateRepository,
  Environment,
  I18n,
  buildWatchedTitleIdSet,
  isTitleItemWatched,
  renderTitleWatchedBadge,
  posterItemFromNode,
  PosterOptionsDialogController,
  renderLoadingIndicator,
  POSTER_HOLD_DELAY_MS,
  t,
  escapeHtml,
  isDarkMonochromeImage,
  bindLogoContrast,
  normalizeEntityKind,
  normalizeEntityId,
  normalizeSourceType,
  isBackEvent,
  releaseYear,
  mediaLabel,
  railLabel,
  entityKindLabel,
  getDirection,
  routeStateClone
};
const POSTER_HOLD_DELAY_MS = 650;

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isDarkMonochromeImage(image) {
  if (
    !image ||
    !Number(image.naturalWidth) ||
    !Number(image.naturalHeight) ||
    typeof document === "undefined"
  ) {
    return false;
  }

  try {
    const maxSampleSize = 48;
    const scale = Math.min(
      1,
      maxSampleSize / Math.max(Number(image.naturalWidth), Number(image.naturalHeight))
    );
    const width = Math.max(1, Math.round(Number(image.naturalWidth) * scale));
    const height = Math.max(1, Math.round(Number(image.naturalHeight) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return false;
    }
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let luminance = 0;
    let saturation = 0;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] <= 50) {
        continue;
      }
      const red = pixels[index] / 255;
      const green = pixels[index + 1] / 255;
      const blue = pixels[index + 2] / 255;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      luminance += 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      saturation += max === 0 ? 0 : (max - min) / max;
      count += 1;
    }
    if (!count) {
      return false;
    }
    return luminance / count < 0.3 && saturation / count < 0.2;
  } catch (_) {
    // Cross-origin images without CORS are still rendered normally; they just
    // cannot be inspected for the optional contrast correction.
    return false;
  }
}

function bindLogoContrast(logo) {
  if (typeof HTMLImageElement === "undefined" || !(logo instanceof HTMLImageElement)) {
    return;
  }
  const apply = () => {
    logo.classList.toggle("tmdb-entity-logo-dark", isDarkMonochromeImage(logo));
  };
  if (logo.complete) {
    apply();
  } else {
    logo.addEventListener("load", apply);
  }
}

function normalizeEntityKind(value) {
  return String(value || "")
    .trim()
    .toLowerCase() === "network"
    ? "network"
    : "company";
}

function normalizeEntityId(value) {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) && Number(normalized) > 0 ? normalized : "";
}

function normalizeSourceType(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "movie" ? "movie" : "tv";
}

function isBackEvent(event) {
  return Environment.isBackEvent(event);
}

function releaseYear(item = {}) {
  const raw = item?.releaseInfo || item?.released || item?.releaseDate || "";
  const match = String(raw).match(/\b(?:19|20)\d{2}\b/);
  return match?.[0] || "";
}

function mediaLabel(mediaType) {
  return mediaType === "tv" ? t("type_series", {}, "Series") : t("type_movie", {}, "Movie");
}

function railLabel(railType) {
  if (railType === "top_rated") {
    return t("tmdb_entity_rail_top_rated", {}, "Top Rated");
  }
  if (railType === "recent") {
    return t("tmdb_entity_rail_recent", {}, "Recent");
  }
  return t("tmdb_entity_rail_popular", {}, "Popular");
}

function entityKindLabel(entityKind) {
  return entityKind === "network"
    ? t("tmdb_entity_kind_network", {}, "Network")
    : t("tmdb_entity_kind_company", {}, "Production Company");
}

function getDirection(event) {
  const code = Number(event?.keyCode || 0);
  if (code === 37) return "left";
  if (code === 39) return "right";
  if (code === 38) return "up";
  if (code === 40) return "down";
  return null;
}

function routeStateClone(data) {
  if (!data || typeof data !== "object") {
    return null;
  }
  return {
    header: data.header ? { ...data.header } : null,
    rails: Array.isArray(data.rails)
      ? data.rails.map((rail) => ({
          ...rail,
          items: Array.isArray(rail?.items) ? [...rail.items] : []
        }))
      : []
  };
}

export const TmdbEntityBrowseScreen = {
  ...createTmdbEntityBrowseScreenMethods01(),
  ...createTmdbEntityBrowseScreenMethods02(),
  ...createTmdbEntityBrowseScreenMethods03()
};
