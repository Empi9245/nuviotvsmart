import {
  ACCOUNT_BACKEND_MODE,
  AVATAR_PUBLIC_BASE_URL,
  DEVICE_LOGIN_WEB_BASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_FALLBACK_URL,
  SUPABASE_URL,
  TV_LOGIN_WEB_BASE_URL
} from "../../config.js";
import {
  createLocalServerConfiguration,
  createServerConfiguration
} from "../../core/server/serverConfiguration.js";
import { Platform } from "../../platform/index.js";

export const SERVER_CONFIGURATION_KEY = "nuvioServerConfigurationV1";
let activeConfiguration = null;

function defaultConfiguration() {
  if (ACCOUNT_BACKEND_MODE === "shared") return officialConfiguration();
  return Platform.isVidaa() ? createLocalServerConfiguration() : officialConfiguration();
}

function saveConfiguration(configuration, storage) {
  try {
    const target = storageOrDefault(storage);
    if (!target?.setItem || !target?.getItem) return false;
    const serialized = JSON.stringify(configuration);
    target.setItem(SERVER_CONFIGURATION_KEY, serialized);
    const saved = target.getItem(SERVER_CONFIGURATION_KEY) === serialized;
    if (saved && !storage) activeConfiguration = configuration;
    return saved;
  } catch (error) {
    console.warn("[serverConfiguration] Failed to save server mode", error);
    return false;
  }
}

function officialConfiguration() {
  if (ACCOUNT_BACKEND_MODE === "shared") {
    const configuration = createServerConfiguration({
      backendUrl: SUPABASE_URL,
      publishableKey: SUPABASE_ANON_KEY,
      capabilities: { emailPasswordAuth: true, tvLogin: false },
      isCustom: true
    });
    let avatarBase = AVATAR_PUBLIC_BASE_URL || "assets/avatars";
    if (!AVATAR_PUBLIC_BASE_URL && globalThis.location?.href) {
      avatarBase = new URL("assets/avatars", globalThis.location.href).href;
    }
    return configuration
      ? Object.freeze({
          ...configuration,
          isCustom: false,
          isShared: true,
          avatarPublicBaseUrl: avatarBase,
          tvLoginWebBaseUrl: "",
          deviceLoginWebBaseUrl: ""
        })
      : createLocalServerConfiguration();
  }
  return createServerConfiguration({
    backendUrl: SUPABASE_URL,
    publishableKey: SUPABASE_ANON_KEY,
    capabilities: { emailPasswordAuth: false, tvLogin: true },
    isCustom: false,
    fallbackBackendUrl: SUPABASE_FALLBACK_URL,
    tvLoginWebBaseUrl: TV_LOGIN_WEB_BASE_URL,
    deviceLoginWebBaseUrl: DEVICE_LOGIN_WEB_BASE_URL,
    avatarPublicBaseUrl: AVATAR_PUBLIC_BASE_URL
  });
}

function validCustomConfiguration(value) {
  if (!value || typeof value !== "object" || value.isCustom !== true) return null;
  return createServerConfiguration({
    ...value,
    isCustom: true,
    discoveryUrl:
      value.discoveryUrl ||
      `${String(value.backendUrl || "").replace(/\/+$/, "")}/.well-known/nuvio`
  });
}

function storageOrDefault(storage) {
  return storage || globalThis.localStorage;
}

export const ServerConfigurationStore = {
  getActive(storage) {
    if (!storage && activeConfiguration) return activeConfiguration;
    if (ACCOUNT_BACKEND_MODE === "shared") {
      const configuration = officialConfiguration();
      if (!storage) activeConfiguration = configuration;
      return configuration;
    }
    try {
      const raw = storageOrDefault(storage)?.getItem?.(SERVER_CONFIGURATION_KEY);
      const value = raw ? JSON.parse(raw) : null;
      const configuration =
        value?.isLocal === true
          ? createLocalServerConfiguration()
          : value?.mode === "official"
            ? officialConfiguration()
            : validCustomConfiguration(value) || defaultConfiguration();
      if (!storage) activeConfiguration = configuration;
      return configuration;
    } catch (error) {
      console.warn("[serverConfiguration] Failed to load custom server", error);
      const configuration = defaultConfiguration();
      if (!storage) activeConfiguration = configuration;
      return configuration;
    }
  },

  saveCustom(configuration, storage) {
    if (ACCOUNT_BACKEND_MODE === "shared") return false;
    const normalized = validCustomConfiguration(configuration);
    if (!normalized) return false;
    return saveConfiguration(normalized, storage);
  },

  useOfficial(storage) {
    return saveConfiguration({ ...officialConfiguration(), mode: "official" }, storage);
  },

  useLocal(storage) {
    if (ACCOUNT_BACKEND_MODE === "shared") return false;
    return saveConfiguration(createLocalServerConfiguration(), storage);
  },

  clearCache() {
    activeConfiguration = null;
  }
};
