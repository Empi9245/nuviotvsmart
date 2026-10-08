import { cancelVidaaPosterObservation } from "./vidaaHomePosterPrefetch.js";

const ROW_SELECTOR = ".home-row, .home-modern-row, .home-grid-section, .home-row-continue";
const IMAGE_SELECTOR = [
  ".content-poster",
  ".home-poster-landscape-logo",
  ".home-continue-bg",
  ".home-poster-expanded-backdrop",
  ".home-poster-expanded-logo"
]
  .map((selector) => `.home-main ${selector}[src]`)
  .join(", ");

// Use a larger retention window than the loader's prefetch window. Going back
// one card/row reuses warm artwork; traversing a catalog doesn't retain every
// decoded poster and full-size expanded backdrop indefinitely.
export function releaseVidaaHomeImage(image) {
  const src = image.getAttribute("src");
  if (!src) return;
  cancelVidaaPosterObservation(image);
  image.dataset.src = src;
  image.removeAttribute("src");
  if (image.classList.contains("home-poster-expanded-backdrop")) {
    image.dataset.loadState = "";
    image.dataset.loadBound = "false";
    image.closest(".home-content-card")?.classList.remove("is-expanded-backdrop-ready");
  }
}

export function releaseDistantVidaaHomeImages(container, viewportRect, focusedNode = null) {
  const rows = new Map();
  const release = [];
  for (const image of container.querySelectorAll(IMAGE_SELECTOR)) {
    if (!image.isConnected || focusedNode?.contains(image)) continue;
    const card = image.closest(".home-content-card");
    const expandedAsset =
      image.classList.contains("home-poster-expanded-backdrop") ||
      image.classList.contains("home-poster-expanded-logo");
    // Collapsed cards don't display these large images, even in a visible row.
    if (expandedAsset && !card?.classList.contains("is-expanded")) {
      release.push(image);
      continue;
    }
    const row = image.closest(ROW_SELECTOR);
    if (!row) continue;
    let rowRect = rows.get(row);
    if (!rowRect) {
      rowRect = row.getBoundingClientRect();
      rows.set(row, rowRect);
    }
    if (rowRect.bottom < viewportRect.top - 600 || rowRect.top > viewportRect.bottom + 600) {
      release.push(image);
      continue;
    }
    const rect = image.getBoundingClientRect();
    if (
      rect.right < viewportRect.left - 600 ||
      rect.left > viewportRect.right + 600 ||
      rect.bottom < viewportRect.top - 600 ||
      rect.top > viewportRect.bottom + 600
    )
      release.push(image);
  }
  // Finish all geometry reads before changing any sources. Keep the actual
  // successful URL, including fallback artwork, so revisiting can hydrate it.
  for (const image of release) {
    releaseVidaaHomeImage(image);
  }
  return release.length;
}
