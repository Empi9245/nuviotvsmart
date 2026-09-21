import { Router } from "../../navigation/routerState.js";

import { ScreenUtils } from "../../navigation/screen.js";

import { metaRepository } from "../../../data/repository/metaRepository.js";

import { watchProgressRepository } from "../../../data/repository/watchProgressRepository.js";

import { savedLibraryRepository } from "../../../data/repository/savedLibraryRepository.js";

import { watchedItemsRepository } from "../../../data/repository/watchedItemsRepository.js";

import { watchedItemsShareIdentity } from "../../../data/repository/watchedIdentity.js";

import { watchedTitleStateRepository } from "../../../data/repository/watchedTitleStateRepository.js";

import { libraryRepository, LibrarySourceMode } from "../../../data/repository/libraryRepository.js";

import { detailWatchedEnrichmentService } from "../../../data/repository/detailWatchedEnrichmentService.js";

import { watchedSeriesReconciliationService } from "../../../data/repository/watchedSeriesReconciliationService.js";

import { TmdbService } from "../../../core/tmdb/tmdbService.js";

import { TmdbMetadataService } from "../../../core/tmdb/tmdbMetadataService.js";

import { normalizeTmdbBackdropUrl } from "../../../core/tmdb/tmdbImageUrl.js";

import { LayoutPreferences } from "../../../data/local/layoutPreferences.js";

import { showHomeRatings, showStandardDetailRatings } from "../../../core/util/imdbRatingVisibility.js";

import { imdbEpisodeRatingsRepository } from "../../../data/repository/imdbEpisodeRatingsRepository.js";

import { formatHeroRuntime, normalizeEpisodeImdbRating, parseEpisodeRuntimeMinutes } from "./episodeCardMetadata.js";

import { mdbListRepository } from "../../../data/repository/mdbListRepository.js";

import { TmdbSettingsStore } from "../../../data/local/tmdbSettingsStore.js";

import { PlayerSettingsStore } from "../../../data/local/playerSettingsStore.js";

import { MoreLikeThisSourcePreference, TraktSettingsStore, WatchProgressSource } from "../../../data/local/traktSettingsStore.js";

import { requestJson as traktRequestJson, TraktAuthService } from "../../../data/repository/traktAuthService.js";

import { toTraktImageUrl } from "../../../core/trakt/traktImageUrl.js";

import { supportsMembershipFor } from "../../../core/tracking/trackingLibraryMembership.js";

import { Environment } from "../../../platform/environment.js";

import { Platform } from "../../../platform/index.js";

import { getTvRuntimePerformanceProfile } from "../../../platform/tvRuntimePerformance.js";

import { TMDB_API_KEY, TRAKT_API_URL, TRAKT_CLIENT_ID, YOUTUBE_PROXY_URL } from "../../../config.js";

import { I18n } from "../../../i18n/index.js";

import { localizedGenreLabel } from "../../../i18n/genreLabels.js";

import { contentTextDirection } from "../../../core/util/contentTextDirection.js";

import { mdbListRatingIcon } from "../../../core/util/mdbListRatingStatus.js";

import { NuvioDialog } from "../../components/nuvioDialog.js";

import { renderLoadingIndicator } from "../../components/loadingIndicator.js";

import { resolveMovieStreamIdentity } from "./movieStreamIdentity.js";

import { posterItemFromNode, PosterOptionsDialogController } from "../../components/posterOptionsMenu.js";

import { StreamPreferencesStore } from "../../../data/local/streamPreferencesStore.js";

import { buildWatchedTitleIdSet, isTitleItemWatched } from "../../components/watchedTitleBadge.js";

import {
  getWatchProgressFraction,
  isWatchProgressCompleted,
  isWatchProgressInProgress,
  watchProgressCompletedThreshold,
  resolveWatchProgressResumePositionMs
} from "../../../domain/model/watchProgress.js";

import { TMDB_BASE_URL } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { EPISODE_HOLD_DELAY_MS } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { POSTER_HOLD_DELAY_MS } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { HERO_HOLD_DELAY_MS } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { TRAKT_COMMENTS_LIMIT } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { DETAIL_SCROLL_STIFFNESS } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { DETAIL_SCROLL_DAMPING_RATIO } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { DETAIL_TAB_FOCUS_TARGET } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { DETAIL_ROW_FOCUS_TARGET } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { DETAIL_SCROLL_MAX_FRAME_SECONDS } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { EPISODE_VIRTUALIZATION_THRESHOLD } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { EPISODE_VIRTUALIZATION_MIN_WINDOW } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { EPISODE_VIRTUALIZATION_OVERSCAN } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { EPISODE_VIRTUALIZATION_DEFAULT_CARD_WIDTH } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { EPISODE_VIRTUALIZATION_DEFAULT_GAP } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { EPISODE_TITLE_MARQUEE_VELOCITY_PX_PER_SECOND } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { RTL_DETAIL_LANGUAGES } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { SIMKL_DESTRUCTIVE_REMOVAL_MESSAGE } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { EPISODE_SCROLL_REPEAT_THROTTLE_MS } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { LOCAL_YOUTUBE_PROXY_URL } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { t } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { isRtlDetailLocale } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { detailImageLoadingMode } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { resolveDetailBackdropUrl } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { firstNonNegativeInt } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { parseSeasonEpisodeFromId } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { resolveSeasonEpisode } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { toEpisodeEntry } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { shouldSynthesizeAddonVideoEpisodes } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { sortEpisodeEntries } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { normalizeEpisodes } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { detailProgressFraction } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { isDetailProgressCompleted } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { isSimklProgressSourceSelected } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { getDetailAllProgressPromise } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { hasCompletedSimklMovieProgress } from "./metaDetailsScreenHelpers-01-tmdb-base-url.js";

import { hasInProgressSimklMovieProgress } from "./metaDetailsScreenHelpers-02-has-in-progress-simkl-movie-progress.js";

import { pushUniqueResumeId } from "./metaDetailsScreenHelpers-02-has-in-progress-simkl-movie-progress.js";

import { buildResumeContentIds } from "./metaDetailsScreenHelpers-02-has-in-progress-simkl-movie-progress.js";

import { formatResumeRemaining } from "./metaDetailsScreenHelpers-02-has-in-progress-simkl-movie-progress.js";

import { isSeriesDetailMeta } from "./metaDetailsScreenHelpers-02-has-in-progress-simkl-movie-progress.js";

import { resolveWatchedProjectionType } from "./metaDetailsScreenHelpers-02-has-in-progress-simkl-movie-progress.js";

import { buildDetailContentReference } from "./metaDetailsScreenHelpers-02-has-in-progress-simkl-movie-progress.js";

import { isDetailTitleWatched } from "./metaDetailsScreenHelpers-02-has-in-progress-simkl-movie-progress.js";

import { resolvePlayableDetailType } from "./metaDetailsScreenHelpers-02-has-in-progress-simkl-movie-progress.js";

import { resolveMetaImdbId } from "./metaDetailsScreenHelpers-02-has-in-progress-simkl-movie-progress.js";

import { resolveMetaTmdbId } from "./metaDetailsScreenHelpers-02-has-in-progress-simkl-movie-progress.js";

import { resolveMetaTraktId } from "./metaDetailsScreenHelpers-02-has-in-progress-simkl-movie-progress.js";

import { resolveMetaOriginalLanguage } from "./metaDetailsScreenHelpers-02-has-in-progress-simkl-movie-progress.js";

import { metaWithRouteExternalIds } from "./metaDetailsScreenHelpers-03-meta-with-route-external-ids.js";

import { extractCast } from "./metaDetailsScreenHelpers-03-meta-with-route-external-ids.js";

import { isBackEvent } from "./metaDetailsScreenHelpers-03-meta-with-route-external-ids.js";

import { getDpadDirection } from "./metaDetailsScreenHelpers-03-meta-with-route-external-ids.js";

import { getTrailerSeekStepSeconds } from "./metaDetailsScreenHelpers-03-meta-with-route-external-ids.js";

import { getTrailerMediaAction } from "./metaDetailsScreenHelpers-03-meta-with-route-external-ids.js";

import { withTimeout } from "./metaDetailsScreenHelpers-03-meta-with-route-external-ids.js";

import { detectQuality } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { renderImdbBadge } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { formatRatingValue } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { formatMdbListRating } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { hasMdbListRatings } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { normalizeGenreList } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { mergeGenreLists } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { formatMovieReleaseDate } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { resolveImdbRating } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { addonRatingsBySeason } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { mergeSeasonRatings } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { resolveEpisodeImdbRating } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { formatRuntimeMinutes } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { formatDurationMinutes } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { resolveEpisodeRuntimeForSeason } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { renderPlayGlyph } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { renderTrailerGlyph } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { renderLibraryGlyph } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { renderWatchedBadgeGlyph } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { renderWatchedGlyph } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { ratingToneClass } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { getAddonIconPath } from "./metaDetailsScreenHelpers-04-detect-quality.js";

import { getAddonBadgeLabel } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { renderStreamAddonIcon } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { escapeHtml } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { escapeAttribute } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { escapeSelectorValue } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { normalizeCountryLabel } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { normalizePreviewItem } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { bestTraktArtwork } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { bestTraktLandscapeArtwork } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { bestTraktBackdropArtwork } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { traktRelatedPreview } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { normalizeEpisodeTitle } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { extractPreviewYear } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { resolveYoutubeId } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { shouldUseDirectYoutubeEmbedOnTv } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { getYoutubeProxyBaseUrl } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { resolveTrailerPostMessageTargetOrigin } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { resolveTrailerTrustedProxyOrigin } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { buildDirectYoutubeEmbedUrl } from "./metaDetailsScreenHelpers-05-get-addon-badge-label.js";

import { buildYoutubeEmbedUrl } from "./metaDetailsScreenHelpers-06-build-youtube-embed-url.js";

import { buildInlineYoutubePlayerUrl } from "./metaDetailsScreenHelpers-06-build-youtube-embed-url.js";

import { resolveTrailerSource } from "./metaDetailsScreenHelpers-06-build-youtube-embed-url.js";

import { resolveTmdbTrailerSource } from "./metaDetailsScreenHelpers-06-build-youtube-embed-url.js";

import { resolveTrailerItems } from "./metaDetailsScreenHelpers-06-build-youtube-embed-url.js";

import { stripTraktSpoilerMarkup } from "./metaDetailsScreenHelpers-06-build-youtube-embed-url.js";

import { containsTraktInlineSpoiler } from "./metaDetailsScreenHelpers-06-build-youtube-embed-url.js";

import { formatEpisodeCardDate } from "./metaDetailsScreenHelpers-06-build-youtube-embed-url.js";

import { renderEpisodeRuntimeLabel } from "./metaDetailsScreenHelpers-07-render-episode-runtime-label.js";

import { formatPlaybackTime } from "./metaDetailsScreenHelpers-07-render-episode-runtime-label.js";

import { normalizeTrailerProxyStatePayload } from "./metaDetailsScreenHelpers-07-render-episode-runtime-label.js";

import { captureHorizontalScrollMap } from "./metaDetailsScreenHelpers-07-render-episode-runtime-label.js";

export {
  Router,
  ScreenUtils,
  metaRepository,
  watchProgressRepository,
  savedLibraryRepository,
  watchedItemsRepository,
  watchedItemsShareIdentity,
  watchedTitleStateRepository,
  libraryRepository,
  LibrarySourceMode,
  detailWatchedEnrichmentService,
  watchedSeriesReconciliationService,
  TmdbService,
  TmdbMetadataService,
  normalizeTmdbBackdropUrl,
  LayoutPreferences,
  showHomeRatings,
  showStandardDetailRatings,
  imdbEpisodeRatingsRepository,
  formatHeroRuntime,
  normalizeEpisodeImdbRating,
  parseEpisodeRuntimeMinutes,
  mdbListRepository,
  TmdbSettingsStore,
  PlayerSettingsStore,
  MoreLikeThisSourcePreference,
  TraktSettingsStore,
  WatchProgressSource,
  traktRequestJson,
  TraktAuthService,
  toTraktImageUrl,
  supportsMembershipFor,
  Environment,
  Platform,
  getTvRuntimePerformanceProfile,
  TMDB_API_KEY,
  TRAKT_API_URL,
  TRAKT_CLIENT_ID,
  YOUTUBE_PROXY_URL,
  I18n,
  localizedGenreLabel,
  contentTextDirection,
  mdbListRatingIcon,
  NuvioDialog,
  renderLoadingIndicator,
  resolveMovieStreamIdentity,
  posterItemFromNode,
  PosterOptionsDialogController,
  StreamPreferencesStore,
  buildWatchedTitleIdSet,
  isTitleItemWatched,
  getWatchProgressFraction,
  isWatchProgressCompleted,
  isWatchProgressInProgress,
  watchProgressCompletedThreshold,
  resolveWatchProgressResumePositionMs,
  TMDB_BASE_URL,
  EPISODE_HOLD_DELAY_MS,
  POSTER_HOLD_DELAY_MS,
  HERO_HOLD_DELAY_MS,
  TRAKT_COMMENTS_LIMIT,
  DETAIL_SCROLL_STIFFNESS,
  DETAIL_SCROLL_DAMPING_RATIO,
  DETAIL_TAB_FOCUS_TARGET,
  DETAIL_ROW_FOCUS_TARGET,
  DETAIL_SCROLL_MAX_FRAME_SECONDS,
  EPISODE_VIRTUALIZATION_THRESHOLD,
  EPISODE_VIRTUALIZATION_MIN_WINDOW,
  EPISODE_VIRTUALIZATION_OVERSCAN,
  EPISODE_VIRTUALIZATION_DEFAULT_CARD_WIDTH,
  EPISODE_VIRTUALIZATION_DEFAULT_GAP,
  EPISODE_TITLE_MARQUEE_VELOCITY_PX_PER_SECOND,
  RTL_DETAIL_LANGUAGES,
  SIMKL_DESTRUCTIVE_REMOVAL_MESSAGE,
  EPISODE_SCROLL_REPEAT_THROTTLE_MS,
  LOCAL_YOUTUBE_PROXY_URL,
  t,
  isRtlDetailLocale,
  detailImageLoadingMode,
  resolveDetailBackdropUrl,
  firstNonNegativeInt,
  parseSeasonEpisodeFromId,
  resolveSeasonEpisode,
  toEpisodeEntry,
  shouldSynthesizeAddonVideoEpisodes,
  sortEpisodeEntries,
  normalizeEpisodes,
  detailProgressFraction,
  isDetailProgressCompleted,
  isSimklProgressSourceSelected,
  getDetailAllProgressPromise,
  hasCompletedSimklMovieProgress,
  hasInProgressSimklMovieProgress,
  pushUniqueResumeId,
  buildResumeContentIds,
  formatResumeRemaining,
  isSeriesDetailMeta,
  resolveWatchedProjectionType,
  buildDetailContentReference,
  isDetailTitleWatched,
  resolvePlayableDetailType,
  resolveMetaImdbId,
  resolveMetaTmdbId,
  resolveMetaTraktId,
  resolveMetaOriginalLanguage,
  metaWithRouteExternalIds,
  extractCast,
  isBackEvent,
  getDpadDirection,
  getTrailerSeekStepSeconds,
  getTrailerMediaAction,
  withTimeout,
  detectQuality,
  renderImdbBadge,
  formatRatingValue,
  formatMdbListRating,
  hasMdbListRatings,
  normalizeGenreList,
  mergeGenreLists,
  formatMovieReleaseDate,
  resolveImdbRating,
  addonRatingsBySeason,
  mergeSeasonRatings,
  resolveEpisodeImdbRating,
  formatRuntimeMinutes,
  formatDurationMinutes,
  resolveEpisodeRuntimeForSeason,
  renderPlayGlyph,
  renderTrailerGlyph,
  renderLibraryGlyph,
  renderWatchedBadgeGlyph,
  renderWatchedGlyph,
  ratingToneClass,
  getAddonIconPath,
  getAddonBadgeLabel,
  renderStreamAddonIcon,
  escapeHtml,
  escapeAttribute,
  escapeSelectorValue,
  normalizeCountryLabel,
  normalizePreviewItem,
  bestTraktArtwork,
  bestTraktLandscapeArtwork,
  bestTraktBackdropArtwork,
  traktRelatedPreview,
  normalizeEpisodeTitle,
  extractPreviewYear,
  resolveYoutubeId,
  shouldUseDirectYoutubeEmbedOnTv,
  getYoutubeProxyBaseUrl,
  resolveTrailerPostMessageTargetOrigin,
  resolveTrailerTrustedProxyOrigin,
  buildDirectYoutubeEmbedUrl,
  buildYoutubeEmbedUrl,
  buildInlineYoutubePlayerUrl,
  resolveTrailerSource,
  resolveTmdbTrailerSource,
  resolveTrailerItems,
  stripTraktSpoilerMarkup,
  containsTraktInlineSpoiler,
  formatEpisodeCardDate,
  renderEpisodeRuntimeLabel,
  formatPlaybackTime,
  normalizeTrailerProxyStatePayload,
  captureHorizontalScrollMap
};
