import { getCachedAddonLogoDisplayUrl } from "./addonLogoCache.js";

// Keep cached image payloads out of innerHTML. Assigning src after parsing
// preserves the existing webOS cache/decoder without parsing base64 per card.
export function bindCachedBadgeImages(container) {
  container?.querySelectorAll("img[data-cached-badge-image]").forEach((image) => {
    const url = getCachedAddonLogoDisplayUrl(image.getAttribute("data-cached-badge-image"));
    if (!url) return;
    image.src = url;
    image.removeAttribute("data-cached-badge-image");
  });
}
