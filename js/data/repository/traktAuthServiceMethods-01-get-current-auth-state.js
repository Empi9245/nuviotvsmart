/* eslint-disable no-unused-vars */
import * as internals from "./traktAuthService.js";

export function createTraktAuthServiceMethods01() {
  const {
    getTraktClientCredentials,
    createTraktRequestContext,
    assertTraktRequestContext,
    TRAKT_REDIRECT_URI,
    AuthManager,
    ProfileManager,
    TraktAuthStore,
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
  const refreshesByProfile = new Map();
  const activeProfileId = () => String(ProfileManager.getActiveProfileId() || "1");

  return {
    getCurrentAuthState() {
      return TraktAuthStore.get();
    },
    isAuthenticated() {
      return TraktAuthStore.isAuthenticated();
    },
    async startDeviceAuth() {
      if (!hasRequiredCredentials()) {
        throw new Error("Configure Trakt Client ID and Client Secret in Settings > Integrations > Trakt");
      }

      const profileId = activeProfileId();
      const requestContext = createTraktRequestContext(profileId);
      const credentials = getTraktClientCredentials(profileId);
      const current = TraktAuthStore.get(profileId);
      if (current.deviceCode && current.expiresAt && Date.now() < Number(current.expiresAt)) {
        return current;
      }

      const requestSignal = AuthManager.getSessionSignal?.() || null;
      let { response, payload } = await requestJson("/oauth/device/code", {
        method: "POST",
        body: { client_id: credentials.clientId },
        clientId: credentials.clientId,
        requestContext,
        signal: requestSignal
      });

      if (response.status === 429) {
        const retryAfterSeconds = Number(response.headers.get("Retry-After") || 0);
        if (retryAfterSeconds >= 1 && retryAfterSeconds <= 10) {
          await sleep(retryAfterSeconds * 1000, requestSignal);
          ({ response, payload } = await requestJson("/oauth/device/code", {
            method: "POST",
            body: { client_id: credentials.clientId },
            clientId: credentials.clientId,
            requestContext,
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

      if (activeProfileId() !== profileId || getTraktClientCredentials(profileId).clientId !== credentials.clientId || getTraktClientCredentials(profileId).clientSecret !== credentials.clientSecret) {
        throw internals.createAbortError();
      }
      return TraktAuthStore.saveDeviceFlow(payload, profileId);
    },
    async pollDeviceToken() {
      if (!hasRequiredCredentials()) {
        return { type: "failed", message: "Configure Trakt app credentials in Settings > Integrations > Trakt" };
      }
      const profileId = activeProfileId();
      const requestContext = createTraktRequestContext(profileId);
      const credentials = getTraktClientCredentials(profileId);
      const state = TraktAuthStore.get(profileId);
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
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret
        },
        clientId: credentials.clientId,
        requestContext
      });
      if (activeProfileId() !== profileId || TraktAuthStore.get(profileId).deviceCode !== state.deviceCode) {
        return { type: "cancelled" };
      }

      if (response.ok && payload?.access_token && payload?.refresh_token) {
        TraktAuthStore.saveToken(payload, profileId);
        // The token exchange succeeded even if the optional username lookup
        // fails; keep the approval and allow normal account requests to retry.
        const username = await fetchUserSettings().catch(() => null);
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
    async refreshTokenIfNeeded(force = false, profileId = activeProfileId()) {
      if (!hasRequiredCredentials(profileId)) {
        return false;
      }
      profileId = String(profileId);
      const requestContext = createTraktRequestContext(profileId);
      const state = TraktAuthStore.get(profileId);
      const credentials = getTraktClientCredentials(profileId);
      if (!state.refreshToken) {
        return false;
      }
      if (!force && !isTokenExpiredOrExpiring(state)) {
        return true;
      }
      const pending = refreshesByProfile.get(profileId);
      if (pending?.refreshToken === state.refreshToken) return pending.promise;
      const entry = { refreshToken: state.refreshToken, promise: null };
      entry.promise = (async () => {
        const { response, payload } = await requestJson("/oauth/token", {
          method: "POST",
          body: {
            refresh_token: state.refreshToken,
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            redirect_uri: TRAKT_REDIRECT_URI || "urn:ietf:wg:oauth:2.0:oob",
            grant_type: "refresh_token"
          },
          clientId: credentials.clientId,
          requestContext
        });
        // A disconnect, new login, or profile change must not be overwritten
        // by an older exchange finishing later.
        const current = TraktAuthStore.get(profileId);
        if (current.refreshToken !== state.refreshToken) {
          return Boolean(current.accessToken && !isTokenExpiredOrExpiring(current));
        }
        if (!response.ok || !payload?.access_token || !payload?.refresh_token) {
          // A temporary server/transport failure keeps the refresh token for
          // the next attempt. Only an explicit invalid grant disconnects it.
          if ([400, 401, 403].includes(response.status) && payload?.error === "invalid_grant") {
            TraktAuthStore.clearAuth(profileId);
          }
          return false;
        }
        TraktAuthStore.saveToken(payload, profileId);
        return true;
      })().finally(() => {
        if (refreshesByProfile.get(profileId) === entry) refreshesByProfile.delete(profileId);
      });
      refreshesByProfile.set(profileId, entry);
      return entry.promise;
    },
    async getValidAccessToken(profileId = activeProfileId()) {
      profileId = String(profileId);
      if (activeProfileId() !== profileId) return null;
      const state = TraktAuthStore.get(profileId);
      if (!state.accessToken) {
        return null;
      }
      if (isTokenExpiredOrExpiring(state)) {
        const refreshed = await this.refreshTokenIfNeeded(true, profileId);
        if (!refreshed || activeProfileId() !== profileId) {
          return null;
        }
        return TraktAuthStore.get(profileId).accessToken;
      }
      return state.accessToken;
    },
    async disconnect() {
      const profileId = activeProfileId();
      const requestContext = createTraktRequestContext(profileId);
      const state = TraktAuthStore.get(profileId);
      const credentials = getTraktClientCredentials(profileId);
      // Clear immediately so an in-flight token exchange cannot reconnect it.
      TraktAuthStore.clearAuth(profileId);
      if (hasRequiredCredentials() && state.accessToken) {
        try {
          await requestJson("/oauth/revoke", {
            method: "POST",
            body: {
              token: state.accessToken,
              client_id: credentials.clientId,
              client_secret: credentials.clientSecret
            },
            clientId: credentials.clientId,
            requestContext
          });
        } catch (error) {
          console.warn("Trakt revoke failed", error);
        }
      }
      internals.detailWatchedEnrichmentService.invalidateAllCache();
    },
    async fetchStats(forceRefresh = false) {
      const requestContext = createTraktRequestContext();
      const state = TraktAuthStore.get(requestContext.profileId);
      const username = state.userSlug || state.username;
      if (!username) {
        await fetchUserSettings();
      }
      assertTraktRequestContext(requestContext);
      const nextState = TraktAuthStore.get(requestContext.profileId);
      const userId = nextState.userSlug || nextState.username || "me";
      const token = await this.getValidAccessToken(requestContext.profileId);
      assertTraktRequestContext(requestContext);
      if (!token) {
        return null;
      }
      const cacheKey = `traktCachedStats:${userId}`;
      let cached = null;
      if (!forceRefresh) {
        try {
          cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
        } catch (_) {
          // A damaged local cache must not prevent a fresh account lookup.
        }
      }
      if (cached && Date.now() - Number(cached.cachedAt || 0) < 60 * 60 * 1000) {
        return cached.stats || null;
      }
      const { response, payload } = await requestJson(`/users/${encodeURIComponent(userId)}/stats`, {
        authorization: `Bearer ${token}`,
        requestContext
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
      const requestContext = createTraktRequestContext();
      const token = await this.getValidAccessToken(requestContext.profileId);
      assertTraktRequestContext(requestContext);
      if (!token) return [];

      const allItems = [];
      let page = 1;
      const perPage = Math.min(limit, 100);

      while (allItems.length < limit) {
        const { response, payload } = await requestJson(`/sync/history?limit=${perPage}&page=${page}`, {
          authorization: `Bearer ${token}`,
          requestContext
        });
        if (!response.ok || !Array.isArray(payload)) break;

        allItems.push(...payload.map(normalizeHistoryItem).filter(Boolean));
        if (payload.length < perPage) break;
        page++;
      }

      return allItems.slice(0, limit);
    },
    async fetchWatchlist({ limit = 100 } = {}) {
      const requestContext = createTraktRequestContext();
      const token = await this.getValidAccessToken(requestContext.profileId);
      assertTraktRequestContext(requestContext);
      if (!token) return [];

      const allItems = [];
      let page = 1;
      const perPage = Math.min(limit, 100);

      while (allItems.length < limit) {
        const { response, payload } = await requestJson(`/sync/watchlist?limit=${perPage}&page=${page}`, {
          authorization: `Bearer ${token}`,
          requestContext
        });
        if (!response.ok || !Array.isArray(payload)) break;

        allItems.push(...payload.map(normalizeWatchlistItem).filter(Boolean));
        if (payload.length < perPage) break;
        page++;
      }

      return allItems.slice(0, limit);
    },
    async fetchPlaybackState({ limit = 50 } = {}) {
      const requestContext = createTraktRequestContext();
      const token = await this.getValidAccessToken(requestContext.profileId);
      assertTraktRequestContext(requestContext);
      if (!token) return [];

      // Trakt requires a media type in the playback path. Fetch both types so
      // the projection matches Android TV instead of silently receiving an
      // empty result from the invalid untyped endpoint.
      const payloads = await Promise.all(
        ["movies", "episodes"].map(async (type) => {
          const { response, payload } = await requestJson(`/sync/playback/${type}?limit=${limit}`, {
            authorization: `Bearer ${token}`,
            requestContext
          });
          return response.ok && Array.isArray(payload) ? payload : [];
        })
      );

      return payloads.flat().map(normalizePlaybackItem).filter(Boolean);
    },
    async fetchWatchedShows() {
      const requestContext = createTraktRequestContext();
      const token = await this.getValidAccessToken(requestContext.profileId);
      assertTraktRequestContext(requestContext);
      if (!token) throw new Error("Trakt is not connected");

      return fetchWatchedPages({
        token,
        requestContext,
        path: "/sync/watched/shows?extended=progress",
        pageLimit: WATCHED_SHOWS_PAGE_LIMIT,
        normalize: normalizeWatchedShowItem,
        label: "watched shows"
      });
    },
    async fetchWatchedMovies() {
      const requestContext = createTraktRequestContext();
      const token = await this.getValidAccessToken(requestContext.profileId);
      assertTraktRequestContext(requestContext);
      if (!token) throw new Error("Trakt is not connected");

      return fetchWatchedPages({
        token,
        requestContext,
        path: "/sync/watched/movies",
        pageLimit: WATCHED_MOVIES_PAGE_LIMIT,
        normalize: normalizeWatchedMovieItem,
        label: "watched movies"
      });
    },
    async fetchWatchedProgress(showTraktId) {
      const requestContext = createTraktRequestContext();
      const token = await this.getValidAccessToken(requestContext.profileId);
      assertTraktRequestContext(requestContext);
      if (!token) return null;

      const { response, payload } = await requestJson(`/shows/${encodeURIComponent(showTraktId)}/progress/watched`, {
        authorization: `Bearer ${token}`,
        requestContext
      });
      if (!response.ok || !payload) return null;

      return normalizeWatchedProgress(payload);
    }
  };
}
