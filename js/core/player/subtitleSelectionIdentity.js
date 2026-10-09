function identityText(value) {
  return String(value ?? "").trim();
}

export function getAddonSubtitleId(subtitle, index = 0) {
  return identityText(subtitle?.id || subtitle?.url || `subtitle-${index}`);
}

export function getAddonSubtitleIdentity(subtitle, index = 0) {
  if (!subtitle) return "";
  return JSON.stringify([
    identityText(subtitle.addonId || subtitle.addonBaseUrl || subtitle.addonName),
    getAddonSubtitleId(subtitle, index),
    identityText(subtitle.url),
    identityText(subtitle.lang || subtitle.language || subtitle.languageCode).toLowerCase()
  ]);
}
