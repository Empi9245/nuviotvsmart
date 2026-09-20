/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";

export function createPlayerScreenMethods02() {
  const {
    PlayerSettingsStore,
    isAutoPlayEffectivelyEnabled,
    metaRepository,
    Router,
    mdbListRatingIcon,
    normalizePlayerEpisodeMetadata,
    normalizeItemType,
    isSeriesItemType,
    escapeHtml,
    escapeAttribute
  } = internals;

  return {
    getPostPlayState() {
      return (
        this.postPlayRecommendationController?.getState?.() || {
          recommendation: null,
          recommendations: [],
          recommendationIndex: 0,
          recommendationCount: 0,
          isLoadingRecommendation: false,
          isChangingRecommendation: false,
          isLoadingTrailer: false,
          isVisible: false,
          hasReturnedToPlayer: false,
          countdownSeconds: null,
          countdownKind: "",
          isTrailerPlaying: false,
          hasAutoPlayedTrailer: false,
          canNavigatePrevious: false,
          canNavigateNext: false,
          canReturnToPlayer: false,
          blocksNaturalCompletion: false
        }
      );
    },
    isPostPlayVisible() {
      return Boolean(this.getPostPlayState().isVisible);
    },
    isPostPlayLoading() {
      return Boolean(this.getPostPlayState().isLoadingRecommendation);
    },
    getPostPlayCurrentTitle() {
      return String(this.params?.playerTitle || this.params?.itemTitle || this.params?.title || this.params?.itemId || "").trim() || "";
    },
    getPostPlaySourceAddonBaseUrl() {
      return String(
        this.activePlaybackSourceContext?.addonBaseUrl ||
          this.activePlaybackSourceContext?.baseUrl ||
          this.params?.addonBaseUrl ||
          this.params?.sourceAddonBaseUrl ||
          ""
      ).trim();
    },
    isPostPlayManualPlayOptionEnabled() {
      return isAutoPlayEffectivelyEnabled(PlayerSettingsStore.get());
    },
    isPostPlayEpisodeMetadataResolved() {
      if (!isSeriesItemType(this.params?.itemType || "movie")) {
        return true;
      }
      return Boolean(this.postPlayEpisodeMetadataResolved);
    },
    async loadPostPlayEpisodeMetadata(mountToken = null) {
      const itemType = normalizeItemType(this.params?.itemType || "movie");
      if (
        !isSeriesItemType(itemType) ||
        this.isExternalFrameMode() ||
        this.isPostPlayEpisodeMetadataResolved() ||
        !this.isActiveMountToken(mountToken)
      ) {
        return;
      }

      const itemId = String(this.params?.itemId || this.params?.contentId || "").trim();
      if (!itemId) {
        return;
      }

      try {
        // Match Android's player-runtime ownership: resolve the canonical series
        // metadata independently of whatever extras the stream route carried.
        const result = await metaRepository.getMetaFromAllAddons(itemType, itemId);
        if (!this.isActiveMountToken(mountToken) || Router.getCurrent() !== "player" || result?.status !== "success" || !result?.data) {
          return;
        }

        this.episodes = normalizePlayerEpisodeMetadata(result.data.videos, {
          fallbackSeason: this.params?.season
        });
        this.postPlayEpisodeMetadataProvided = true;
        this.postPlayEpisodeMetadataResolved = true;

        const currentVideoId = String(this.params?.videoId || "").trim();
        const currentEpisodeIndex = currentVideoId
          ? this.episodes.findIndex((episode) => String(episode?.id || "") === currentVideoId)
          : -1;
        if (currentEpisodeIndex >= 0) {
          this.episodePanelIndex = currentEpisodeIndex;
        } else {
          const currentSeason = this.params?.season == null ? null : Number(this.params.season);
          const currentEpisode = Number(this.params?.episode || 0);
          const positionIndex = this.episodes.findIndex(
            (episode) => (currentSeason == null || Number(episode?.season) === currentSeason) && Number(episode?.episode) === currentEpisode
          );
          if (positionIndex >= 0) {
            this.episodePanelIndex = positionIndex;
          }
        }

        if (this.episodePanelVisible) {
          this.syncEpisodePanelSeasonToIndex();
          this.renderEpisodePanel();
        }
        this.evaluatePostPlayRecommendation();
      } catch (error) {
        // Android keeps the metadata gate unresolved on failure. Failing closed
        // prevents a missing next-episode decision from changing post-play
        // behavior or competing with autoplay.
        if (this.isActiveMountToken(mountToken)) {
          console.warn("Player episode metadata load failed", error);
        }
      }
    },
    blocksPostPlayRecommendation() {
      return Boolean(
        this.seekOverlayVisible ||
        this.seekPreviewSeconds != null ||
        this.pauseOverlayVisible ||
        this.pauseOverlayTimer ||
        this.sourcesPanelVisible ||
        this.episodePanelVisible ||
        this.subtitleDialogVisible ||
        this.audioDialogVisible ||
        this.speedDialogVisible ||
        this.moreActionsVisible ||
        this.stillWatchingPromptVisible ||
        this.parentalGuideVisible
      );
    },
    buildPostPlayRecommendationSnapshot({ playbackEnded = this.postPlayPlaybackEnded } = {}) {
      const settings = PlayerSettingsStore.get();
      const rawContentType = normalizeItemType(this.params?.itemType || "movie");
      const contentType = isSeriesItemType(rawContentType) ? "series" : rawContentType;
      const current = Number(this.getPlaybackCurrentSeconds() || 0);
      const duration = Number(this.getPlaybackDurationSeconds() || 0);
      const nextEpisode = this.resolveNextEpisodeInfo();
      const positionMs = Number.isFinite(current) && current > 0 ? Math.round(current * 1000) : 0;
      const durationMs = Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : 0;
      const nextEpisodeThresholdReached = isSeriesItemType(rawContentType)
        ? this.getNextEpisodeCardThresholdReached(current, duration)
        : false;
      return {
        contentType,
        contentId: this.params?.itemId || this.params?.contentId || this.params?.videoId || "",
        videoId: this.params?.videoId || "",
        season: this.params?.season ?? null,
        episode: this.params?.episode ?? null,
        currentTitle: this.getPostPlayCurrentTitle(),
        poster: this.params?.playerPosterUrl || this.params?.poster || "",
        backdrop: this.params?.playerBackdropUrl || this.params?.backdrop || "",
        imdbId: this.params?.imdbId || this.params?.imdb_id || "",
        tmdbId: this.params?.tmdbId || this.params?.tmdb_id || "",
        traktId: this.params?.traktId || this.params?.trakt_id || "",
        sourceAddonBaseUrl: this.getPostPlaySourceAddonBaseUrl(),
        contentLanguage: this.contentLanguage || this.params?.contentLanguage || "",
        enabled: settings.postPlayRecommendationsEnabled !== false,
        movieThresholdPercent: settings.postPlayMovieThresholdPercent,
        skipIntervals: settings.skipIntroEnabled ? this.skipIntervals : [],
        episodeThresholdMode: settings.nextEpisodeThresholdMode,
        episodeThresholdPercent: settings.nextEpisodeThresholdPercent,
        episodeThresholdMinutesBeforeEnd: settings.nextEpisodeThresholdMinutesBeforeEnd,
        nextEpisodeMetadataResolved: this.isPostPlayEpisodeMetadataResolved(),
        nextEpisodeHasAired: nextEpisode?.hasAired ?? null,
        seriesThresholdReached: nextEpisodeThresholdReached,
        hasFatalError: this.hasFatalPlaybackError(),
        hasBlockingInteraction: this.blocksPostPlayRecommendation(),
        playbackEnded: Boolean(playbackEnded),
        positionMs,
        durationMs,
        hasActiveAutoPlay: Boolean(this.nextEpisodeLaunching || this.switchingEpisode),
        nextEpisodeVideoId: nextEpisode?.videoId || null
      };
    },
    evaluatePostPlayRecommendation({ playbackEnded = false } = {}) {
      if (playbackEnded) {
        this.postPlayPlaybackEnded = true;
      }
      if (!this.postPlayRecommendationController || this.isExternalFrameMode()) {
        return this.getPostPlayState();
      }
      return this.postPlayRecommendationController.update(
        this.buildPostPlayRecommendationSnapshot({
          playbackEnded: playbackEnded || this.postPlayPlaybackEnded
        })
      );
    },
    onPostPlayRecommendationStateChange(state = this.getPostPlayState()) {
      const wasVisible = Boolean(this.postPlayLastVisible);
      const wasTrailerPlaying = Boolean(this.postPlayLastTrailerPlaying);
      const previousIndex = Number(this.postPlayLastRecommendationIndex);
      const currentIndex = Number(state.recommendationIndex ?? -1);
      const becameVisible = Boolean(state.isVisible) && !wasVisible;
      const changedTrailerPlaying = wasTrailerPlaying !== Boolean(state.isTrailerPlaying);
      const changedIndex = Boolean(state.isVisible) && previousIndex >= 0 && currentIndex >= 0 && currentIndex !== previousIndex;
      this.postPlayLastVisible = Boolean(state.isVisible);
      this.postPlayLastTrailerPlaying = Boolean(state.isTrailerPlaying);
      this.postPlayLastRecommendationIndex = currentIndex;
      if (changedIndex) {
        this.postPlayDescriptionTruncated = false;
      }
      this.renderPostPlayRecommendation();
      this.syncPlayerOverlayLayoutState();

      if (becameVisible) {
        this.schedulePostPlayFocus("primary", 420);
      } else if (changedIndex) {
        const directionalAction = currentIndex > previousIndex ? "next" : "previous";
        this.clearPostPlayFocusTimer();
        const focusAfterTransition = () => {
          if (this.isPostPlayVisible()) {
            this.focusPostPlayAction(directionalAction);
          }
        };
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => requestAnimationFrame(focusAfterTransition));
        } else {
          this.schedulePostPlayFocus(directionalAction, 32);
        }
      } else if (changedTrailerPlaying && state.isVisible) {
        // Android re-requests the primary action 420ms after either side of the
        // trailer takeover transition, so focus never remains on a button that
        // has just been removed from the action row.
        this.postPlayFocusedAction = "primary";
        this.schedulePostPlayFocus("primary", 420);
      }

      if (this.postPlayNaturalEndPending && !state.blocksNaturalCompletion) {
        this.postPlayNaturalEndPending = false;
        void this.finishNaturalPlaybackEnded();
      }
    },
    renderPostPlayStandardRatings(recommendation = {}) {
      const items = [];
      const parsePositiveRating = (value) => {
        const parsed = Number(
          String(value ?? "")
            .trim()
            .replace(",", ".")
        );
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      };
      const imdbRating = recommendation.showStandardRatings ? parsePositiveRating(recommendation.imdbRating) : null;
      const tmdbRating = recommendation.showStandardRatings ? parsePositiveRating(recommendation.tmdbRating) : null;
      if (imdbRating != null) {
        items.push(`
            <span class="player-post-play-rating player-post-play-standard-rating">
              <img src="assets/icons/imdb_logo_2016.svg" alt="IMDb" />
              <span>${escapeHtml(imdbRating.toFixed(1))}</span>
            </span>
          `);
      }
      if (tmdbRating != null) {
        items.push(`
            <span class="player-post-play-rating player-post-play-standard-rating">
              <img src="assets/icons/mdblist_tmdb.svg" alt="TMDB" />
              <span>${escapeHtml(String(Math.trunc(tmdbRating * 10)))}</span>
            </span>
          `);
      }
      return items.length
        ? `<div class="player-post-play-standard-ratings">${items.join('<span class="player-post-play-rating-separator">•</span>')}</div>`
        : "";
    },
    renderPostPlayMdbListRatings(recommendation = {}) {
      const ratings = recommendation.mdbListRatings || {};
      const items = [];
      const formatRating = (provider, value) => {
        const raw = String(value ?? "").trim();
        if (!raw) {
          return "";
        }
        const parsed = Number(raw.replace(",", "."));
        if (!Number.isFinite(parsed)) {
          return raw.replace(",", ".");
        }
        const fixed = parsed.toFixed(1);
        return ["imdb", "tmdb", "letterboxd"].includes(provider) ? fixed : fixed.replace(/\.0$/, "");
      };
      const external = [
        ["trakt", "assets/icons/mdblist_trakt.svg"],
        ["imdb", "assets/icons/imdb_logo_2016.svg"],
        ["tmdb", "assets/icons/mdblist_tmdb.svg"],
        ["letterboxd", "assets/icons/mdblist_letterboxd.svg"],
        ["mal", "assets/icons/mdblist_mal.svg"],
        ["tomatoes", mdbListRatingIcon("tomatoes", ratings.tomatoes, ratings)],
        ["audience", mdbListRatingIcon("audience", ratings.audience, ratings)],
        ["metacritic", "assets/icons/mdblist_metacritic.png"]
      ];
      external.forEach(([provider, icon]) => {
        const value = ratings[provider];
        if (value == null || String(value).trim() === "") {
          return;
        }
        items.push(`
            <span class="player-post-play-rating player-post-play-external-rating">
              <img src="${escapeAttribute(icon)}" alt="${escapeAttribute(provider)}" />
              <span>${escapeHtml(formatRating(provider, value))}</span>
            </span>
          `);
      });
      return items.length ? `<div class="player-post-play-mdblist-ratings" aria-label="Ratings">${items.join("")}</div>` : "";
    }
  };
}
