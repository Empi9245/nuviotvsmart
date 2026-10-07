# VIDAA Home performance — 7 October 2026

The user reports stutter on the physical TV, while the PC preview is fluid.
Browser checks below verify correctness and bounded rendering, not TV FPS.

## Public streaming-app research

- [Twitch's Hisense entry point](https://hisense.tv.twitch.tv/) serves a Next.js/React application. Its public bundle
  [\_app-57c72baaab3b6d86.js](https://hisense.tv.twitch.tv/_next/static/chunks/pages/_app-57c72baaab3b6d86.js)
  contains virtualized lists, visible-item selection and buffered viewport windows.
  This is inspection of its publicly served code, not a physical-device benchmark.
- [Netflix's engineering account of TV graphics memory](https://medium.com/netflix-techblog/bringing-rich-experiences-to-memory-constrained-tv-devices-6de771eabb16)
  explains the cost of decoded images and full-screen surfaces. Netflix uses a
  native SDK/custom renderer; its TV application isn't ordinary HTML we can port.
- VIDAA's indexed development guide recommends modest graphics and careful
  memory management. Its original public PDF URL currently returns 404, so old
  indexed memory/chip specifications aren't evidence about this user's TV.

## Implementation

- `vidaaHomeCardWindow.js` retains lightweight card anchors and exact measured
  slots, detaching distant visual subtrees into fragments. It preserves node
  identity and listeners, restores a selected target before native focus, and
  restores the complete tree before reconciliation and cleanup.
- `vidaaHomeImageWindow.js` removes distant image sources, retaining their
  successful URLs for rehydration. Collapsed expanded-card artwork is released
  too. Browser caches still control actual decoded-memory reclamation.
- Both windows update after input/scrolling settles. A larger retention window
  than the existing prefetch window avoids repeated parking at the boundary.
- Held navigation defers background renders across all VIDAA Home layouts.
- Trailer cleanup tracks mounted previews instead of scanning every empty card
  layer on each arrow. Expanded-card collapse uses the already disabled VIDAA
  size transitions without forcing synchronous layout. Other platforms retain
  their existing transition/reflow behavior.
- Home's fixed clipped viewport has layout/paint containment and scroll anchoring
  disabled, so browser compensation doesn't compete with app-owned scrolling.

## Verification

- Twelve targeted Node tests cover focus/scroll, direction reversal, loading,
  images, preview cleanup, grid, sidebar, collections and other-platform behavior.
- `tests/test-vidaa-home-window.html` exercises 300 cards: 32 visual subtrees
  remain attached in its initial viewport. All 300 navigation anchors remain.
  Scroll extents, focus, original event listeners and reconciliation are checked.
  A separate 60-card grid verifies vertical windowing and stable card positions.
- `tests/test-vidaa-home-patching.html` checks keyed updates, hydrated images,
  focus/scroll retention and progressively appended cards.
- The local real-catalog Home initially went from roughly 1,100 descendant
  elements to roughly 470 after settling, with the same catalog navigation.
  Actual app checks include expanded-card collapse, details and Back restoration.
- Physical-TV FPS, memory usage and input latency remain unmeasured. Testing on
  the user's TV is needed to determine how much perceived stutter remains.
