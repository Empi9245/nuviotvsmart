import {
  areCustomThemeColorsSolid,
  normalizeCustomThemeColors,
  resolveCustomThemeColors
} from "../../core/util/customThemeColors.js";

function parseColor(hex) {
  const value = String(hex || "").replace(/^#/, "");
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
}

function formatColor(channels) {
  return `#${channels
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")
    .toUpperCase()}`;
}

function mixColor(base, accent, amount) {
  const baseChannels = parseColor(base);
  const accentChannels = parseColor(accent);
  return formatColor(
    baseChannels.map((channel, index) => channel + (accentChannels[index] - channel) * amount)
  );
}

function colorLuminance(hex) {
  const [red, green, blue] = parseColor(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function customThemePalette(value) {
  const [first, accent, third] = normalizeCustomThemeColors(value);
  const solid = areCustomThemeColorsSolid([first, accent, third]);
  const focusColor = [first, accent, third].reduce((brightest, color) =>
    colorLuminance(color) > colorLuminance(brightest) ? color : brightest
  );

  return {
    "--bg-color": mixColor("#0C0D0F", accent, 0.025),
    "--bg-elevated": mixColor("#17191D", accent, 0.045),
    "--card-bg": mixColor("#20242A", accent, 0.06),
    "--secondary-color": accent,
    "--secondary-variant": third,
    "--on-secondary": colorLuminance(accent) > 0.179 ? "#000000" : "#FFFFFF",
    "--text-color": "#FFFFFF",
    "--text-secondary": "#B3B3B3",
    "--text-tertiary": "#808080",
    "--border-color": "#333333",
    "--focus-color": focusColor,
    "--focus-bg": mixColor("#242424", accent, 0.18),
    "--accent-gradient": solid
      ? accent
      : `linear-gradient(90deg, ${first} 0%, ${accent} 50%, ${third} 100%)`
  };
}

const palettes = {
  GOLD: {
    "--bg-color": "#0f0e0b",
    "--bg-elevated": "#1d1a14",
    "--card-bg": "#262116",
    "--secondary-color": "#e8a91c",
    "--secondary-variant": "#9a6200",
    "--on-secondary": "#111111",
    "--text-color": "#ffffff",
    "--text-secondary": "#b3b3b3",
    "--text-tertiary": "#808080",
    "--border-color": "#333333",
    "--focus-color": "#ffd45c",
    "--focus-bg": "#3d2d1a",
    "--accent-gradient":
      "linear-gradient(90deg, #8a5700 0%, #e8a91c 25%, #fff1a8 50%, #ffd45c 75%, #9a6200 100%)"
  },
  JADE: {
    "--bg-color": "#0b0f0d",
    "--bg-elevated": "#141d18",
    "--card-bg": "#16251d",
    "--secondary-color": "#22d37c",
    "--secondary-variant": "#0bbf9a",
    "--on-secondary": "#111111",
    "--text-color": "#ffffff",
    "--text-secondary": "#b3b3b3",
    "--text-tertiary": "#808080",
    "--border-color": "#333333",
    "--focus-color": "#7bf08d",
    "--focus-bg": "#153a2c",
    "--accent-gradient": "linear-gradient(90deg, #7bf08d 0%, #22d37c 50%, #0bbf9a 100%)"
  },
  ROSE_GOLD: {
    "--bg-color": "#100c0f",
    "--bg-elevated": "#1f161d",
    "--card-bg": "#281a24",
    "--secondary-color": "#ec70a9",
    "--secondary-variant": "#b75aff",
    "--on-secondary": "#111111",
    "--text-color": "#ffffff",
    "--text-secondary": "#b3b3b3",
    "--text-tertiary": "#808080",
    "--border-color": "#333333",
    "--focus-color": "#ffb37a",
    "--focus-bg": "#442037",
    "--accent-gradient": "linear-gradient(90deg, #b75aff 0%, #ec70a9 50%, #ffb37a 100%)"
  },
  ARCTIC_BLUE: {
    "--bg-color": "#0b0e14",
    "--bg-elevated": "#141a24",
    "--card-bg": "#161e2a",
    "--secondary-color": "#3185f5",
    "--secondary-variant": "#4d55e8",
    "--on-secondary": "#ffffff",
    "--text-color": "#ffffff",
    "--text-secondary": "#b3b3b3",
    "--text-tertiary": "#808080",
    "--border-color": "#333333",
    "--focus-color": "#4de3ff",
    "--focus-bg": "#172844",
    "--accent-gradient": "linear-gradient(90deg, #4de3ff 0%, #3185f5 50%, #4d55e8 100%)"
  },
  GRAPHITE: {
    "--bg-color": "#0c0d0f",
    "--bg-elevated": "#17191d",
    "--card-bg": "#20242a",
    "--secondary-color": "#aab2be",
    "--secondary-variant": "#687381",
    "--on-secondary": "#111111",
    "--text-color": "#ffffff",
    "--text-secondary": "#b3b3b3",
    "--text-tertiary": "#808080",
    "--border-color": "#333333",
    "--focus-color": "#f3f5f7",
    "--focus-bg": "#30343a",
    "--accent-gradient": "linear-gradient(90deg, #f3f5f7 0%, #aab2be 50%, #687381 100%)"
  },
  WHITE: {
    "--bg-color": "#0d0d0d",
    "--bg-elevated": "#1a1a1a",
    "--card-bg": "#222222",
    "--secondary-color": "#f5f5f5",
    "--secondary-variant": "#e0e0e0",
    "--on-secondary": "#111111",
    "--text-color": "#ffffff",
    "--text-secondary": "#b3b3b3",
    "--text-tertiary": "#808080",
    "--border-color": "#333333",
    "--focus-color": "#ffffff",
    "--focus-bg": "#303030"
  },
  CRIMSON: {
    "--bg-color": "#0d0d0d",
    "--bg-elevated": "#1a1a1a",
    "--card-bg": "#241a1a",
    "--secondary-color": "#e53935",
    "--secondary-variant": "#c62828",
    "--on-secondary": "#ffffff",
    "--text-color": "#ffffff",
    "--text-secondary": "#b3b3b3",
    "--text-tertiary": "#808080",
    "--border-color": "#333333",
    "--focus-color": "#ff5252",
    "--focus-bg": "#3d1a1a"
  },
  OCEAN: {
    "--bg-color": "#0d0d0f",
    "--bg-elevated": "#1a1a1e",
    "--card-bg": "#1a1f24",
    "--secondary-color": "#1e88e5",
    "--secondary-variant": "#1565c0",
    "--on-secondary": "#ffffff",
    "--text-color": "#ffffff",
    "--text-secondary": "#b3b3b3",
    "--text-tertiary": "#808080",
    "--border-color": "#333333",
    "--focus-color": "#42a5f5",
    "--focus-bg": "#1a2d3d"
  },
  VIOLET: {
    "--bg-color": "#0d0d0f",
    "--bg-elevated": "#1a1a1e",
    "--card-bg": "#1f1a24",
    "--secondary-color": "#8e24aa",
    "--secondary-variant": "#6a1b9a",
    "--on-secondary": "#ffffff",
    "--text-color": "#ffffff",
    "--text-secondary": "#b3b3b3",
    "--text-tertiary": "#808080",
    "--border-color": "#333333",
    "--focus-color": "#ab47bc",
    "--focus-bg": "#2d1a3d"
  },
  EMERALD: {
    "--bg-color": "#0d0d0d",
    "--bg-elevated": "#1a1a1a",
    "--card-bg": "#1a241a",
    "--secondary-color": "#43a047",
    "--secondary-variant": "#2e7d32",
    "--on-secondary": "#ffffff",
    "--text-color": "#ffffff",
    "--text-secondary": "#b3b3b3",
    "--text-tertiary": "#808080",
    "--border-color": "#333333",
    "--focus-color": "#66bb6a",
    "--focus-bg": "#1a3d1e"
  },
  AMBER: {
    "--bg-color": "#0f0d0d",
    "--bg-elevated": "#1e1a1a",
    "--card-bg": "#24201a",
    "--secondary-color": "#fb8c00",
    "--secondary-variant": "#ef6c00",
    "--on-secondary": "#ffffff",
    "--text-color": "#ffffff",
    "--text-secondary": "#b3b3b3",
    "--text-tertiary": "#808080",
    "--border-color": "#333333",
    "--focus-color": "#ffa726",
    "--focus-bg": "#3d2d1a"
  },
  ROSE: {
    "--bg-color": "#0d0d0d",
    "--bg-elevated": "#1a1a1a",
    "--card-bg": "#241a1f",
    "--secondary-color": "#d81b60",
    "--secondary-variant": "#c2185b",
    "--on-secondary": "#ffffff",
    "--text-color": "#ffffff",
    "--text-secondary": "#b3b3b3",
    "--text-tertiary": "#808080",
    "--border-color": "#333333",
    "--focus-color": "#ec407a",
    "--focus-bg": "#3d1a2d"
  }
};

export const ThemeColors = {
  dark: palettes.WHITE,
  palettes,

  getPalette(themeName = "WHITE", customColors = null) {
    const normalizedThemeName = String(themeName || "WHITE").toUpperCase();
    if (normalizedThemeName === "CUSTOM") {
      return customThemePalette(customColors || resolveCustomThemeColors(null, false));
    }
    return palettes[normalizedThemeName] || palettes.WHITE;
  }
};
