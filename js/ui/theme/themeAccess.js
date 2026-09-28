const SUPPORTER_THEME_ENTITLEMENTS = Object.freeze({
  GOLD: "GOLD_THEME",
  JADE: "JADE_THEME",
  ROSE_GOLD: "ROSE_GOLD_THEME",
  ARCTIC_BLUE: "ARCTIC_BLUE_THEME",
  GRAPHITE: "GRAPHITE_THEME"
});

const STANDARD_THEME_IDS = Object.freeze([
  "WHITE",
  "CRIMSON",
  "OCEAN",
  "VIOLET",
  "EMERALD",
  "AMBER",
  "ROSE"
]);

export function availableThemeIds(access = null) {
  const entitlements = new Set(
    (Array.isArray(access?.entitlements) ? access.entitlements : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
  const supporterThemes = Object.entries(SUPPORTER_THEME_ENTITLEMENTS)
    .filter(([, entitlement]) => entitlements.has(entitlement))
    .map(([themeName]) => themeName);
  return [...supporterThemes, "CUSTOM", ...STANDARD_THEME_IDS];
}

export function isThemeAvailable(themeName, access = null) {
  return availableThemeIds(access).includes(String(themeName || "").toUpperCase());
}

export function resolveThemeName(themeName, access = null) {
  const normalized = String(themeName || "")
    .trim()
    .toUpperCase();
  return isThemeAvailable(normalized, access) ? normalized : "WHITE";
}

export { STANDARD_THEME_IDS, SUPPORTER_THEME_ENTITLEMENTS };
