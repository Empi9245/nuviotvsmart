import * as internals from "./homeScreenContext.js";
import { Platform } from "../../../platform/index.js";
import { isVidaaNavigationBusy, VIDAA_NAVIGATION_SETTLE_MS } from "../../navigation/vidaaNavigationActivity.js";
import { releaseDistantVidaaHomeImages } from "./vidaaHomeImageWindow.js";
import { updateVidaaHomeCardWindow } from "./vidaaHomeCardWindow.js";

function isVidaaHomeHydrationBusy(screen) {
  return screen.isVidaaHomeLoadingBusy?.() ?? isVidaaNavigationBusy();
}

const VIDAA_POSTER_SELECTOR = ".content-poster, .home-continue-bg";
const VIDAA_PENDING_POSTER_SELECTOR = ".content-poster[data-src], .home-continue-bg[data-src]";
const VIDAA_HORIZONTAL_REPEAT_FLOOR_MS = 80;
const VIDAA_VERTICAL_REPEAT_FLOOR_MS = 112;
const VIDAA_DEFAULT_POSTER_READY_MS = 650;
const VIDAA_PREFETCH_SAFETY_MS = 160;
const VIDAA_HORIZONTAL_MIN_AHEAD = 5;
const VIDAA_HORIZONTAL_MAX_AHEAD = 12;
const VIDAA_VERTICAL_MIN_ROWS_AHEAD = 2;
const VIDAA_VERTICAL_MAX_ROWS_AHEAD = 8;
const VIDAA_VERTICAL_PREFETCH_BUDGET = 18;
const VIDAA_PREFETCH_MAX_INFLIGHT = 18;
const VIDAA_PREFETCH_WARM_URL_LIMIT = 96;

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function recordVidaaPosterReadyLatency(screen, elapsedMs) {
  const sample = Number(elapsedMs || 0);
  if (!screen || !Number.isFinite(sample) || sample < 40 || sample > 4000) return;
  const previous = Number(screen.homeVidaaPosterReadyEwmaMs || 0);
  const bounded = clampNumber(sample, 220, 1400);
  screen.homeVidaaPosterReadyEwmaMs = previous > 0
    ? previous * 0.72 + bounded * 0.28
    : bounded;
}

function observeVidaaPosterReady(screen, image, startedAt) {
  if (!image?.addEventListener) return;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    recordVidaaPosterReadyLatency(screen, Date.now() - startedAt);
  };
  image.addEventListener(
    "load",
    () => {
      try {
        const decoded = image.decode?.();
        if (decoded?.then) {
          decoded.catch(() => {}).finally(finish);
          return;
        }
      } catch (_) {}
      finish();
    },
    { once: true }
  );
}

function hydrateVidaaPriorityPoster(screen, image, priority = "auto") {
  if (!(image instanceof HTMLImageElement) || !image.isConnected || !image.dataset.src) return false;
  const src = String(image.dataset.src || "").trim();
  const startedAt = Date.now();
  image.loading = "eager";
  image.decoding = "async";
  try {
    image.fetchPriority = priority;
  } catch (_) {}
  observeVidaaPosterReady(screen, image, startedAt);
  image.removeAttribute("data-src");
  if (src) image.src = src;
  return Boolean(src);
}

function getVidaaPosterSource(screen, node) {
  if (!node) return "";
  const direct = String(node.dataset?.posterSrc || "").trim();
  if (direct) return direct;

  const liveImage = node.querySelector?.(VIDAA_POSTER_SELECTOR);
  const liveSource = String(liveImage?.dataset?.src || liveImage?.getAttribute?.("src") || "").trim();
  if (liveSource) return liveSource;

  const parkedRecord = screen?.homeVidaaParkedCards?.get?.(node);
  const parkedImage = parkedRecord?.content?.querySelector?.(VIDAA_POSTER_SELECTOR);
  return String(parkedImage?.dataset?.src || parkedImage?.getAttribute?.("src") || "").trim();
}

function rememberVidaaWarmPosterUrl(screen, src) {
  const warmed = screen.homeVidaaPosterWarmUrls || (screen.homeVidaaPosterWarmUrls = new Set());
  if (warmed.has(src)) warmed.delete(src);
  warmed.add(src);
  while (warmed.size > VIDAA_PREFETCH_WARM_URL_LIMIT) {
    const oldest = warmed.values().next().value;
    warmed.delete(oldest);
  }
}

function prefetchVidaaPosterSource(screen, src) {
  const source = String(src || "").trim();
  if (!screen || !source || typeof globalThis.Image !== "function") return false;

  const warmed = screen.homeVidaaPosterWarmUrls || (screen.homeVidaaPosterWarmUrls = new Set());
  if (warmed.has(source)) return true;

  const inflight = screen.homeVidaaPosterPrefetchInflight || (screen.homeVidaaPosterPrefetchInflight = new Map());
  if (inflight.has(source)) return true;
  if (inflight.size >= VIDAA_PREFETCH_MAX_INFLIGHT) return false;

  let preload;
  try {
    preload = new globalThis.Image();
  } catch (_) {
    return false;
  }

  const startedAt = Date.now();
  const finish = (success) => {
    if (inflight.get(source) !== preload) return;
    inflight.delete(source);
    if (!success) return;
    rememberVidaaWarmPosterUrl(screen, source);
    recordVidaaPosterReadyLatency(screen, Date.now() - startedAt);
  };

  preload.decoding = "async";
  try {
    preload.fetchPriority = "low";
  } catch (_) {}
  preload.onload = () => {
    try {
      const decoded = preload.decode?.();
      if (decoded?.then) {
        decoded.catch(() => {}).finally(() => finish(true));
        return;
      }
    } catch (_) {}
    finish(true);
  };
  preload.onerror = () => finish(false);
  inflight.set(source, preload);
  preload.src = source;
  return true;
}

function warmVidaaPosterNode(screen, node, priority = "low") {
  if (!node) return false;
  const livePending = node.querySelector?.(VIDAA_PENDING_POSTER_SELECTOR);
  if (livePending) {
    return hydrateVidaaPriorityPoster(screen, livePending, priority);
  }
  const livePoster = node.querySelector?.(VIDAA_POSTER_SELECTOR);
  if (livePoster?.getAttribute?.("src") || livePoster?.src) {
    return true;
  }
  return prefetchVidaaPosterSource(screen, getVidaaPosterSource(screen, node));
}

function getVidaaNavigationIntervalMs(screen, direction) {
  const horizontal = direction === "left" || direction === "right";
  const vertical = direction === "up" || direction === "down";
  if (!horizontal && !vertical) return 0;

  const floorMs = horizontal ? VIDAA_HORIZONTAL_REPEAT_FLOOR_MS : VIDAA_VERTICAL_REPEAT_FLOOR_MS;
  const now = Date.now();
  const state = screen.homeVidaaPrefetchMotion || (screen.homeVidaaPrefetchMotion = {});
  const sameDirection = state.direction === direction;
  const elapsed = sameDirection ? now - Number(state.lastAt || 0) : 0;
  let intervalMs = Number(state.intervalMs || floorMs);

  if (sameDirection && elapsed >= floorMs * 0.75 && elapsed <= 650) {
    intervalMs = intervalMs * 0.65 + elapsed * 0.35;
  } else if (!sameDirection || elapsed > 650) {
    // A new run starts from the fastest accepted VIDAA repeat cadence. This
    // prevents the first held presses from outrunning a conservative buffer.
    intervalMs = floorMs;
  }

  state.direction = direction;
  state.lastAt = now;
  state.intervalMs = clampNumber(intervalMs, floorMs, 360);
  return state.intervalMs;
}

function getVidaaPrefetchPlan(screen, anchor, direction) {
  const intervalMs = getVidaaNavigationIntervalMs(screen, direction);
  if (!intervalMs) {
    return {
      horizontalAhead: 0,
      verticalRowsAhead: 0,
      verticalVisibleCount: 0,
      verticalBudget: 0
    };
  }

  const posterReadyMs = clampNumber(
    Number(screen.homeVidaaPosterReadyEwmaMs || VIDAA_DEFAULT_POSTER_READY_MS),
    280,
    1200
  );
  const readyWindowMs = clampNumber(posterReadyMs + VIDAA_PREFETCH_SAFETY_MS, 480, 1250);
  const horizontal = direction === "left" || direction === "right";

  if (horizontal) {
    return {
      horizontalAhead: clampNumber(
        Math.ceil(readyWindowMs / intervalMs),
        VIDAA_HORIZONTAL_MIN_AHEAD,
        VIDAA_HORIZONTAL_MAX_AHEAD
      ),
      verticalRowsAhead: 0,
      verticalVisibleCount: 0,
      verticalBudget: 0
    };
  }

  const landscape = Boolean(anchor?.classList?.contains?.("is-landscape"));
  return {
    horizontalAhead: 0,
    verticalRowsAhead: clampNumber(
      Math.ceil(readyWindowMs / intervalMs),
      VIDAA_VERTICAL_MIN_ROWS_AHEAD,
      VIDAA_VERTICAL_MAX_ROWS_AHEAD
    ),
    verticalVisibleCount: landscape ? 5 : 7,
    verticalBudget: VIDAA_VERTICAL_PREFETCH_BUDGET
  };
}

function getVidaaRowNeighborhoodNodes(screen, anchor, count = 1, rowOffset = 0) {
  if (!anchor || !Array.isArray(screen.navModel?.rows)) return [];
  const rowIndex = Number(anchor.dataset?.navRow);
  const colIndex = Number(anchor.dataset?.navCol);
  if (!Number.isInteger(rowIndex) || !Number.isInteger(colIndex)) return [];

  const row = screen.navModel.rows[rowIndex + rowOffset] || [];
  if (!row.length) return [];

  const offsets = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6];
  const nodes = [];
  for (const offset of offsets) {
    const node = row[colIndex + offset] || null;
    if (node && !nodes.includes(node)) nodes.push(node);
    if (nodes.length >= count) break;
  }
  return nodes;
}

function getVidaaHorizontalPrefetchNodes(screen, anchor, direction, count) {
  if (!anchor || !Array.isArray(screen.navModel?.rows)) return [];
  const rowIndex = Number(anchor.dataset?.navRow);
  const colIndex = Number(anchor.dataset?.navCol);
  if (!Number.isInteger(rowIndex) || !Number.isInteger(colIndex)) return [];

  const row = screen.navModel.rows[rowIndex] || [];
  const step = direction === "right" ? 1 : -1;
  const nodes = [];
  for (let distance = 1; distance <= count; distance += 1) {
    const node = row[colIndex + step * distance] || null;
    if (node) nodes.push(node);
  }
  return nodes;
}

function allocateVidaaVerticalPrefetchCounts(rowsAhead, visibleCount, totalBudget) {
  const rows = Math.max(0, Math.floor(Number(rowsAhead || 0)));
  if (!rows) return [];
  const counts = Array(rows).fill(1);
  let remaining = Math.max(0, Math.floor(Number(totalBudget || 0)) - rows);
  const caps = counts.map((_, index) =>
    Math.max(1, Math.min(visibleCount, visibleCount - Math.floor(index * 0.9)))
  );

  while (remaining > 0) {
    let changed = false;
    for (let index = 0; index < counts.length && remaining > 0; index += 1) {
      if (counts[index] >= caps[index]) continue;
      counts[index] += 1;
      remaining -= 1;
      changed = true;
    }
    if (!changed) break;
  }
  return counts;
}

function getVidaaVerticalPrefetchNodes(screen, anchor, direction, plan) {
  if (direction !== "up" && direction !== "down") return [];
  const step = direction === "down" ? 1 : -1;
  const counts = allocateVidaaVerticalPrefetchCounts(
    plan.verticalRowsAhead,
    plan.verticalVisibleCount,
    plan.verticalBudget
  );
  const groups = [];
  counts.forEach((count, index) => {
    const nodes = getVidaaRowNeighborhoodNodes(screen, anchor, count, step * (index + 1));
    if (nodes.length) groups.push(...nodes);
  });
  return groups;
}

export function createHomeScreenMethods24() {
  const {
    MODERN_HOME_CONSTANTS,
    CW_DAYS_CAP,
    HOME_LAZY_IMAGE_SELECTOR,
    HOME_LAZY_IMAGE_ROW_SELECTOR,
    HOME_LEGACY_LAZY_HYDRATION_DEBOUNCE_MS,
    HOME_LEGACY_LAZY_HYDRATION_MAX_PER_FRAME,
    getTvRuntimePerformanceProfile,
    isSeriesTypeForContinueWatching,
    isCompletedForContinueWatching,
    episodeKey,
    episodeSortKey,
    buildNextUpSeedFromWatchedItem
  } = internals;

  return {
    shouldUseBoundedHomeImageHydration() {
      // Keep image prefetch bounded on TV independently of the animated scroll policy.
      return Boolean(this.isPerformanceConstrained() || getTvRuntimePerformanceProfile().isTvRuntime);
    },
    scheduleHomeLazyImageHydration(
      anchorNode = null,
      {
        refreshIndex = false,
        deferUntilVerticalSettle = false,
        focusedRowOnly = false,
        includeNeighborRows = false,
        viewportChanged = false,
        navigationDirection = null
      } = {}
    ) {
      if (Platform.isVidaa()) {
        this.scheduleVidaaHomeLazyImageHydration(anchorNode, { refreshIndex, navigationDirection });
        return;
      }
      const anchorRow = anchorNode instanceof HTMLElement ? anchorNode.closest(HOME_LAZY_IMAGE_ROW_SELECTOR) : null;
      const anchorImagePending = Boolean(
        anchorNode?.querySelector?.(".content-poster[data-src], .home-poster-landscape-logo[data-src], .home-continue-bg[data-src]")
      );
      const legacyFocusedRowPass = Boolean(this.isLegacyTvRuntime() && focusedRowOnly && anchorRow instanceof HTMLElement);
      if (legacyFocusedRowPass) {
        if (this.homeLazyImageNeighborTimer) {
          clearTimeout(this.homeLazyImageNeighborTimer);
        }
        this.homeLazyImageNeighborTimer = setTimeout(() => {
          this.homeLazyImageNeighborTimer = null;
          this.scheduleHomeLazyImageHydration(this.getCurrentFocusedNode(), {
            includeNeighborRows: true
          });
        }, HOME_LEGACY_LAZY_HYDRATION_DEBOUNCE_MS);
      }
      if (
        anchorRow instanceof HTMLElement &&
        anchorRow === this.lastHomeLazyImageHydrationAnchorRow &&
        !refreshIndex &&
        !this.homeLazyImageHydrationNeedsFullScan &&
        !this.homeLazyImageHydrationNeedsIndexRefresh &&
        !this.homeLazyImageHydrationRaf &&
        !includeNeighborRows &&
        !viewportChanged &&
        !(this.shouldUseBoundedHomeImageHydration() && anchorImagePending)
      ) {
        // Avoid scheduling another animation-frame callback until the DOM,
        // viewport, or focused image changes. Smart-TV bounded hydration may
        // leave a later horizontal target pending, so that target is allowed to
        // request a second pass.
        return;
      }
      if (anchorNode instanceof HTMLElement) {
        this.pendingHomeLazyImageAnchor = anchorNode;
      } else {
        this.homeLazyImageHydrationNeedsFullScan = true;
      }
      this.pendingHomeLazyImageFocusedRowOnly = legacyFocusedRowPass;
      this.pendingHomeLazyImageIncludeNeighborRows = Boolean(includeNeighborRows || (this.isLegacyTvRuntime() && !legacyFocusedRowPass));
      if (refreshIndex) {
        this.homeLazyImageHydrationNeedsIndexRefresh = true;
      }
      if (!legacyFocusedRowPass && (includeNeighborRows || !(anchorRow instanceof HTMLElement))) {
        if (this.homeLazyImageNeighborTimer) {
          clearTimeout(this.homeLazyImageNeighborTimer);
          this.homeLazyImageNeighborTimer = null;
        }
      }
      if (deferUntilVerticalSettle && !legacyFocusedRowPass && this.shouldUseImmediateFocusScroll() && this.layoutMode === "modern") {
        if (this.homeLazyImageHydrationSettleTimer) {
          clearTimeout(this.homeLazyImageHydrationSettleTimer);
        }
        const target = anchorNode instanceof HTMLElement ? anchorNode : null;
        const hydrationDelayMs = this.shouldUseImmediateFocusScroll()
          ? MODERN_HOME_CONSTANTS.smartTvLazyHydrationDebounceMs
          : MODERN_HOME_CONSTANTS.verticalScrollSettlePollMs;
        const retryAfterVerticalSettle = () => {
          this.homeLazyImageHydrationSettleTimer = null;
          if (this.isModernVerticalScrollActive()) {
            this.homeLazyImageHydrationSettleTimer = setTimeout(retryAfterVerticalSettle, MODERN_HOME_CONSTANTS.verticalScrollSettlePollMs);
            return;
          }
          this.scheduleHomeLazyImageHydration(target, { refreshIndex });
        };
        this.homeLazyImageHydrationSettleTimer = setTimeout(retryAfterVerticalSettle, hydrationDelayMs);
        return;
      }
      if (this.homeLazyImageHydrationSettleTimer) {
        clearTimeout(this.homeLazyImageHydrationSettleTimer);
        this.homeLazyImageHydrationSettleTimer = null;
      }
      if (this.modernVerticalFastScrollState) {
        return;
      }
      if (this.homeLazyImageHydrationRaf) {
        return;
      }
      this.homeLazyImageHydrationRaf = requestAnimationFrame(() => {
        this.homeLazyImageHydrationRaf = 0;
        const anchor = this.pendingHomeLazyImageAnchor || this.getCurrentFocusedNode();
        this.pendingHomeLazyImageAnchor = null;
        const forceFullScan = Boolean(this.homeLazyImageHydrationNeedsFullScan);
        this.homeLazyImageHydrationNeedsFullScan = false;
        const shouldRefreshIndex = Boolean(this.homeLazyImageHydrationNeedsIndexRefresh);
        this.homeLazyImageHydrationNeedsIndexRefresh = false;
        const onlyFocusedRow = Boolean(this.pendingHomeLazyImageFocusedRowOnly);
        this.pendingHomeLazyImageFocusedRowOnly = false;
        const includeNeighbors = Boolean(this.pendingHomeLazyImageIncludeNeighborRows);
        this.pendingHomeLazyImageIncludeNeighborRows = false;
        this.hydrateHomeLazyImages(anchor, {
          forceFullScan,
          refreshIndex: shouldRefreshIndex,
          focusedRowOnly: onlyFocusedRow,
          includeNeighborRows: includeNeighbors
        });
      });
    },
    scheduleVidaaHomeLazyImageHydration(
      anchorNode = null,
      { refreshIndex = false, navigationDirection = null } = {}
    ) {
      if (!this.container || this.container.isConnected === false) return;
      const anchor = anchorNode || this.getCurrentFocusedNode();
      this.pendingHomeLazyImageAnchor = anchor;
      this.homeLazyImageHydrationNeedsIndexRefresh ||= refreshIndex;
      const focusedPoster = anchor?.querySelector?.(VIDAA_PENDING_POSTER_SELECTOR);
      hydrateVidaaPriorityPoster(this, focusedPoster, "high");

      const prefetchPlan = getVidaaPrefetchPlan(this, anchor, navigationDirection);
      const horizontalNavigation = navigationDirection === "left" || navigationDirection === "right";
      const verticalNavigation = navigationDirection === "up" || navigationDirection === "down";

      if (verticalNavigation) {
        // The row being entered is already visible while its 140 ms camera move
        // is running. Hydrate its visible neighborhood immediately; future rows
        // are prefetched below and become cache hits as they approach.
        getVidaaRowNeighborhoodNodes(this, anchor, prefetchPlan.verticalVisibleCount).forEach((node) => {
          if (node !== anchor) warmVidaaPosterNode(this, node, "auto");
        });
      }

      const predictedNodes = horizontalNavigation
        ? getVidaaHorizontalPrefetchNodes(
            this,
            anchor,
            navigationDirection,
            prefetchPlan.horizontalAhead
          )
        : getVidaaVerticalPrefetchNodes(this, anchor, navigationDirection, prefetchPlan);

      predictedNodes.forEach((node) => {
        // Live near-window cards get their real img source now. Parked cards are
        // fetched through a detached Image request instead, so long runways do
        // not inflate the hot DOM or undo the card-windowing performance win.
        warmVidaaPosterNode(this, node, "low");
      });
      if (this.homeLazyImageHydrationSettleTimer) clearTimeout(this.homeLazyImageHydrationSettleTimer);
      if (this.homeLazyImageHydrationRaf) {
        cancelAnimationFrame(this.homeLazyImageHydrationRaf);
        this.homeLazyImageHydrationRaf = 0;
      }
      if (this.homeLazyImageCommitRaf) {
        cancelAnimationFrame(this.homeLazyImageCommitRaf);
        this.homeLazyImageCommitRaf = 0;
      }
      if (this.homeLazyImageCommitQueue) this.homeLazyImageCommitQueue.length = 0;
      const hydrateWhenSettled = () => {
        this.homeLazyImageHydrationSettleTimer = null;
        if (!this.container || this.container.isConnected === false) return;
        if (isVidaaHomeHydrationBusy(this)) {
          this.homeLazyImageHydrationSettleTimer = setTimeout(hydrateWhenSettled, 50);
          return;
        }
        const currentAnchor = this.getCurrentFocusedNode() || this.pendingHomeLazyImageAnchor;
        this.pendingHomeLazyImageAnchor = null;
        const shouldRefreshIndex = Boolean(this.homeLazyImageHydrationNeedsIndexRefresh);
        this.homeLazyImageHydrationNeedsIndexRefresh = false;
        this.homeLazyImageHydrationNeedsFullScan = false;
        this.hydrateHomeLazyImages(currentAnchor, {
          forceFullScan: true,
          refreshIndex: shouldRefreshIndex,
          includeNeighborRows: true
        });
      };
      this.homeLazyImageHydrationSettleTimer = setTimeout(hydrateWhenSettled, VIDAA_NAVIGATION_SETTLE_MS);
    },
    buildHomeLazyImageHydrationIndex() {
      if (!this.container) {
        this.homeLazyImageHydrationIndex = null;
        return [];
      }
      const imagesByRow = new Map();
      Array.from(this.container.querySelectorAll(HOME_LAZY_IMAGE_SELECTOR)).forEach((image) => {
        const row = image.closest(HOME_LAZY_IMAGE_ROW_SELECTOR);
        const rowImages = imagesByRow.get(row) || [];
        rowImages.push(image);
        imagesByRow.set(row, rowImages);
      });
      const index = Array.from(imagesByRow, ([row, images]) => ({ row, images }));
      this.homeLazyImageHydrationIndex = index;
      return index;
    },
    hydrateHomeLazyImages(
      anchorNode = null,
      { forceFullScan = false, refreshIndex = false, focusedRowOnly = false, includeNeighborRows = false } = {}
    ) {
      if (!this.container) {
        return;
      }
      if (Platform.isVidaa() && isVidaaHomeHydrationBusy(this)) {
        this.scheduleVidaaHomeLazyImageHydration(anchorNode, { refreshIndex });
        return;
      }
      const anchorRow = anchorNode?.closest?.(HOME_LAZY_IMAGE_ROW_SELECTOR) || null;
      const useBoundedTvHydration = this.shouldUseBoundedHomeImageHydration();
      const sameAnchorRow = anchorRow instanceof HTMLElement && anchorRow === this.lastHomeLazyImageHydrationAnchorRow;
      if (!forceFullScan && !refreshIndex && sameAnchorRow && !useBoundedTvHydration) {
        // The first pass for a focused row hydrates every image in that row. On
        // subsequent horizontal moves, the viewport geometry for every other row
        // is unchanged, so rescanning and measuring all distant lazy images only
        // repeats work on the D-pad hot path.
        return;
      }
      this.lastHomeLazyImageHydrationAnchorRow = anchorRow;
      const viewport =
        this.container.querySelector(".home-modern-rows-viewport") || this.container.querySelector(".home-main") || this.container;
      const viewportRect = viewport.getBoundingClientRect();
      if (Platform.isVidaa() && releaseDistantVidaaHomeImages(this.container, viewportRect, anchorNode)) {
        // Released posters re-enter the deferred index. Expanded assets have
        // their own focus loader and aren't part of this index.
        refreshIndex = true;
      }
      if (Platform.isVidaa() && updateVidaaHomeCardWindow(this, viewportRect, anchorNode)) refreshIndex = true;
      const imageRows =
        refreshIndex || !Array.isArray(this.homeLazyImageHydrationIndex)
          ? this.buildHomeLazyImageHydrationIndex()
          : this.homeLazyImageHydrationIndex;
      if (!imageRows.length) {
        return;
      }
      const constrained = this.isPerformanceConstrained();
      // Android prefetches the visible window plus a small row/card neighborhood.
      // Keep the browser's DOM-mounted rows from turning every vertical focus
      // move into a burst of eager image requests.
      const verticalMargin = useBoundedTvHydration ? 480 : constrained ? 720 : 1200;
      const horizontalMargin = useBoundedTvHydration ? 320 : constrained ? 520 : 1000;
      const focusedRow = Boolean(anchorRow && anchorRow === anchorNode?.closest?.(HOME_LAZY_IMAGE_ROW_SELECTOR));
      const focusedRowMargin = focusedRow ? Math.max(96, Math.round(Number(anchorNode?.offsetWidth || 0) * 0.65)) : horizontalMargin;
      const pendingLoads = [];
      imageRows.forEach((entry) => {
        const { row } = entry;
        if (row instanceof HTMLElement && !row.isConnected) {
          return;
        }
        const isFocusedRow = Boolean(anchorRow && row === anchorRow);
        if (focusedRowOnly && anchorRow && !isFocusedRow) {
          return;
        }
        if (sameAnchorRow && useBoundedTvHydration && !forceFullScan && !refreshIndex && !includeNeighborRows && !isFocusedRow) {
          return;
        }
        const images = entry.images.filter((image) => image.isConnected && image.dataset.src);
        entry.images = images;
        if (!images.length) return;
        // Android's LazyRow loads the visible cards plus a small prefetch
        // neighborhood, not every item in the focused row. Keep the same
        // bounded behavior on Smart-TV runtimes; older/browser fallback paths
        // retain the full focused-row hydration for compatibility.
        const shouldHydrateFocusedRowImmediately = isFocusedRow && !useBoundedTvHydration;
        if (!shouldHydrateFocusedRowImmediately && row instanceof HTMLElement) {
          const rowRect = row.getBoundingClientRect();
          const isRowNearViewport =
            rowRect.bottom >= viewportRect.top - verticalMargin && rowRect.top <= viewportRect.bottom + verticalMargin;
          if (!isRowNearViewport) {
            return;
          }
        }
        images.forEach((image) => {
          if (!(image instanceof HTMLImageElement) || !image.isConnected) {
            return;
          }
          const src = String(image.dataset.src || "").trim();
          if (!src) {
            image.removeAttribute("data-src");
            return;
          }
          if (!shouldHydrateFocusedRowImmediately) {
            const imageHorizontalMargin = isFocusedRow ? focusedRowMargin : horizontalMargin;
            const rect = image.getBoundingClientRect();
            const isNearViewport =
              rect.bottom >= viewportRect.top - verticalMargin &&
              rect.top <= viewportRect.bottom + verticalMargin &&
              rect.right >= viewportRect.left - imageHorizontalMargin &&
              rect.left <= viewportRect.right + imageHorizontalMargin;
            if (!isNearViewport) {
              return;
            }
          }
          // The app already decides when an image is close enough to load. Leaving
          // loading="lazy" here delegates that decision back to old TV browsers,
          // which can miscalculate visibility inside the nested modern-home viewport.
          const isFocusedImage = Boolean(
            anchorNode && (anchorNode === image || anchorNode.contains?.(image) || image.closest(".focusable") === anchorNode)
          );
          pendingLoads.push({
            image,
            src,
            row,
            isFocusedRow,
            isFocusedImage,
            priority: isFocusedImage ? 0 : isFocusedRow ? 1 : 2
          });
        });
      });
      // Complete geometry reads before changing image layout/loading state.
      if (this.isLegacyTvRuntime() || Platform.isVidaa()) {
        this.commitHomeLazyImageSources(pendingLoads, anchorNode, anchorRow);
      } else {
        pendingLoads.forEach(({ image, src }) => {
          image.loading = "eager";
          image.removeAttribute("data-src");
          image.src = src;
        });
      }
    },
    commitHomeLazyImageSources(queued = [], anchorNode = null, anchorRow = null) {
      const pending = this.homeLazyImageCommitQueue || (this.homeLazyImageCommitQueue = []);
      const nextOrder = () => {
        this.homeLazyImageCommitOrder = Number(this.homeLazyImageCommitOrder || 0) + 1;
        return this.homeLazyImageCommitOrder;
      };
      const isCurrentFocusedImage = (image) =>
        Boolean(anchorNode && (anchorNode === image || anchorNode.contains?.(image) || image.closest(".focusable") === anchorNode));
      pending.forEach((entry) => {
        entry.isFocusedImage = isCurrentFocusedImage(entry.image);
        entry.priority = entry.row === anchorRow ? (entry.isFocusedImage ? 0 : 1) : 2;
      });
      queued.forEach((entry) => {
        if (!(entry?.image instanceof HTMLImageElement) || !entry.image.isConnected || !entry.image.dataset.src) {
          return;
        }
        const existingIndex = pending.findIndex((candidate) => candidate.image === entry.image);
        if (existingIndex >= 0) {
          const existing = pending[existingIndex];
          existing.src = entry.src;
          existing.row = entry.row;
          existing.isFocusedRow = entry.isFocusedRow;
          existing.isFocusedImage = entry.isFocusedImage;
          existing.priority = entry.priority;
          existing.order = nextOrder();
          return;
        }
        pending.push({ ...entry, order: nextOrder() });
      });
      pending.sort((left, right) => left.priority - right.priority || left.order - right.order);
      if (!pending.length || this.homeLazyImageCommitRaf) {
        return;
      }

      const drain = () => {
        this.homeLazyImageCommitRaf = 0;
        if (Platform.isVidaa() && isVidaaHomeHydrationBusy(this)) {
          this.scheduleVidaaHomeLazyImageHydration(this.getCurrentFocusedNode());
          return;
        }
        let assigned = 0;
        const maxPerFrame = Platform.isVidaa() ? 4 : HOME_LEGACY_LAZY_HYDRATION_MAX_PER_FRAME;
        while (pending.length && assigned < maxPerFrame) {
          const { image, src } = pending.shift();
          if (!(image instanceof HTMLImageElement) || !image.isConnected) {
            continue;
          }
          const currentSrc = String(image.dataset.src || "").trim();
          if (!currentSrc) {
            continue;
          }
          image.loading = "eager";
          image.removeAttribute("data-src");
          image.src = currentSrc || src;
          assigned += 1;
        }
        if (pending.length) {
          this.homeLazyImageCommitRaf = requestAnimationFrame(drain);
        }
      };
      this.homeLazyImageCommitRaf = requestAnimationFrame(drain);
    },
    teardownGridStickyHeader() {
      if (this.gridStickyCleanup) {
        this.gridStickyCleanup();
        this.gridStickyCleanup = null;
      }
    },
    setupGridStickyHeader(showHeroSection) {
      const main = this.container?.querySelector(".home-main");
      const sticky = this.container?.querySelector("#homeGridSticky");
      const sections = Array.from(this.container?.querySelectorAll(".home-grid-section[data-section-title]") || []);
      if (!main || !sticky || !sections.length) {
        return;
      }
      const hero = showHeroSection ? this.container?.querySelector(".home-hero") : null;
      const heroHeight = hero ? hero.offsetHeight : 0;
      const update = () => {
        const threshold = main.scrollTop + 72;
        let activeTitle = "";
        sections.forEach((section) => {
          if (section.offsetTop <= threshold) {
            activeTitle = String(section.dataset.sectionTitle || "");
          }
        });
        const shouldShow = activeTitle && (!showHeroSection || main.scrollTop > Math.max(0, heroHeight - 48));
        sticky.textContent = activeTitle;
        sticky.classList.toggle("is-visible", Boolean(shouldShow));
      };
      main.addEventListener("scroll", update, { passive: true });
      update();
      this.gridStickyCleanup = () => {
        main.removeEventListener("scroll", update);
      };
    },
    selectNextUpProgressCandidates(allProgress = [], inProgressItems = [], watchedItems = [], options = {}) {
      const includeWatchedItemSeeds = options?.includeWatchedItemSeeds !== false;
      const includeProgressSeeds = options?.includeProgressSeeds !== false;
      const applyDaysCap = options?.applyDaysCap !== false;
      const cutoffMs = applyDaysCap ? Date.now() - CW_DAYS_CAP * 24 * 60 * 60 * 1000 : 0;
      const nextUpFromFurthestEpisode = options?.nextUpFromFurthestEpisode !== false;
      const inProgressSeriesIds = new Set(
        (Array.isArray(inProgressItems) ? inProgressItems : [])
          .filter((item) => isSeriesTypeForContinueWatching(item?.contentType || item?.type))
          .map((item) => String(item?.contentId || "").trim())
          .filter(Boolean)
      );

      const latestCompletedByContent = new Map();
      const shouldReplaceNextUpSeed = (existing, incoming) => {
        if (!existing) {
          return true;
        }
        const existingEpisodeKey = episodeSortKey(existing.season, existing.episode);
        const incomingEpisodeKey = episodeSortKey(incoming.season, incoming.episode);
        if (nextUpFromFurthestEpisode && incomingEpisodeKey !== existingEpisodeKey) {
          return incomingEpisodeKey > existingEpisodeKey;
        }
        const existingUpdated = Number(existing.updatedAt || 0);
        const incomingUpdated = Number(incoming.updatedAt || 0);
        if (incomingUpdated !== existingUpdated) {
          return incomingUpdated > existingUpdated;
        }
        return incomingEpisodeKey > existingEpisodeKey;
      };
      const addSeed = (entry) => {
        if (cutoffMs > 0 && Number(entry?.updatedAt || 0) < cutoffMs) {
          return;
        }
        const contentId = String(entry?.contentId || "").trim();
        if (!contentId || inProgressSeriesIds.has(contentId)) {
          return;
        }
        if (!isSeriesTypeForContinueWatching(entry?.contentType)) {
          return;
        }
        const season = Number(entry?.season || 0);
        const episode = Number(entry?.episode || 0);
        if (season <= 0 || episode <= 0 || !isCompletedForContinueWatching(entry)) {
          return;
        }

        const existing = latestCompletedByContent.get(contentId);
        if (shouldReplaceNextUpSeed(existing, entry)) {
          latestCompletedByContent.set(contentId, entry);
        }
      };

      if (includeProgressSeeds) {
        (Array.isArray(allProgress) ? allProgress : []).forEach(addSeed);
      }
      if (includeWatchedItemSeeds) {
        (Array.isArray(watchedItems) ? watchedItems : [])
          .map((item) => buildNextUpSeedFromWatchedItem(item))
          .filter(Boolean)
          .forEach(addSeed);
      }

      return Array.from(latestCompletedByContent.values()).sort(
        (left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0)
      );
    },
    buildWatchedEpisodeIndex(watchedItems = []) {
      const byContent = new Map();
      (Array.isArray(watchedItems) ? watchedItems : []).forEach((entry) => {
        const contentId = String(entry?.contentId || "").trim();
        const season = Number(entry?.season || 0);
        const episode = Number(entry?.episode || 0);
        if (!contentId || season <= 0 || episode <= 0) {
          return;
        }
        if (!byContent.has(contentId)) {
          byContent.set(contentId, new Set());
        }
        byContent.get(contentId).add(episodeKey(season, episode));
      });
      return byContent;
    }
  };
}
