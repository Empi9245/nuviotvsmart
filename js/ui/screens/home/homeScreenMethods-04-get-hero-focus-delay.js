import * as internals from "./homeScreenContext.js";

export function createHomeScreenMethods04() {
  const {
    Router,
    addonRepository,
    ProfileManager,
    StartupSyncService,
    MODERN_HOME_CONSTANTS,
    HERO_ROTATE_FIRST_DELAY_MS,
    HERO_ROTATE_INTERVAL_MS,
    HOME_STABLE_GATE_TIMEOUT_MS,
    logHomePerf,
    preloadHeroAssets,
    buildHeroIdentity
  } = internals;

  return {
    getHeroFocusDelay({ rapid = false } = {}) {
      if (this.isLegacyTvRuntime()) {
        return rapid ? 260 : 150;
      }
      return rapid ? MODERN_HOME_CONSTANTS.heroRapidSettleMs : MODERN_HOME_CONSTANTS.heroFocusDelayMs;
    },
    cancelScheduledRender() {
      if (this.homeRenderTimer) {
        clearTimeout(this.homeRenderTimer);
        this.homeRenderTimer = null;
      }
      if (this.homeRenderFrame) {
        cancelAnimationFrame(this.homeRenderFrame);
        this.homeRenderFrame = null;
      }
    },
    cancelInitialHomeLoadTimeout() {
      if (this.initialHomeLoadTimeout) {
        clearTimeout(this.initialHomeLoadTimeout);
        this.initialHomeLoadTimeout = null;
      }
    },
    releaseInitialHomeLoading() {
      this.isInitialHomeLoading = false;
      this.cancelInitialHomeLoadTimeout();
    },
    scheduleInitialHomeLoadTimeout(loadToken) {
      this.cancelInitialHomeLoadTimeout();
      this.initialHomeLoadTimeout = setTimeout(() => {
        this.initialHomeLoadTimeout = null;
        if (loadToken !== this.homeLoadToken || Router.getCurrent() !== "home" || !this.isInitialHomeLoading) {
          return;
        }
        // Match Android's stable Home gate: a slow or incomplete startup must
        // reveal the available surface instead of keeping a full-screen loader
        // indefinitely. The catalog requests continue in the background.
        this.releaseInitialHomeLoading();
        this.requestBackgroundRender();
      }, HOME_STABLE_GATE_TIMEOUT_MS);
    },
    invalidateNavigationModel() {
      this.navigationDomVersion = Number(this.navigationDomVersion || 0) + 1;
      this.navModel = null;
    },
    requestRender(options = {}) {
      if (!this.container || Router.getCurrent() !== "home") {
        return;
      }
      const delayMs = Math.max(0, Number(options?.delayMs || 0));
      if (delayMs > 0) {
        if (this.homeRenderTimer) {
          clearTimeout(this.homeRenderTimer);
          this.homeRenderTimer = null;
        }
        if (this.homeRenderFrame) {
          return;
        }
        this.homeRenderTimer = setTimeout(() => {
          this.homeRenderTimer = null;
          this.requestRender();
        }, delayMs);
        return;
      }
      if (this.homeRenderTimer) {
        clearTimeout(this.homeRenderTimer);
        this.homeRenderTimer = null;
      }
      if (this.homeRenderFrame) {
        return;
      }
      this.homeRenderFrame = requestAnimationFrame(() => {
        this.homeRenderFrame = null;
        if (!this.container || Router.getCurrent() !== "home") {
          return;
        }
        if (this.shouldDeferHomeRenderForInput()) {
          this.requestRender({
            delayMs: MODERN_HOME_CONSTANTS.verticalScrollSettlePollMs
          });
          return;
        }
        this.render();
      });
    },
    requestBackgroundRender() {
      this.requestRender({ delayMs: this.getBackgroundRenderDelay() });
    },
    shouldDeferHomeRenderForInput() {
      return Boolean(this.layoutMode === "modern" && this.hasUserInteractedSinceHomePaint && this.shouldSuspendModernViewportFocusSync());
    },
    maybeStartPendingHomeBackgroundRefresh() {
      if (!this.homeBackgroundRefreshPending || this.isInitialHomeLoading || !this.continueWatchingInitialResolved) {
        return false;
      }
      void this.requestHomeBackgroundRefresh({
        preserveReturnState: Boolean(this.homeBackgroundRefreshPreserveReturnState),
        reason: this.homeBackgroundRefreshReason || "post-initial-load"
      }).catch((error) => {
        console.warn("Home deferred background refresh failed", error);
      });
      return true;
    },
    ensureStartupSyncSubscription() {
      if (this.unsubscribeStartupSyncPullCompleted) {
        return;
      }
      this.unsubscribeStartupSyncPullCompleted = StartupSyncService.subscribeToPullCompleted(({ profileId } = {}) => {
        if (Router.getCurrent() !== "home") {
          return;
        }
        const activeProfileId = String(ProfileManager.getActiveProfileId() || "");
        if (profileId && String(profileId) !== activeProfileId) {
          return;
        }
        void this.requestHomeBackgroundRefresh({
          preserveReturnState: true,
          reason: "startup-sync"
        }).catch((error) => {
          console.warn("Home post-sync refresh failed", error);
        });
      });
    },
    ensureAddonManifestSubscriptions() {
      if (!this.unsubscribeAddonManifestChanges) {
        this.unsubscribeAddonManifestChanges = addonRepository.onManifestCacheChanged(() => {
          if (Router.getCurrent() !== "home") {
            return;
          }
          void this.requestHomeBackgroundRefresh({
            preserveReturnState: true,
            reason: "manifest-cache"
          }).catch((error) => {
            console.warn("Home post-manifest refresh failed", error);
          });
        });
      }
      if (!this.unsubscribeInstalledAddonChanges) {
        this.unsubscribeInstalledAddonChanges = addonRepository.onInstalledAddonsChanged(() => {
          if (Router.getCurrent() !== "home") {
            return;
          }
          void this.requestHomeBackgroundRefresh({
            preserveReturnState: true,
            reason: "addon-state"
          }).catch((error) => {
            console.warn("Home addon-state refresh failed", error);
          });
        });
      }
    },
    requestHomeBackgroundRefresh({ preserveReturnState = true, reason = "background" } = {}) {
      this.homeBackgroundRefreshPending = true;
      this.homeBackgroundRefreshPreserveReturnState = Boolean(this.homeBackgroundRefreshPreserveReturnState || preserveReturnState);
      this.homeBackgroundRefreshReason = String(reason || "background");

      if (this.isInitialHomeLoading) {
        return Promise.resolve(false);
      }
      // A cold Home load must finish its first Continue Watching cycle before a
      // startup/manifest refresh can invalidate the load token. Otherwise the
      // catalog paints and claims focus, then the first CW result arrives through
      // a background load that is intentionally not allowed to steal focus.
      if (!this.continueWatchingInitialResolved && reason !== "startup-sync") {
        return Promise.resolve(false);
      }
      if (this.homeBackgroundRefreshPromise) {
        return this.homeBackgroundRefreshPromise;
      }

      // A post-sync refresh can begin while the initial catalog/CW load still
      // has child promises in flight. Invalidate that older load before the new
      // refresh captures its token, otherwise a slow stale response can win
      // after the freshly synchronized data has been rendered.
      this.homeLoadToken = (this.homeLoadToken || 0) + 1;

      let refreshPromise = null;
      refreshPromise = (async () => {
        let didRefresh = false;
        while (this.homeBackgroundRefreshPending && Router.getCurrent() === "home") {
          const shouldPreserveReturnState = Boolean(this.homeBackgroundRefreshPreserveReturnState);
          const refreshReason = this.homeBackgroundRefreshReason;
          this.homeBackgroundRefreshPending = false;
          this.homeBackgroundRefreshPreserveReturnState = false;
          this.homeBackgroundRefreshReason = "";
          await this.loadData({
            background: true,
            preserveReturnState: shouldPreserveReturnState,
            refreshManifests: refreshReason !== "manifest-cache"
          });
          didRefresh = true;
          logHomePerf("backgroundRefresh", {
            reason: refreshReason,
            preserveReturnState: shouldPreserveReturnState
          });
        }
        return didRefresh;
      })().finally(() => {
        if (this.homeBackgroundRefreshPromise === refreshPromise) {
          this.homeBackgroundRefreshPromise = null;
        }
      });
      this.homeBackgroundRefreshPromise = refreshPromise;
      return refreshPromise;
    },
    stopHeroRotation() {
      if (this.heroRotateTimer) {
        clearInterval(this.heroRotateTimer);
        this.heroRotateTimer = null;
      }
      if (this.heroRotateTimeout) {
        clearTimeout(this.heroRotateTimeout);
        this.heroRotateTimeout = null;
      }
    },
    cancelPendingHeroFocus() {
      if (this.heroFocusDelayTimer) {
        clearTimeout(this.heroFocusDelayTimer);
        this.heroFocusDelayTimer = null;
      }
      if (this.heroBackdropPreloadTimer) {
        clearTimeout(this.heroBackdropPreloadTimer);
        this.heroBackdropPreloadTimer = null;
      }
      if (this.deferredContinueWatchingFocusTimer) {
        clearTimeout(this.deferredContinueWatchingFocusTimer);
        this.deferredContinueWatchingFocusTimer = null;
      }
      this.container?.querySelector(".home-modern-hero-card")?.classList.remove("is-hero-focus-pending");
      this.heroFocusToken = Number(this.heroFocusToken || 0) + 1;
    },
    startHeroRotation() {
      this.stopHeroRotation();
      if (this.layoutMode === "modern" || this.isPerformanceConstrained()) {
        return;
      }
      if (!Array.isArray(this.heroCandidates) || this.heroCandidates.length <= 1) {
        return;
      }
      this.heroRotateTimeout = setTimeout(() => {
        if (!this.container?.querySelector(".home-hero-card.focusable.focused")) {
          this.rotateHero(1);
        }
        this.heroRotateTimer = setInterval(() => {
          if (!this.container?.querySelector(".home-hero-card.focusable.focused")) {
            this.rotateHero(1);
          }
        }, HERO_ROTATE_INTERVAL_MS);
      }, HERO_ROTATE_FIRST_DELAY_MS);
    },
    rotateHero(step = 1) {
      if (!Array.isArray(this.heroCandidates) || this.heroCandidates.length <= 1) {
        return;
      }
      const total = this.heroCandidates.length;
      this.heroIndex = (Number(this.heroIndex || 0) + step + total) % total;
      this.heroItem = this.heroCandidates[this.heroIndex];
      if (this.layoutMode === "modern") {
        this.applyHeroToDom();
        return;
      }

      // Android's legacy/grid HeroCarousel keeps the current scene alive while
      // the next slide is prepared. Coalesce repeated D-pad navigation so a
      // slow TV never commits an intermediate poster/logo from a held button.
      const sceneToken = (this.pendingHeroSceneToken = Number(this.pendingHeroSceneToken || 0) + 1);
      const pendingHero = this.heroItem;
      const pendingHeroIdentity = buildHeroIdentity(pendingHero);
      void preloadHeroAssets(pendingHero, this.layoutMode).then(() => {
        if (Number(this.pendingHeroSceneToken || 0) !== sceneToken || buildHeroIdentity(this.heroItem) !== pendingHeroIdentity) {
          return;
        }
        this.applyHeroToDom();
      });
    }
  };
}
