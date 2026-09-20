/* eslint-disable no-unused-vars */
import * as internals from "./traktAuthService.js";

export function createTraktAuthServiceMethods01() {
  const {
    TRAKT_CLIENT_ID,
    TRAKT_CLIENT_SECRET,
    TRAKT_REDIRECT_URI,
    AuthManager,
    TraktAuthStore,
    detailWatchedEnrichmentService,
    WATCHED_MOVIES_PAGE_LIMIT,
    WATCHED_SHOWS_PAGE_LIMIT,
    hasRequiredCredentials,
    normalizeAuthErrorMessage,
    sleep,
    fetchWatchedPages,
    requestJson,
    isTokenExpiredOrExpiring,
    fetchUserSettings,
    normalizeHistoryItem,
    normalizeWatchlistItem,
    normalizePlaybackItem,
    normalizeWatchedShowItem,
    normalizeWatchedProgress,
    normalizeWatchedMovieItem
  } = internals;

  return {
    getCurrentAuthState() {
      return TraktAuthStore.get();
    },
    isAuthenticated() {
      return TraktAuthStore.isAuthenticated();
    },
    async startDeviceAuth() {
      if (!hasRequiredCredentials()) {
        throw new Error("Missing TRAKT credentials");
      }

      const current = TraktAuthStore.get();
      if (current.deviceCode && current.expiresAt && Date.now() < Number(current.expiresAt)) {
        return current;
      }

      const requestSignal = AuthManager.getSessionSignal?.() || null;
      let { response, payload } = await requestJson("/oauth/device/code", {
        method: "POST",
        body: { client_id: TRAKT_CLIENT_ID },
        signal: requestSignal
      });

      if (response.status === 429) {
        const retryAfterSeconds = Number(response.headers.get("Retry-After") || 0);
        if (retryAfterSeconds >= 1 && retryAfterSeconds <= 10) {
          await sleep(retryAfterSeconds * 1000, requestSignal);
          ({ response, payload } = await requestJson("/oauth/device/code", {
            method: "POST",
            body: { client_id: TRAKT_CLIENT_ID },
            signal: requestSignal
          }));
        }
      }

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("Retry-After") || 300);
          const minutes = Math.ceil(retryAfter / 60);
          throw new Error(`Trakt is rate limiting requests. Try again in ~${minutes} min`);
        }
        throw new Error(normalizeAuthErrorMessage(payload, `Failed to start Trakt auth (${response.status})`));
      }

      return TraktAuthStore.saveDeviceFlow(payload);
    },
    async pollDeviceToken() {
      if (!hasRequiredCredentials()) {
        return { type: "failed", message: "Missing TRAKT credentials" };
      }
      const state = TraktAuthStore.get();
      if (!state.deviceCode) {
        return { type: "failed", message: "No active Trakt device code" };
      }
      if (state.expiresAt && Date.now() >= Number(state.expiresAt)) {
        TraktAuthStore.clearDeviceFlow();
        return { type: "expired" };
      }

      const { response, payload } = await requestJson("/oauth/device/token", {
        method: "POST",
        body: {
          code: state.deviceCode,
          client_id: TRAKT_CLIENT_ID,
          client_secret: TRAKT_CLIENT_SECRET
        }
      });

      if (response.ok && payload) {
        TraktAuthStore.saveToken(payload);
        const username = await fetchUserSettings();
        return { type: "approved", username };
      }

      if (response.status === 400) {
        return { type: "pending" };
      }
      if (response.status === 409) {
        TraktAuthStore.clearDeviceFlow();
        return { type: "already_used" };
      }
      if (response.status === 410) {
        TraktAuthStore.clearDeviceFlow();
        return { type: "expired" };
      }
      if (response.status === 418) {
        TraktAuthStore.clearDeviceFlow();
        return { type: "denied" };
      }
      if (response.status === 429) {
        const interval = Math.min(60, Math.max(5, Number(state.pollInterval || 5) + 5));
        TraktAuthStore.updatePollInterval(interval);
        return { type: "slow_down", pollIntervalSeconds: interval };
      }
      return {
        type: "failed",
        message: normalizeAuthErrorMessage(payload, `Token polling failed (${response.status})`)
      };
    },
    async refreshTokenIfNeeded(force = false) {
      if (!hasRequiredCredentials()) {
        return false;
      }
      const state = TraktAuthStore.get();
      if (!state.refreshToken) {
        return false;
      }
      if (!force && !isTokenExpiredOrExpiring(state)) {
        return true;
      }

      const { response, payload } = await requestJson("/oauth/token", {
        method: "POST",
        body: {
          refresh_token: state.refreshToken,
          client_id: TRAKT_CLIENT_ID,
          client_secret: TRAKT_CLIENT_SECRET,
          redirect_uri: TRAKT_REDIRECT_URI || "urn:ietf:wg:oauth:2.0:oob",
          grant_type: "refresh_token"
        }
      });

      if (!response.ok || !payload) {
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          TraktAuthStore.clearAuth();
        }
        return false;
      }
      TraktAuthStore.saveToken(payload);
      await fetchUserSettings();
      return true;
    },
    async getValidAccessToken() {
      const state = TraktAuthStore.get();
      if (!state.accessToken) {
        return null;
      }
      if (isTokenExpiredOrExpiring(state)) {
        const refreshed = await this.refreshTokenIfNeeded(true);
        if (!refreshed) {
          return null;
        }
        return TraktAuthStore.get().accessToken;
      }
      return state.accessToken;
    },
    async disconnect() {
      const state = TraktAuthStore.get();
      if (hasRequiredCredentials() && state.accessToken) {
        try {
          await requestJson("/oauth/revoke", {
            method: "POST",
            body: {
              token: state.accessToken,
              client_id: TRAKT_CLIENT_ID,
              client_secret: TRAKT_CLIENT_SECRET
            }
          });
        } catch (error) {
          console.warn("Trakt revoke failed", error);
        }
      }
      detailWatchedEnrichmentService.invalidateAllCache();
      TraktAuthStore.clearAuth();
    },
    async fetchStats(forceRefresh = false) {
      const state = TraktAuthStore.get();
      const username = state.userSlug || state.username;
      if (!username) {
        await fetchUserSettings();
      }
      const nextState = TraktAuthStore.get();
      const userId = nextState.userSlug || nextState.username || "me";
      const token = await this.getValidAccessToken();
      if (!token) {
        return null;
      }
      const cacheKey = `traktCachedStats:${userId}`;
      const cached = forceRefresh ? null : JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (cached && Date.now() - Number(cached.cachedAt || 0) < 60 * 60 * 1000) {
        return cached.stats || null;
      }
      const { response, payload } = await requestJson(`/users/${encodeURIComponent(userId)}/stats`, {
        authorization: `Bearer ${token}`
      });
      if (!response.ok || !payload) {
        return null;
      }
      const stats = {
        moviesWatched: Number(payload.movies?.watched || 0),
        showsWatched: Number(payload.shows?.watched || 0),
        episodesWatched: Number(payload.episodes?.watched || 0),
        totalWatchedHours: Math.round(Number(payload.movies?.minutes || 0) / 60 + Number(payload.episodes?.minutes || 0) / 60)
      };
      localStorage.setItem(cacheKey, JSON.stringify({ cachedAt: Date.now(), stats }));
      return stats;
    },
    async fetchWatchHistory({ limit = 100 } = {}) {
      const token = await this.getValidAccessToken();
      if (!token) return [];

      const allItems = [];
      let page = 1;
      const perPage = Math.min(limit, 100);

      while (allItems.length < limit) {
        const { response, payload } = await requestJson(`/sync/history?limit=${perPage}&page=${page}`, {
          authorization: `Bearer ${token}`
        });
        if (!response.ok || !Array.isArray(payload)) break;

        allItems.push(...payload.map(normalizeHistoryItem).filter(Boolean));
        if (payload.length < perPage) break;
        page++;
      }

      return allItems.slice(0, limit);
    },
    async fetchWatchlist({ limit = 100 } = {}) {
      const token = await this.getValidAccessToken();
      if (!token) return [];

      const allItems = [];
      let page = 1;
      const perPage = Math.min(limit, 100);

      while (allItems.length < limit) {
        const { response, payload } = await requestJson(`/sync/watchlist?limit=${perPage}&page=${page}`, {
          authorization: `Bearer ${token}`
        });
        if (!response.ok || !Array.isArray(payload)) break;

        allItems.push(...payload.map(normalizeWatchlistItem).filter(Boolean));
        if (payload.length < perPage) break;
        page++;
      }

      return allItems.slice(0, limit);
    },
    async fetchPlaybackState({ limit = 50 } = {}) {
      const token = await this.getValidAccessToken();
      if (!token) return [];

      // Trakt requires a media type in the playback path. Fetch both types so
      // the projection matches Android TV instead of silently receiving an
      // empty result from the invalid untyped endpoint.
      const payloads = await Promise.all(
        ["movies", "episodes"].map(async (type) => {
          const { response, payload } = await requestJson(`/sync/playback/${type}?limit=${limit}`, {
            authorization: `Bearer ${token}`
          });
          return response.ok && Array.isArray(payload) ? payload : [];
        })
      );

      return payloads.flat().map(normalizePlaybackItem).filter(Boolean);
    },
    async fetchWatchedShows() {
      const token = await this.getValidAccessToken();
      if (!token) throw new Error("Trakt is not connected");

      return fetchWatchedPages({
        token,
        path: "/sync/watched/shows?extended=progress",
        pageLimit: WATCHED_SHOWS_PAGE_LIMIT,
        normalize: normalizeWatchedShowItem,
        label: "watched shows"
      });
    },
    async fetchWatchedMovies() {
      const token = await this.getValidAccessToken();
      if (!token) throw new Error("Trakt is not connected");

      return fetchWatchedPages({
        token,
        path: "/sync/watched/movies",
        pageLimit: WATCHED_MOVIES_PAGE_LIMIT,
        normalize: normalizeWatchedMovieItem,
        label: "watched movies"
      });
    },
    async fetchWatchedProgress(showTraktId) {
      const token = await this.getValidAccessToken();
      if (!token) return null;

      const { response, payload } = await requestJson(`/shows/${encodeURIComponent(showTraktId)}/progress/watched`, {
        authorization: `Bearer ${token}`
      });
      if (!response.ok || !payload) return null;

      return normalizeWatchedProgress(payload);
    }
  };
}
