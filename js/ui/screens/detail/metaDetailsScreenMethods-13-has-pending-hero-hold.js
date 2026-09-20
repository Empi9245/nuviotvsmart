/* eslint-disable no-unused-vars */
import * as internals from "./metaDetailsScreenContext.js";

export function createMetaDetailsScreenMethods13() {
  const {
    Router,
    libraryRepository,
    LibrarySourceMode,
    supportsMembershipFor,
    posterItemFromNode,
    PosterOptionsDialogController,
    isWatchProgressInProgress,
    resolveWatchProgressResumePositionMs,
    POSTER_HOLD_DELAY_MS,
    HERO_HOLD_DELAY_MS,
    SIMKL_DESTRUCTIVE_REMOVAL_MESSAGE,
    t,
    detailProgressFraction,
    isSeriesDetailMeta,
    escapeSelectorValue
  } = internals;

  return {
    hasPendingHeroHold(node) {
      const pending = this.pendingHeroHoldTarget;
      if (!pending || !node) {
        return false;
      }
      return String(node.dataset.action || "") === String(pending.action || "");
    },
    startPendingHeroHold(node) {
      const action = String(node?.dataset?.action || "");
      if (action !== "playDefault" && action !== "toggleLibrary") {
        return false;
      }
      this.cancelPendingHeroHold();
      this.pendingHeroHoldTarget = {
        action,
        holdTriggered: false
      };
      this.pendingHeroHoldTimer = setTimeout(() => {
        this.pendingHeroHoldTimer = null;
        const pending = this.pendingHeroHoldTarget;
        if (!pending || Router.getCurrent() !== "detail") {
          return;
        }
        const current = this.container?.querySelector(".series-detail-actions .focusable.focused") || null;
        if (!this.hasPendingHeroHold(current)) {
          return;
        }
        pending.holdTriggered = true;
        if (pending.action === "playDefault") {
          this.openHeroPlayMenu();
        } else {
          void this.openLibraryListMenu();
        }
      }, HERO_HOLD_DELAY_MS);
      return true;
    },
    async completePendingHeroHold(node, event = null) {
      const pending = this.pendingHeroHoldTarget;
      if (!pending) {
        return false;
      }
      const holdTriggered = Boolean(pending.holdTriggered);
      const action = String(pending.action || "");
      const heldLongEnough = Number(event?.keyDownDurationMs || 0) >= HERO_HOLD_DELAY_MS;
      const shouldOpenHoldMenu = !holdTriggered && heldLongEnough && this.hasPendingHeroHold(node);
      this.cancelPendingHeroHold();
      if (holdTriggered || shouldOpenHoldMenu) {
        if (shouldOpenHoldMenu) {
          if (action === "playDefault") {
            this.openHeroPlayMenu();
          } else if (action === "toggleLibrary") {
            void this.openLibraryListMenu();
          }
        }
        return true;
      }
      if (!node || String(node.dataset.action || "") !== action) {
        return false;
      }
      if (action === "playDefault") {
        await this.playDefaultFromHero();
        return true;
      }
      if (action === "toggleLibrary") {
        await this.toggleLibraryFromHero();
        return true;
      }
      return false;
    },
    openHeroPlayMenu() {
      this.heroPlayMenu = { optionIndex: 0 };
      this.libraryListMenu = null;
      return this.mountHeroPlayDialog();
    },
    closeHeroMenus({ restoreFocus = true } = {}) {
      if (!this.heroPlayMenu && !this.libraryListMenu) {
        return false;
      }
      const focusDescriptor = this.libraryListMenu
        ? { selector: ".series-detail-actions [data-action='toggleLibrary']" }
        : { selector: ".series-detail-actions [data-action='playDefault']" };
      this.heroPlayMenu = null;
      this.libraryListMenu = null;
      this.destroyDetailHoldDialog();
      if (restoreFocus) {
        this.focusDetailDescriptor(focusDescriptor);
      }
      return true;
    },
    async openLibraryListMenu({ membershipOverride = null, sourceMode = null, destructiveRemovalRequired = false, error = "" } = {}) {
      const item = this.getCurrentLibraryItem();
      if (!item.itemId) {
        return false;
      }
      const resolvedSourceMode = sourceMode || (await libraryRepository.getSourceMode().catch(() => LibrarySourceMode.LOCAL));
      const tabs = await libraryRepository.getListTabs({ sourceMode: resolvedSourceMode }).catch(() => []);
      const resolvedTabs =
        Array.isArray(tabs) && tabs.length
          ? tabs.filter((tab) => supportsMembershipFor(tab, item.itemType))
          : [{ key: "local", title: t("detail.library", {}, "Library"), type: "local" }];
      const snapshot = await libraryRepository
        .getMembershipSnapshot(item, { sourceMode: resolvedSourceMode })
        .catch(() => ({ listMembership: {} }));
      const membership = membershipOverride && typeof membershipOverride === "object" ? membershipOverride : snapshot?.listMembership || {};
      this.libraryListMenu = {
        item,
        sourceMode: resolvedSourceMode,
        tabs: resolvedTabs,
        membership: Object.fromEntries(resolvedTabs.map((tab) => [tab.key, Boolean(membership[tab.key])])),
        destructiveRemovalRequired: Boolean(destructiveRemovalRequired),
        error: String(error || "")
      };
      this.heroPlayMenu = null;
      return this.mountLibraryListDialog();
    },
    getResumeParamsForProgress(progress = null, { startOver = false, useActiveFallback = true } = {}) {
      if (startOver) {
        return {
          startFromBeginning: true,
          resumePositionMs: 0,
          resumeProgressPercent: null,
          resumeDurationMs: 0
        };
      }
      const resume = progress || (useActiveFallback ? this.getActiveResumeProgress() : null);
      if (!resume || !isWatchProgressInProgress(resume)) {
        return {};
      }
      const params = {
        resumePositionMs: resolveWatchProgressResumePositionMs(resume),
        resumeProgressPercent: Number(resume.progressPercent ?? detailProgressFraction(resume) * 100) || null,
        resumeDurationMs: Number(resume.durationMs || 0) || 0
      };
      return params;
    },
    async playDefaultFromHero(options = {}) {
      const startOver = Boolean(options?.startOver);
      const manualSelection = Boolean(options?.manualSelection);
      if (isSeriesDetailMeta(this.meta, this.episodes)) {
        const targetEpisode =
          this.nextEpisodeToWatch || this.episodes?.find((entry) => entry.season === this.selectedSeason) || this.episodes?.[0] || null;
        if (targetEpisode?.id) {
          await this.openEpisodeStreamChooser(targetEpisode.id, { startOver, manualSelection });
        }
        return;
      }
      await this.openMovieStreamChooser({ startOver, manualSelection });
    },
    async toggleLibraryFromHero() {
      if (this.libraryTogglePending) {
        return false;
      }
      const detailToken = this.detailLoadToken;
      const mutationToken = (this.libraryMembershipMutationToken || 0) + 1;
      this.libraryMembershipMutationToken = mutationToken;
      this.libraryTogglePending = true;
      try {
        const result = await libraryRepository.toggleDefault(this.getCurrentLibraryItem());
        if (detailToken !== this.detailLoadToken || mutationToken !== (this.libraryMembershipMutationToken || 0)) {
          return false;
        }
        if (result?.requiresRemovalConfirmation) {
          await this.openLibraryListMenu({
            membershipOverride: result.desiredMembership,
            sourceMode: result.sourceMode,
            destructiveRemovalRequired: true,
            error: SIMKL_DESTRUCTIVE_REMOVAL_MESSAGE
          });
          return true;
        }
        this.isSavedInLibrary = Boolean(result?.isSavedInLibrary);
        this.syncDetailActionButtons();
        return true;
      } finally {
        if (detailToken === this.detailLoadToken && mutationToken === (this.libraryMembershipMutationToken || 0)) {
          this.libraryTogglePending = false;
        }
      }
    },
    cancelPendingPosterHold() {
      if (this.pendingPosterHoldTimer) {
        clearTimeout(this.pendingPosterHoldTimer);
        this.pendingPosterHoldTimer = null;
      }
      this.pendingPosterHoldTarget = null;
    },
    hasPendingPosterHold(node) {
      return this.pendingPosterHoldTarget === node && Boolean(this.pendingPosterHoldTimer);
    },
    startPendingPosterHold(node) {
      this.cancelPendingPosterHold();
      if (!this.isPosterHoldTarget(node)) {
        return;
      }
      this.pendingPosterHoldTarget = node;
      this.pendingPosterHoldTimer = setTimeout(() => {
        this.pendingPosterHoldTimer = null;
        const target = this.pendingPosterHoldTarget;
        this.pendingPosterHoldTarget = null;
        if (target?.isConnected && target.classList.contains("focused")) {
          void this.openPosterOptionsMenu(target);
        }
      }, POSTER_HOLD_DELAY_MS);
    },
    completePendingPosterHold(node, event = null) {
      if (!this.pendingPosterHoldTarget) {
        return false;
      }
      const target = this.pendingPosterHoldTarget;
      const hadTimer = Boolean(this.pendingPosterHoldTimer);
      const heldLongEnough = Number(event?.keyDownDurationMs || 0) >= POSTER_HOLD_DELAY_MS;
      this.cancelPendingPosterHold();
      if (hadTimer && target === node) {
        if (heldLongEnough) {
          void this.openPosterOptionsMenu(target);
        } else {
          this.openMoreLikeDetailFromNode(target);
        }
      }
      return true;
    },
    async openPosterOptionsMenu(node) {
      const parsedItem = posterItemFromNode(node, this.params?.itemType || "movie");
      const item = parsedItem
        ? {
            ...parsedItem,
            addonBaseUrl: parsedItem.addonBaseUrl || this.params?.addonBaseUrl || "",
            addonId: parsedItem.addonId || this.params?.addonId || "",
            addonName: parsedItem.addonName || this.params?.addonName || "",
            catalogType: parsedItem.catalogType || this.params?.catalogType || parsedItem.type || this.params?.itemType || "movie"
          }
        : null;
      if (!item?.id) {
        return false;
      }
      const focusRestore = this.getPosterFocusDescriptor(item.id);
      this.posterOptionsFocusRestore = focusRestore;
      if (!this.posterOptionsController) {
        this.posterOptionsController = new PosterOptionsDialogController({
          onDetails: (target) => {
            Router.navigate("detail", {
              itemId: target.id,
              itemType: target.type || "movie",
              fallbackTitle: target.title || "Untitled",
              fallbackPoster: target.poster || "",
              fallbackBackground: target.background || "",
              addonBaseUrl: target.addonBaseUrl || "",
              addonId: target.addonId || "",
              addonName: target.addonName || "",
              catalogType: target.catalogType || target.type || "movie"
            });
          },
          onDismiss: () => {
            const descriptor = this.posterOptionsFocusRestore;
            this.posterOptionsFocusRestore = null;
            this.focusDetailDescriptor(descriptor);
          },
          onChanged: () => {
            this.render(this.meta, this.posterOptionsFocusRestore || null);
          }
        });
      }
      return this.posterOptionsController.open(item);
    },
    closePosterOptionsMenu() {
      if (!this.posterOptionsController?.dialog) {
        return false;
      }
      this.posterOptionsController.destroy();
      this.posterOptionsFocusRestore = null;
      return true;
    },
    getPosterFocusDescriptor(itemId) {
      const id = String(itemId || "").trim();
      return id ? { selector: `.detail-morelike-card[data-item-id="${escapeSelectorValue(id)}"]` } : null;
    },
    openMoreLikeDetailFromNode(node) {
      const itemId = String(node?.dataset?.itemId || "").trim();
      if (!itemId) {
        return;
      }
      Router.navigate("detail", {
        itemId,
        itemType: node.dataset.itemType || "movie",
        fallbackTitle: node.dataset.itemTitle || "Untitled"
      });
    },
    openTmdbEntityFromNode(node) {
      const entityId = String(node?.dataset?.tmdbId || "").trim();
      if (!/^\d+$/.test(entityId) || Number(entityId) <= 0) {
        // Keep cards without a TMDB id focusable, as on Android TV, but make
        // Enter a safe no-op instead of guessing an entity from its name.
        return false;
      }
      Router.navigate("tmdbEntityBrowse", {
        entityKind: node.dataset.entityKind || "company",
        entityId,
        entityName: node.dataset.companyName || "",
        sourceType: this.meta?.type || this.params?.itemType || "tv"
      });
      return true;
    }
  };
}
