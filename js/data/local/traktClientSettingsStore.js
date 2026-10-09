import { TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET } from "../../config.js";
import { ProfileManager } from "../../core/profile/profileManager.js";
import { LocalStore } from "../../core/storage/localStore.js";
import { TraktAuthStore } from "./traktAuthStore.js";

const STORE_KEY = "traktClientSettings";
const profileKey = (profileId) => String(profileId ?? ProfileManager.getActiveProfileId() ?? "1");
const normalize = (value = {}) => ({
  clientId: String(value.clientId || "").trim(),
  clientSecret: String(value.clientSecret || "").trim()
});

function readEnvelope() {
  const value = LocalStore.get(STORE_KEY, null);
  return { version: 1, profiles: value?.profiles && typeof value.profiles === "object" ? value.profiles : {} };
}

// App credentials stay on this device and are deliberately separate from the
// profile preference store, whose values are synchronized in plain text.
export const TraktClientSettingsStore = {
  get(profileId = null) {
    return normalize(readEnvelope().profiles[profileKey(profileId)]);
  },
  set(partial, profileId = null) {
    const key = profileKey(profileId);
    const previous = this.get(key);
    const next = normalize({ ...previous, ...partial });
    const envelope = readEnvelope();
    envelope.profiles[key] = next;
    LocalStore.set(STORE_KEY, envelope);
    if (previous.clientId !== next.clientId || previous.clientSecret !== next.clientSecret) {
      // User tokens belong to the application that issued them. Changing the
      // application's identity requires a new device authorization.
      TraktAuthStore.clearAuth(key);
    }
    return { ...next };
  }
};

export function getTraktClientCredentials(profileId = null) {
  const settings = TraktClientSettingsStore.get(profileId);
  if (settings.clientId || settings.clientSecret) return settings;
  return { clientId: TRAKT_CLIENT_ID, clientSecret: TRAKT_CLIENT_SECRET };
}
