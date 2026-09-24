import { AuthManager } from "../auth/authManager.js";
import { LocalStore } from "../storage/localStore.js";
import { SessionStore } from "../storage/sessionStore.js";
import { addonRepository } from "../../data/repository/addonRepository.js";
import { ProfileManager } from "./profileManager.js";
import { ProfileSyncService } from "./profileSyncService.js";
import { LibrarySyncService } from "./librarySyncService.js";
import { WatchProgressSyncService } from "./watchProgressSyncService.js";
import { SavedLibrarySyncService } from "./savedLibrarySyncService.js";
import { WatchedItemsSyncService } from "./watchedItemsSyncService.js";
import { PluginSyncService } from "./pluginSyncService.js";
import { ProfileSettingsSyncService } from "./profileSettingsSyncService.js";
import { ProviderCredentialSyncService } from "./providerCredentialSyncService.js";
import { SimklSyncService } from "../../data/repository/simklSyncService.js";
import { CollectionSyncService } from "./collectionSyncService.js";
import { HomeCatalogSettingsSyncService } from "./homeCatalogSettingsSyncService.js";
import { ThemeManager } from "../../ui/theme/themeManager.js";
import { MemberAccessRepository } from "../../data/remote/supabase/memberAccessRepository.js";
import { I18n } from "../../i18n/index.js";
import { hasProfileSettingsCloudSyncPending } from "../../data/local/profileScopedStore.js";
import {
  getSyncBackoffRemainingMs,
  isSyncBackoffActive,
  resetSyncBackoff
} from "../sync/syncBackoffPolicy.js";

import { createStartupSyncServiceMethods01 } from "./startupSyncServiceMethods-01-is-current-run.js";
import { createStartupSyncServiceMethods02 } from "./startupSyncServiceMethods-02-request-sync-now.js";
import { createStartupSyncServiceMethods03 } from "./startupSyncServiceMethods-03-request-library-sync-now.js";

export {
  AuthManager,
  LocalStore,
  SessionStore,
  addonRepository,
  ProfileManager,
  ProfileSyncService,
  LibrarySyncService,
  WatchProgressSyncService,
  SavedLibrarySyncService,
  WatchedItemsSyncService,
  PluginSyncService,
  ProfileSettingsSyncService,
  ProviderCredentialSyncService,
  SimklSyncService,
  CollectionSyncService,
  HomeCatalogSettingsSyncService,
  ThemeManager,
  MemberAccessRepository,
  I18n,
  hasProfileSettingsCloudSyncPending,
  getSyncBackoffRemainingMs,
  isSyncBackoffActive,
  resetSyncBackoff,
  FOREGROUND_ACTIVITY_PULL_DELAY_MS,
  FOREGROUND_ACTIVITY_PULL_MIN_INTERVAL_MS,
  PERIODIC_SURFACE_PULL_INTERVAL_MS,
  ADDON_PUSH_DEBOUNCE_MS,
  MAX_PULL_ATTEMPTS,
  FORCE_RESYNC_MIN_INTERVAL_MS,
  FULL_STARTUP_PULL_TTL_MS,
  STARTUP_SYNC_STATE_KEY,
  syncPullCompletedListeners,
  createAbortError,
  sleep,
  normalizeProfileId,
  decodeJwtPayload,
  currentSyncKey,
  readStartupSyncState,
  canUsePersistedWarmSync,
  runSurface,
  notifySyncPullCompleted
};
const FOREGROUND_ACTIVITY_PULL_DELAY_MS = 2500;
const FOREGROUND_ACTIVITY_PULL_MIN_INTERVAL_MS = 2 * 60 * 1000;
const PERIODIC_SURFACE_PULL_INTERVAL_MS = 15 * 60 * 1000;
const ADDON_PUSH_DEBOUNCE_MS = 500;
const MAX_PULL_ATTEMPTS = 3;
const FORCE_RESYNC_MIN_INTERVAL_MS = 30000;
const FULL_STARTUP_PULL_TTL_MS = 6 * 60 * 60 * 1000;
const STARTUP_SYNC_STATE_KEY = "startupSyncState";
const syncPullCompletedListeners = new Set();

function createAbortError() {
  const error = new Error("Startup sync aborted");
  error.name = "AbortError";
  return error;
}

function sleep(ms, signal = null) {
  return new Promise((resolve, reject) => {
    let timerId = 0;
    const onAbort = () => {
      if (timerId) clearTimeout(timerId);
      signal?.removeEventListener?.("abort", onAbort);
      reject(createAbortError());
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    timerId = setTimeout(
      () => {
        signal?.removeEventListener?.("abort", onAbort);
        resolve();
      },
      Math.max(0, Number(ms) || 0)
    );
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

function normalizeProfileId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || "1";
}

function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || "").split(".");
    if (!payload || typeof atob !== "function") {
      return null;
    }
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch (_) {
    return null;
  }
}

function currentSyncKey(profileId = null) {
  const userId = String(decodeJwtPayload(SessionStore.accessToken)?.sub || "authenticated");
  return `${userId}:p${normalizeProfileId(profileId ?? ProfileManager.getActiveProfileId())}`;
}

function readStartupSyncState() {
  const value = LocalStore.get(STARTUP_SYNC_STATE_KEY, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function canUsePersistedWarmSync(key, includeProfileSettings, now = Date.now()) {
  const entry = readStartupSyncState()[key];
  if (!entry || typeof entry !== "object") {
    return false;
  }
  const lastFullPullAtMs = Number(entry.lastFullPullAtMs || 0);
  return (
    lastFullPullAtMs > 0 &&
    now - lastFullPullAtMs < FULL_STARTUP_PULL_TTL_MS &&
    (!includeProfileSettings || entry.lastFullPullIncludedProfileSettings === true)
  );
}

function runSurface(label, task) {
  if (isSyncBackoffActive()) {
    return Promise.resolve({ ok: false, deferred: true });
  }
  return Promise.resolve()
    .then(task)
    .then((value) => ({ ok: true, value }))
    .catch((error) => {
      console.warn(`Startup sync ${label} failed; keeping local state`, error);
      return { ok: false, error };
    });
}

function notifySyncPullCompleted(event = {}) {
  syncPullCompletedListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      console.warn("Startup sync completion listener failed", error);
    }
  });
}

export const StartupSyncService = {
  started: false,
  lastPullChangedHomeInputs: true,
  intervalId: null,
  libraryIntervalId: null,
  foregroundPullTimer: null,
  foregroundPullPromise: null,
  lastForegroundPullKey: null,
  lastForegroundPullAtMs: 0,
  inFlight: false,
  inFlightPromise: null,
  inFlightGeneration: 0,
  watchStateInFlightPromise: null,
  watchStateInFlightGeneration: 0,
  libraryInFlightPromise: null,
  libraryInFlightGeneration: 0,
  addonPushPromise: null,
  profileScopedSyncEnabled: false,
  addonPushTimer: null,
  backoffRetryTimer: null,
  backoffRetryNotifyPullCompleted: false,
  unsubscribeAddonChanges: null,
  pendingSyncRequest: null,
  runGeneration: 0,
  lastPulledKey: null,
  lastPulledIncludedProfileSettings: false,
  lastPulledAtMs: 0,
  lastPullCompleted: false,
  ...createStartupSyncServiceMethods01(),
  ...createStartupSyncServiceMethods02(),
  ...createStartupSyncServiceMethods03()
};

AuthManager.registerSessionTeardownListener?.(() =>
  StartupSyncService.stop({ waitForInFlight: true })
);
