/* eslint-disable no-unused-vars */
import * as internals from "./metaDetailsScreenContext.js";

export function createMetaDetailsScreenMethods05() {
  const {
    Router,
    watchedItemsShareIdentity,
    TmdbMetadataService,
    TmdbSettingsStore,
    detailProgressFraction,
    isDetailProgressCompleted,
    isSeriesDetailMeta,
    buildDetailContentReference,
    normalizePreviewItem
  } = internals;

  return {
    resolveInitialSelectedSeason(progress = null, progressItems = []) {
      const seasons = this.getAvailableSeasons();
      const currentSeason = Number(this.selectedSeason || 0);
      if (this.hasManualSeasonSelection && currentSeason >= 0 && seasons.includes(currentSeason)) {
        return currentSeason;
      }
      const preferredSeason = this.resolvePreferredSeasonFromProgress(progress, progressItems);
      if (preferredSeason != null && (!seasons.length || seasons.includes(preferredSeason))) {
        return preferredSeason;
      }

      if (currentSeason > 0 && seasons.includes(currentSeason)) {
        return currentSeason;
      }

      return seasons[0] ?? 1;
    },
    computeNextEpisodeToWatch(progress) {
      if (!this.episodes?.length) {
        return null;
      }
      const currentEpisode = this.findEpisodeFromProgress(progress);
      const episodes = this.getEpisodeSequence(currentEpisode);
      if (!episodes.length) {
        return null;
      }
      if (currentEpisode && !isDetailProgressCompleted(progress)) {
        return currentEpisode;
      }
      const completedKeys = this.watchedEpisodeKeys instanceof Set ? new Set(this.watchedEpisodeKeys) : new Set();
      if (currentEpisode && isDetailProgressCompleted(progress)) {
        completedKeys.add(`${Number(currentEpisode.season || 0)}:${Number(currentEpisode.episode || 0)}`);
      }
      const isEpisodeCompleted = (episode) => {
        const key = `${Number(episode?.season || 0)}:${Number(episode?.episode || 0)}`;
        if (!key || key === "0:0") {
          return false;
        }
        if (
          currentEpisode &&
          isDetailProgressCompleted(progress) &&
          Number(episode?.season || 0) === Number(currentEpisode.season || 0) &&
          Number(episode?.episode || 0) === Number(currentEpisode.episode || 0)
        ) {
          return true;
        }
        if (this.enrichedWatchedState?.has(key)) {
          return Boolean(this.enrichedWatchedState.get(key)?.isWatched);
        }
        return completedKeys.has(key);
      };
      let latestCompletedIndex = -1;
      episodes.forEach((episode, index) => {
        if (isEpisodeCompleted(episode)) {
          latestCompletedIndex = Math.max(latestCompletedIndex, index);
        }
      });
      if (latestCompletedIndex >= 0) {
        const nextUnwatched = episodes.slice(latestCompletedIndex + 1).find((episode) => !isEpisodeCompleted(episode));
        if (nextUnwatched) {
          return nextUnwatched;
        }
        return episodes.find((episode) => !isEpisodeCompleted(episode)) || episodes[0];
      }
      if (!currentEpisode) {
        return episodes[0];
      }
      const currentIndex = episodes.findIndex(
        (episode) =>
          String(episode?.id || "") === String(currentEpisode?.id || "") ||
          (Number(episode?.season || 0) === Number(currentEpisode?.season || 0) &&
            Number(episode?.episode || 0) === Number(currentEpisode?.episode || 0))
      );
      return episodes[currentIndex + 1] || episodes[currentIndex] || episodes[0];
    },
    buildEpisodeState(progressItems = [], watchedItems = [], remoteWatchedMap = null) {
      const progressMap = new Map();
      const watchedKeys = new Set();
      const contentId = String(this.params?.itemId || "");
      const contentReference = buildDetailContentReference(contentId, this.meta, this.params);
      this.enrichedWatchedState = remoteWatchedMap instanceof Map ? remoteWatchedMap : null;

      (Array.isArray(progressItems) ? progressItems : []).forEach((entry) => {
        if (!watchedItemsShareIdentity(entry, contentReference)) {
          return;
        }
        const season = Number(entry?.season || 0);
        const episode = Number(entry?.episode || 0);
        if (!Number.isFinite(season) || season < 0 || !Number.isFinite(episode) || episode <= 0) {
          return;
        }
        const key = `${season}:${episode}`;
        progressMap.set(key, entry);
        if (isDetailProgressCompleted(entry)) {
          watchedKeys.add(key);
        }
      });

      (Array.isArray(watchedItems) ? watchedItems : []).forEach((entry) => {
        const season = Number(entry?.season || 0);
        const episode = Number(entry?.episode || 0);
        if (
          watchedItemsShareIdentity(entry, contentReference) &&
          Number.isFinite(season) &&
          season >= 0 &&
          Number.isFinite(episode) &&
          episode > 0
        ) {
          watchedKeys.add(`${season}:${episode}`);
        }
      });

      // A current Simkl playback session overrides an older watched marker until
      // it reaches the same 80% completion threshold as Android TV.
      progressMap.forEach((entry, key) => {
        if (
          String(entry?.source || "")
            .trim()
            .toLowerCase() === "simkl_playback" &&
          detailProgressFraction(entry) > 0 &&
          !isDetailProgressCompleted(entry)
        ) {
          watchedKeys.delete(key);
        }
      });

      const animeWatchedKeys = new Set(
        (Array.isArray(watchedItems) ? watchedItems : [])
          .filter((entry) => entry?.episode != null)
          .map((entry) => `${String(entry.contentId || "").toLowerCase()}:${Number(entry.episode || 0)}`)
      );
      (this.episodes || []).forEach((video) => {
        const match = String(video?.id || "").match(/^(mal|anidb|anilist|kitsu):(\d+):(\d+)/i);
        if (!match || !animeWatchedKeys.has(`${match[1].toLowerCase()}:${match[2]}:${Number(match[3])}`)) {
          return;
        }
        const season = Number(video?.season || 0);
        const episode = Number(video?.episode || 0);
        if (season >= 0 && episode > 0) watchedKeys.add(`${season}:${episode}`);
      });

      this.episodeProgressMap = progressMap;
      this.watchedEpisodeKeys = watchedKeys;
    },
    async fetchMovieCollection(meta = {}) {
      try {
        const settings = TmdbSettingsStore.get();
        if (!settings.enabled || !settings.useCollections) {
          return { name: "", items: [] };
        }
        const collectionId = meta?.collectionId || meta?.belongsToCollection?.id || meta?.belongs_to_collection?.id;
        if (!collectionId) {
          return { name: "", items: [] };
        }
        const items = await TmdbMetadataService.fetchMovieCollection({
          collectionId,
          language: settings.language
        });
        const normalized = (Array.isArray(items) ? items : [])
          .map((item) => normalizePreviewItem(item, "movie"))
          .filter((item) => item.id && item.id !== String(meta.id || ""))
          .slice(0, 18);
        return {
          name: meta?.collectionName || meta?.belongsToCollection?.name || meta?.belongs_to_collection?.name || "",
          items: normalized
        };
      } catch (error) {
        console.warn("Movie collection enrichment failed", error);
        return { name: "", items: [] };
      }
    },
    findContinueWatchingEpisodeTarget() {
      const resumeVideoId = String(this.params?.resumeVideoId || "").trim();
      if (resumeVideoId) {
        const directMatch = this.episodes.find((entry) => String(entry?.id || "") === resumeVideoId);
        if (directMatch) {
          return directMatch;
        }
      }
      const resumeSeasonRaw = this.params?.resumeSeason;
      const resumeSeason = Number(resumeSeasonRaw);
      const resumeEpisode = Number(this.params?.resumeEpisode || 0);
      if (resumeSeasonRaw != null && Number.isFinite(resumeSeason) && resumeSeason >= 0 && resumeEpisode > 0) {
        const episodeMatch = this.episodes.find(
          (entry) => Number(entry?.season || 0) === resumeSeason && Number(entry?.episode || 0) === resumeEpisode
        );
        if (episodeMatch) {
          return episodeMatch;
        }
      }
      return this.nextEpisodeToWatch || this.episodes[0] || null;
    },
    maybeAutoOpenContinueWatchingStream() {
      if (!this.params?.autoOpenContinueWatching || this.autoOpenedContinueWatchingStream || this.isBackNavigation) {
        return;
      }
      this.autoOpenedContinueWatchingStream = true;
      const routeStartFromBeginning = Boolean(this.params?.startFromBeginning);
      const extraParams = {
        resumePositionMs: routeStartFromBeginning ? 0 : Number(this.params?.resumeProgressMs || 0) || 0,
        resumeProgressPercent: routeStartFromBeginning
          ? null
          : (this.params?.resumeProgressPercent ?? this.resumeProgress?.progressPercent ?? null),
        resumeDurationMs: routeStartFromBeginning ? 0 : Number(this.params?.resumeDurationMs || this.resumeProgress?.durationMs || 0) || 0,
        startFromBeginning: routeStartFromBeginning,
        manualSelection: Boolean(this.params?.manualSelection),
        returnToDetail: true,
        continueWatchingBackHome: true,
        resumeStreamIdentity: this.params?.resumeStreamIdentity || null
      };
      if (isSeriesDetailMeta(this.meta, this.episodes)) {
        const episode = this.findContinueWatchingEpisodeTarget();
        if (episode) {
          this.navigateToStreamScreenForEpisode(episode, extraParams);
          return;
        }
      }
      this.navigateToStreamScreenForMovie(extraParams);
    },
    maybePlayOnLoad(token = this.detailLoadToken) {
      if (!this.params?.playOnLoad || this.playOnLoadTriggered || this.autoOpenedContinueWatchingStream || this.isBackNavigation) {
        return;
      }
      this.playOnLoadTriggered = true;
      const start = () => {
        if (token !== this.detailLoadToken || !this.container || this.isBackNavigation || this.autoOpenedContinueWatchingStream) {
          return;
        }
        void this.playDefaultFromHero({
          manualSelection: Boolean(this.params?.manualSelection)
        });
      };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => requestAnimationFrame(start));
      } else {
        setTimeout(start, 0);
      }
    },
    getStreamNavigationOptions() {
      // Continue Watching mounts Detail only to resolve the Stream target. Replace
      // that transient browser-history entry too, otherwise it can resurface after
      // the user returns Home and opens a different title.
      return this.params?.autoOpenContinueWatching ? { skipStackPush: true, replaceHistory: true } : {};
    },
    navigateBackFromDetail() {
      if (this.params?.returnToSearchOnBack) {
        Router.navigate(
          "search",
          {},
          {
            isBackNavigation: true,
            skipStackPush: true,
            replaceHistory: true
          }
        );
        return true;
      }
      if (this.params?.returnHomeOnBack) {
        Router.navigate(
          "home",
          {},
          {
            isBackNavigation: true,
            skipStackPush: true,
            replaceHistory: true
          }
        );
        return true;
      }
      return false;
    }
  };
}
