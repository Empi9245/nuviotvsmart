import {
  TraktAuthService,
  requestJson,
  createTraktRequestContext,
  assertTraktRequestContext
} from "./traktAuthService.js";
import { ProfileManager } from "../../core/profile/profileManager.js";

const START_DEBOUNCE_MS = 15000;
const MAX_CONSECUTIVE_FAILURES = 3;
const WATCHED_THRESHOLD_PERCENT = 80;
const FAILURE_RETRY_DELAY_MS = 60000;

let startDebounceTimer = null;
let consecutiveFailures = 0;
let lastAction = null;
let retryAfter = 0;
let playbackRequestContext = null;

function clearStartTimer() {
  if (startDebounceTimer) {
    clearTimeout(startDebounceTimer);
    startDebounceTimer = null;
  }
}

function buildMoviePayload(context) {
  const movie = { title: context.title };
  if (context.year) {
    movie.year = context.year;
  }
  const ids = {};
  if (context.imdbId) {
    ids.imdb = context.imdbId;
  }
  if (context.tmdbId) {
    ids.tmdb = context.tmdbId;
  }
  if (context.traktId) {
    ids.trakt = context.traktId;
  }
  if (Object.keys(ids).length) {
    movie.ids = ids;
  }
  return { movie, progress: context.progressPercent };
}

function buildEpisodePayload(context) {
  const show = { title: context.title };
  if (context.year) {
    show.year = context.year;
  }
  const showIds = {};
  if (context.imdbId) {
    showIds.imdb = context.imdbId;
  }
  if (context.tmdbId) {
    showIds.tmdb = context.tmdbId;
  }
  if (context.traktId) {
    showIds.trakt = context.traktId;
  }
  if (Object.keys(showIds).length) {
    show.ids = showIds;
  }
  const episode = {
    season: context.seasonNumber,
    number: context.episodeNumber
  };
  if (context.episodeTitle) {
    episode.title = context.episodeTitle;
  }
  return { show, episode, progress: context.progressPercent };
}

function buildScrobblePayload(context) {
  return context.contentType === "series"
    ? buildEpisodePayload(context)
    : buildMoviePayload(context);
}

async function markAsWatchedLocally(context) {
  try {
    const { watchedItemsRepository } = await import("./watchedItemsRepository.js");
    const item = {
      contentId: context.contentId,
      contentType: context.contentType,
      imdbId: context.imdbId || null,
      tmdbId: context.tmdbId || null,
      traktId: context.traktId || null,
      watchedAt: Date.now()
    };
    if (context.contentType === "series") {
      item.season = context.seasonNumber;
      item.episode = context.episodeNumber;
    }
    await watchedItemsRepository.mark(item, { skipTrackingWrite: true });
  } catch (error) {
    console.warn("[TraktScrobble] mark-as-watched failed", error);
  }
}

async function sendScrobbleRequest(action, context, requestContext = createTraktRequestContext()) {
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    if (Date.now() < retryAfter) return;
    consecutiveFailures = 0;
  }

  if (!context?.imdbId && !context?.tmdbId && !context?.traktId) {
    return;
  }

  try {
    assertTraktRequestContext(requestContext);
    const profileId = requestContext.profileId;
    const accessToken = await TraktAuthService.getValidAccessToken(profileId);
    assertTraktRequestContext(requestContext);
    if (!accessToken) {
      return;
    }

    const body = buildScrobblePayload(context);
    const { response, payload } = await requestJson(`/scrobble/${action}`, {
      method: "POST",
      body,
      authorization: `Bearer ${accessToken}`,
      requestContext
    });

    if (response.ok || (action === "stop" && response.status === 409)) {
      consecutiveFailures = 0;
      retryAfter = 0;
      lastAction = action;

      if (
        action === "stop" &&
        context.progressPercent >= WATCHED_THRESHOLD_PERCENT &&
        (payload?.action === "scrobble" || response.status === 409) &&
        String(ProfileManager.getActiveProfileId() || "1") === profileId
      ) {
        await markAsWatchedLocally(context);
      }
    } else if (response.status === 422 && Number(context.progressPercent) < 1) {
      // Trakt deliberately ignores a stop before 1%; this is not an outage.
      return;
    } else {
      consecutiveFailures++;
      retryAfter = Date.now() + FAILURE_RETRY_DELAY_MS;
      console.warn(`[TraktScrobble] ${action} failed`, {
        status: response.status,
        failures: consecutiveFailures
      });
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    consecutiveFailures++;
    retryAfter = Date.now() + FAILURE_RETRY_DELAY_MS;
    console.warn(`[TraktScrobble] ${action} error`, {
      error: error.message,
      failures: consecutiveFailures
    });
  }
}

export const TraktScrobbleService = {
  isEnabled() {
    return TraktAuthService.isAuthenticated();
  },

  start(context) {
    clearStartTimer();
    consecutiveFailures = 0;
    retryAfter = 0;
    lastAction = null;
    const requestContext = createTraktRequestContext();
    playbackRequestContext = requestContext;
    startDebounceTimer = setTimeout(() => {
      startDebounceTimer = null;
      void sendScrobbleRequest("start", context, requestContext);
    }, START_DEBOUNCE_MS);
  },

  pause(context) {
    clearStartTimer();
    if (lastAction === "start" || lastAction === null) {
      void sendScrobbleRequest(
        "pause",
        context,
        playbackRequestContext || createTraktRequestContext()
      );
    }
  },

  stop(context) {
    clearStartTimer();
    void sendScrobbleRequest(
      "stop",
      context,
      playbackRequestContext || createTraktRequestContext()
    );
    lastAction = null;
  },

  cancel() {
    clearStartTimer();
    lastAction = null;
    consecutiveFailures = 0;
    retryAfter = 0;
    playbackRequestContext = null;
  }
};
