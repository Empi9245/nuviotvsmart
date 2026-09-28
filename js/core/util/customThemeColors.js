export const DEFAULT_CUSTOM_THEME_COLORS = Object.freeze(["#B75AFF", "#EC70A9", "#FFB37A"]);

export function parseCustomThemeColor(value) {
  const color = String(value || "")
    .trim()
    .replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(color) ? `#${color.toUpperCase()}` : null;
}

export function parseCustomThemeColors(value) {
  let colors = null;
  if (Array.isArray(value)) {
    colors = value;
  } else if (typeof value === "string") {
    colors = value.split(",");
  } else if (value && typeof value === "object") {
    colors = Array.isArray(value.colors) ? value.colors : [value.first, value.second, value.third];
  }

  const parsed = Array.isArray(colors) ? colors.map(parseCustomThemeColor) : [];
  return parsed.length === 3 && parsed.every(Boolean) ? parsed : null;
}

export function normalizeCustomThemeColors(value) {
  return parseCustomThemeColors(value) || [...DEFAULT_CUSTOM_THEME_COLORS];
}

export function encodeCustomThemeColors(value) {
  return normalizeCustomThemeColors(value).join(",");
}

export function resolveCustomThemeColors(value, allowGradient = false) {
  const colors = normalizeCustomThemeColors(value);
  return allowGradient ? colors : [colors[1], colors[1], colors[1]];
}

export function areCustomThemeColorsSolid(value) {
  const [first, second, third] = normalizeCustomThemeColors(value);
  return first === second && second === third;
}
