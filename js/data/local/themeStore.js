import { createProfileScopedStore } from "./profileScopedStore.js";
import { encodeCustomThemeColors } from "../../core/util/customThemeColors.js";

const KEY = "themeSettings";

const DEFAULT_THEME = {
  mode: "dark",
  themeName: "WHITE",
  accentColor: "#ffffff",
  fontFamily: "INTER",
  language: null,
  amoledMode: false,
  amoledSurfacesMode: false,
  settingsUiStyle: "CLASSIC",
  customThemeColors: encodeCustomThemeColors()
};

const THEME_BY_ACCENT = new Map([
  ["#ffffff", "WHITE"],
  ["#f5f5f5", "WHITE"],
  ["#f5f8fc", "WHITE"],
  ["#ff4d4f", "CRIMSON"],
  ["#ff5252", "CRIMSON"],
  ["#42a5f5", "OCEAN"],
  ["#ba68c8", "VIOLET"],
  ["#ab47bc", "VIOLET"],
  ["#66bb6a", "EMERALD"],
  ["#ffca28", "AMBER"],
  ["#ffa726", "AMBER"],
  ["#ec407a", "ROSE"],
  ["#e8a91c", "GOLD"],
  ["#ffd45c", "GOLD"],
  ["#22d37c", "JADE"],
  ["#7bf08d", "JADE"],
  ["#ec70a9", "ROSE_GOLD"],
  ["#ffb37a", "ROSE_GOLD"],
  ["#3185f5", "ARCTIC_BLUE"],
  ["#4de3ff", "ARCTIC_BLUE"],
  ["#aab2be", "GRAPHITE"],
  ["#f3f5f7", "GRAPHITE"]
]);

const ACCENT_BY_THEME = {
  WHITE: "#f5f5f5",
  CRIMSON: "#e53935",
  OCEAN: "#1e88e5",
  VIOLET: "#8e24aa",
  EMERALD: "#43a047",
  AMBER: "#fb8c00",
  ROSE: "#d81b60",
  GOLD: "#e8a91c",
  JADE: "#22d37c",
  ROSE_GOLD: "#ec70a9",
  ARCTIC_BLUE: "#3185f5",
  GRAPHITE: "#aab2be"
};

export function accentColorForTheme(themeName) {
  const normalizedThemeName = String(themeName || DEFAULT_THEME.themeName).toUpperCase();
  return String(ACCENT_BY_THEME[normalizedThemeName] || DEFAULT_THEME.accentColor).toLowerCase();
}

function normalizeTheme(settings = {}) {
  const accent = String(settings?.accentColor || DEFAULT_THEME.accentColor).toLowerCase();
  const storedThemeName = String(settings?.themeName || DEFAULT_THEME.themeName).toUpperCase();
  const themeFromAccent = THEME_BY_ACCENT.get(accent);
  const themeName = String(
    storedThemeName === "CUSTOM"
      ? "CUSTOM"
      : themeFromAccent && themeFromAccent !== storedThemeName
        ? themeFromAccent
        : storedThemeName || themeFromAccent || DEFAULT_THEME.themeName
  ).toUpperCase();
  const normalizedAccent = ACCENT_BY_THEME[themeName]
    ? accentColorForTheme(themeName)
    : String(accent || DEFAULT_THEME.accentColor).toLowerCase();

  return {
    ...DEFAULT_THEME,
    ...settings,
    themeName,
    accentColor: normalizedAccent,
    customThemeColors: encodeCustomThemeColors(settings?.customThemeColors),
    settingsUiStyle: ["CLASSIC", "HORIZON", "ZEN"].includes(
      String(settings?.settingsUiStyle || "").toUpperCase()
    )
      ? String(settings.settingsUiStyle).toUpperCase()
      : "CLASSIC"
  };
}

const store = createProfileScopedStore({
  key: KEY,
  normalize: normalizeTheme
});

export const ThemeStore = {
  getForProfile(profileId) {
    return store.getForProfile(profileId);
  },

  get() {
    return store.get();
  },

  replaceForProfile(profileId, nextValue, options = {}) {
    return store.replaceForProfile(profileId, nextValue, options);
  },

  setForProfile(profileId, partial, options = {}) {
    return store.setForProfile(profileId, partial, options);
  },

  set(partial, options = {}) {
    return store.set(partial, options);
  }
};
