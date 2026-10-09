// Discover restored/generated media state once per Home DOM update. Focus
// navigation then visits only the small set of expanded cards and live previews.
export function reconcileHomeFocusMediaTracking(screen, { refresh = false } = {}) {
  const container = screen.container;
  if (!container) return;
  if (
    !refresh &&
    screen.homeFocusMediaTrackingContainer === container &&
    screen.homeActiveTrailerLayers instanceof Set &&
    screen.homeActivePosterNodes instanceof Set
  )
    return;

  const layers = new Set(
    container.querySelectorAll(
      ".home-poster-trailer-layer:not(:empty), .home-hero-trailer-layer:not(:empty), " +
        ".home-poster-trailer-layer.is-active, .home-hero-trailer-layer.is-active"
    )
  );
  screen.homeActiveTrailerLayers?.forEach((layer) => {
    if (container.contains(layer)) layers.add(layer);
    else screen.clearTrailerLayer(layer);
  });
  screen.homeActiveTrailerLayers = layers;
  screen.homeActivePosterNodes = new Set(
    container.querySelectorAll(
      ".home-main .home-poster-card.is-expanded, .home-main .home-poster-card.is-trailer-active"
    )
  );
  if (
    !screen.homeActivePosterNodes.has(screen.expandedPosterNode) ||
    !screen.expandedPosterNode?.classList.contains("is-expanded")
  ) {
    screen.expandedPosterNode =
      [...screen.homeActivePosterNodes].find((card) => card.classList.contains("is-expanded")) ||
      null;
  }
  screen.homeFocusMediaTrackingContainer = container;
}
