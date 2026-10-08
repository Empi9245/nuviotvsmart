import { restoreVidaaHomeNavigationNeighborhood } from "./vidaaHomeCardWindow.js";

// OK can leave Home before its queued camera move has run. The captured scroll
// position then belongs to the previous card, even though focus already moved.
// Restore the selected card's viewport synchronously, before accepting arrows.
export function settleVidaaHomeReturnFocus(screen, target, viewport) {
  if (!target || !viewport) return;
  screen.cancelModernCameraFollow({ stopAnimations: true });
  screen.endModernVerticalFastScroll({ land: false });
  if (screen.homeViewportFocusSyncTimer) clearTimeout(screen.homeViewportFocusSyncTimer);
  if (screen.homeViewportScrollFrame) cancelAnimationFrame(screen.homeViewportScrollFrame);
  screen.homeViewportFocusSyncTimer = null;
  screen.homeViewportScrollFrame = 0;
  screen.cancelScrollAnimation(viewport, "y");
  screen.getNavigationTrackNodes().forEach((track) => screen.cancelScrollAnimation(track, "x"));
  restoreVidaaHomeNavigationNeighborhood(screen, target);

  const viewportRect = viewport.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const track = target.closest(".home-track, .home-grid-track");
  const trackRect = track?.getBoundingClientRect();
  const top = viewportRect.top + screen.getRowFocusInset();
  const bottom = viewportRect.bottom - 24;
  let vertical = Number(viewport.scrollTop || 0);
  if (targetRect.top < top || targetRect.height > bottom - top) {
    vertical += targetRect.top - top;
  } else if (targetRect.bottom > bottom) {
    vertical += targetRect.bottom - bottom;
  }
  let horizontal = Number(track?.scrollLeft || 0);
  if (trackRect) {
    const padding = screen.getTrackEdgePadding();
    const left = trackRect.left + padding;
    const right = trackRect.right - Math.min(padding, 24);
    if (targetRect.left < left || targetRect.width > right - left) {
      horizontal += targetRect.left - left;
    } else if (targetRect.right > right) {
      horizontal += targetRect.right - right;
    }
  }
  // Finish geometry reads before writes. Explicit instant restoration must not
  // queue another 140 ms navigation animation or compete with the saved state.
  const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const maxLeft = trackRect ? Math.max(0, track.scrollWidth - track.clientWidth) : 0;
  viewport.scrollTop = Math.max(0, Math.min(maxTop, vertical));
  if (trackRect) {
    track.scrollLeft = Math.max(0, Math.min(maxLeft, horizontal));
  }
}
