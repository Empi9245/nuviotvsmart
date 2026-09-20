/* eslint-disable no-unused-vars */
import * as internals from "./startupSyncService.js";

export function createStartupSyncServiceMethods01() {
  const {
    AuthManager,
    LocalStore,
    addonRepository,
    ProfileManager,
    PluginSyncService,
    getSyncBackoffRemainingMs,
    resetSyncBackoff,
    FOREGROUND_ACTIVITY_PULL_DELAY_MS,
    FOREGROUND_ACTIVITY_PULL_MIN_INTERVAL_MS,
    PERIODIC_SURFACE_PULL_INTERVAL_MS,
    STARTUP_SYNC_STATE_KEY,
    syncPullCompletedListeners,
    currentSyncKey,
    readStartupSyncState
  } = internals;

  return {
    isCurrentRun(generation) {
      return this.started && this.runGeneration === generation;
    },
    isCurrentProfile(profileId, key = currentSyncKey(profileId)) {
      return key === currentSyncKey() && String(profileId) === String(ProfileManager.getActiveProfileId());
    },
    isCurrentProfilePullPending() {
      return Boolean(this.started && this.profileScopedSyncEnabled && !(this.lastPullCompleted && this.lastPulledKey === currentSyncKey()));
    },
    getCurrentProfilePullPromise() {
      if (!this.isCurrentProfilePullPending() || !this.inFlightPromise || this.inFlightGeneration !== this.runGeneration) {
        return null;
      }
      return this.inFlightPromise;
    },
    scheduleBackoffRetry({ notifyPullCompleted = false } = {}) {
      if (!this.started || !AuthManager.isAuthenticated) {
        return;
      }
      const remainingMs = getSyncBackoffRemainingMs();
      if (remainingMs <= 0) {
        return;
      }
      this.backoffRetryNotifyPullCompleted = Boolean(this.backoffRetryNotifyPullCompleted || notifyPullCompleted);
      if (this.backoffRetryTimer) {
        return;
      }
      this.backoffRetryTimer = setTimeout(
        () => {
          this.backoffRetryTimer = null;
          const shouldNotifyPullCompleted = Boolean(this.backoffRetryNotifyPullCompleted);
          this.backoffRetryNotifyPullCompleted = false;
          void this.requestSyncNow({
            force: true,
            includeProfileSettings: true,
            notifyPullCompleted: shouldNotifyPullCompleted
          }).catch((error) => {
            console.warn("Scheduled startup sync retry failed", error);
          });
        },
        Math.max(1000, remainingMs + 50)
      );
    },
    queuePendingSyncRequest({ force = true, includeProfileSettings = true, pushAfterPull = false, notifyPullCompleted = false }) {
      const current = this.pendingSyncRequest || {};
      this.pendingSyncRequest = {
        force: Boolean(current.force || force),
        includeProfileSettings: Boolean(current.includeProfileSettings || includeProfileSettings),
        pushAfterPull: Boolean(current.pushAfterPull || pushAfterPull),
        notifyPullCompleted: Boolean(current.notifyPullCompleted || notifyPullCompleted)
      };
    },
    markFullPullSucceeded(key, includeProfileSettings) {
      const now = Date.now();
      const previous = readStartupSyncState()[key] || {};
      const included = Boolean(includeProfileSettings || previous.lastFullPullIncludedProfileSettings === true);
      this.lastPulledKey = key;
      this.lastPulledIncludedProfileSettings = included;
      this.lastPulledAtMs = now;
      this.lastForegroundPullKey = key;
      this.lastForegroundPullAtMs = now;
      this.lastPullCompleted = true;
      LocalStore.set(STARTUP_SYNC_STATE_KEY, {
        ...readStartupSyncState(),
        [key]: {
          lastFullPullAtMs: now,
          lastFullPullIncludedProfileSettings: included
        }
      });
    },
    async start({ profileScopedSyncEnabled = false, runInitialPull = true } = {}) {
      if (this.started) {
        if (profileScopedSyncEnabled) {
          this.profileScopedSyncEnabled = true;
        }
        return;
      }
      this.started = true;
      this.runGeneration += 1;
      this.inFlight = false;
      this.profileScopedSyncEnabled = Boolean(profileScopedSyncEnabled);

      this.unsubscribeAddonChanges = addonRepository.onInstalledAddonsChanged(() => {
        this.scheduleAddonPush();
      });

      if (runInitialPull) {
        await this.requestSyncNow({ force: false, includeProfileSettings: true });
      }

      if (!this.started) {
        return;
      }
      this.intervalId = setInterval(() => {
        this.scheduleSurfacePull("periodic");
      }, PERIODIC_SURFACE_PULL_INTERVAL_MS);
    },
    stop({ waitForInFlight = false } = {}) {
      const pendingPromises = waitForInFlight
        ? [
            this.inFlightPromise,
            this.foregroundPullPromise,
            this.watchStateInFlightPromise,
            this.libraryInFlightPromise,
            this.addonPushPromise
          ].filter((promise) => promise && typeof promise.then === "function")
        : [];
      this.started = false;
      this.runGeneration += 1;
      this.profileScopedSyncEnabled = false;
      this.pendingSyncRequest = null;
      this.lastPulledKey = null;
      this.lastPulledIncludedProfileSettings = false;
      this.lastPulledAtMs = 0;
      this.lastPullCompleted = false;
      this.lastForegroundPullKey = null;
      this.lastForegroundPullAtMs = 0;
      if (this.foregroundPullTimer) {
        clearTimeout(this.foregroundPullTimer);
        this.foregroundPullTimer = null;
      }
      this.foregroundPullPromise = null;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      if (this.libraryIntervalId) {
        clearInterval(this.libraryIntervalId);
        this.libraryIntervalId = null;
      }
      if (this.addonPushTimer) {
        clearTimeout(this.addonPushTimer);
        this.addonPushTimer = null;
      }
      if (this.backoffRetryTimer) {
        clearTimeout(this.backoffRetryTimer);
        this.backoffRetryTimer = null;
      }
      this.backoffRetryNotifyPullCompleted = false;
      this.addonPushPromise = null;
      if (this.unsubscribeAddonChanges) {
        this.unsubscribeAddonChanges();
        this.unsubscribeAddonChanges = null;
      }
      resetSyncBackoff();
      if (!waitForInFlight || pendingPromises.length === 0) {
        return Promise.resolve(true);
      }
      return Promise.allSettled(pendingPromises).then(() => true);
    },
    enableProfileScopedSync() {
      this.profileScopedSyncEnabled = true;
    },
    ensurePluginServiceReady({ force = true } = {}) {
      return PluginSyncService.ensureReadyForPull({ force });
    },
    subscribeToPullCompleted(listener) {
      if (typeof listener !== "function") {
        return () => {};
      }
      syncPullCompletedListeners.add(listener);
      return () => syncPullCompletedListeners.delete(listener);
    },
    scheduleSurfacePull(reason = "foreground", delayMs = 0, minIntervalMs = 0, force = false) {
      if (!this.started || !this.profileScopedSyncEnabled || !AuthManager.isAuthenticated) {
        return false;
      }
      const profileId = ProfileManager.getActiveProfileId();
      const key = currentSyncKey(profileId);
      const now = Date.now();
      if (this.inFlightPromise || this.foregroundPullTimer || this.foregroundPullPromise) {
        return false;
      }
      if (
        !force &&
        this.lastForegroundPullKey === key &&
        this.lastForegroundPullAtMs > 0 &&
        now >= this.lastForegroundPullAtMs &&
        now - this.lastForegroundPullAtMs < minIntervalMs
      ) {
        return false;
      }

      this.foregroundPullTimer = setTimeout(
        () => {
          this.foregroundPullTimer = null;
          if (!this.started || !this.profileScopedSyncEnabled || !AuthManager.isAuthenticated) {
            return;
          }
          if (this.inFlightPromise) {
            return;
          }
          let foregroundPullPromise = null;
          foregroundPullPromise = Promise.all([this.requestWatchStateSyncNow(), this.requestLibrarySyncNow()])
            .then(([watchSucceeded, librarySucceeded]) => {
              if (watchSucceeded && librarySucceeded) {
                this.lastForegroundPullKey = key;
                this.lastForegroundPullAtMs = Date.now();
              }
              return Boolean(watchSucceeded && librarySucceeded);
            })
            .catch((error) => {
              console.warn(`Startup sync ${reason} surface pull failed`, error);
              return false;
            })
            .finally(() => {
              if (this.foregroundPullPromise === foregroundPullPromise) {
                this.foregroundPullPromise = null;
              }
            });
          this.foregroundPullPromise = foregroundPullPromise;
        },
        Math.max(0, Number(delayMs) || 0)
      );
      return true;
    },
    requestForegroundSync(force = false) {
      return this.scheduleSurfacePull(
        "foreground",
        force ? 0 : FOREGROUND_ACTIVITY_PULL_DELAY_MS,
        force ? 0 : FOREGROUND_ACTIVITY_PULL_MIN_INTERVAL_MS,
        force
      );
    }
  };
}
