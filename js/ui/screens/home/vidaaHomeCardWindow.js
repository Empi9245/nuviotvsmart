import { releaseVidaaHomeImage } from "./vidaaHomeImageWindow.js";
import { prefetchVidaaPosterSource } from "./vidaaHomePosterPrefetch.js";

const ROW_SELECTOR = ".home-row, .home-modern-row, .home-grid-section, .home-row-continue";
const STYLE_PROPERTIES = ["width", "height", "box-sizing"];
const ACTIVE_CARD_HEADROOM = 64;

function restoreCard(card, record) {
  card.appendChild(record.content);
  for (const [property, value, priority] of record.styles) {
    if (value) card.style.setProperty(property, value, priority);
    else card.style.removeProperty(property);
  }
  card.classList.remove("vidaa-card-parked");
}

export function restoreVidaaHomeCard(screen, card) {
  const record = screen.homeVidaaParkedCards?.get(card);
  if (!record) return false;
  restoreCard(card, record);
  screen.homeVidaaParkedCards.delete(card);
  screen.homeVidaaActiveCards?.add(card);
  scheduleVidaaHomeCardWindow(screen);
  screen.homeLazyImageHydrationNeedsIndexRefresh = true;
  return true;
}

export function suspendVidaaHomeCardWindow(screen) {
  if (screen.homeVidaaCardWindowTimer) clearTimeout(screen.homeVidaaCardWindowTimer);
  if (screen.homeVidaaCardWindowRaf) cancelAnimationFrame(screen.homeVidaaCardWindowRaf);
  screen.homeVidaaCardWindowTimer = 0;
  screen.homeVidaaCardWindowRaf = 0;
}

// A preserved Home keeps its bounded visual window intact while hidden. If its
// DOM is being removed, drop the detached fragments without reattaching them.
export function discardVidaaHomeCards(screen) {
  suspendVidaaHomeCardWindow(screen);
  screen.homeVidaaParkedCards?.clear();
  screen.homeVidaaActiveCards = null;
  screen.homeVidaaCardWindowBaseSize = 0;
}

export function restoreAllVidaaHomeCards(screen) {
  suspendVidaaHomeCardWindow(screen);
  screen.homeVidaaParkedCards?.forEach((record, card) => restoreCard(card, record));
  discardVidaaHomeCards(screen);
}

export function pruneVidaaHomeCards(screen) {
  screen.homeVidaaParkedCards?.forEach((record, card) => {
    if (!screen.container.contains(card)) screen.homeVidaaParkedCards.delete(card);
  });
  screen.homeVidaaActiveCards?.forEach((card) => {
    if (!screen.container.contains(card)) screen.homeVidaaActiveCards.delete(card);
  });
}

// This is a throttle, not a trailing debounce: uninterrupted arrows must still
// retire old visual trees. Measure only the active window, never the catalog on
// each key. Real viewport geometry protects cards still visible in the camera
// animation, including direction reversals and rows with different widths.
export function scheduleVidaaHomeCardWindow(screen, { initialize = false } = {}) {
  const active = screen.homeVidaaActiveCards;
  const highWaterMark = Math.max(
    96,
    Number(screen.homeVidaaCardWindowBaseSize || 0) + ACTIVE_CARD_HEADROOM
  );
  if (
    (active ? active.size <= highWaterMark : !initialize) ||
    screen.homeVidaaCardWindowTimer ||
    screen.homeVidaaCardWindowRaf
  )
    return;
  screen.homeVidaaCardWindowTimer = setTimeout(() => {
    screen.homeVidaaCardWindowTimer = 0;
    screen.homeVidaaCardWindowRaf = requestAnimationFrame(() => {
      screen.homeVidaaCardWindowRaf = 0;
      if (!screen.container || screen.container.isConnected === false) return;
      const viewport =
        screen.container.querySelector(".home-modern-rows-viewport") ||
        screen.container.querySelector(".home-main");
      if (viewport)
        updateVidaaHomeCardWindow(
          screen,
          viewport.getBoundingClientRect(),
          screen.getCurrentFocusedNode?.(),
          { activeOnly: Boolean(screen.homeVidaaActiveCards) }
        );
    });
  }, 80);
}

// Restore only the small navigation neighborhood that can become visible on the
// next D-pad step. This stays off the geometry-heavy full window scan, so held
// navigation can reveal content before the idle hydration pass without giving
// up the CPU/memory savings from parking distant card subtrees.
export function restoreVidaaHomeNavigationNeighborhood(screen, target, direction = null) {
  const parked = screen.homeVidaaParkedCards;
  if (!parked?.size || !target) return 0;

  const rows = screen.navModel?.rows;
  const rowIndex = Number(target.dataset?.navRow);
  const colIndex = Number(target.dataset?.navCol);
  if (!Array.isArray(rows) || !Number.isInteger(rowIndex) || !Number.isInteger(colIndex)) {
    return restoreVidaaHomeCard(screen, target) ? 1 : 0;
  }

  const candidates = new Set();
  const addRange = (nodes, from, to) => {
    if (!Array.isArray(nodes) || !nodes.length) return;
    const start = Math.max(0, from);
    const end = Math.min(nodes.length - 1, to);
    for (let index = start; index <= end; index += 1) {
      candidates.add(nodes[index]);
    }
  };

  const targetRow = rows[rowIndex] || [];
  const horizontalRadius = direction === "up" || direction === "down" ? 4 : 3;
  addRange(targetRow, colIndex - horizontalRadius, colIndex + horizontalRadius);

  if (direction === "left") {
    addRange(targetRow, colIndex - 5, colIndex - 4);
  } else if (direction === "right") {
    addRange(targetRow, colIndex + 4, colIndex + 5);
  } else if (direction === "up" || direction === "down") {
    const nextRowIndex = rowIndex + (direction === "down" ? 1 : -1);
    const nextRow = rows[nextRowIndex] || [];
    const preferredCol = Number(screen.resolvePreferredNodeForRow?.(nextRow)?.dataset?.navCol);
    const predictedCol = Number.isInteger(preferredCol)
      ? preferredCol
      : Math.max(0, Math.min(nextRow.length - 1, colIndex));
    addRange(nextRow, predictedCol - 2, predictedCol + 2);
  }

  let restored = 0;
  candidates.forEach((card) => {
    if (card && restoreVidaaHomeCard(screen, card)) restored += 1;
  });
  return restored;
}

// Keep the card anchor (identity, focus, flex slot and measured dimensions)
// mounted, but detach its visual subtree outside a small viewport neighborhood.
// This works on older engines without content-visibility/IntersectionObserver.
export function updateVidaaHomeCardWindow(
  screen,
  viewportRect,
  focusedNode,
  { activeOnly = false } = {}
) {
  const parked = screen.homeVidaaParkedCards || (screen.homeVidaaParkedCards = new Map());
  if (!activeOnly)
    parked.forEach((record, card) => {
      if (!screen.container.contains(card)) {
        restoreCard(card, record);
        parked.delete(card);
      }
    });
  const rows = new Map();
  const changes = [];
  const active = screen.homeVidaaActiveCards || (screen.homeVidaaActiveCards = new Set());
  const cards = activeOnly
    ? [...active]
    : screen.container.querySelectorAll(".home-main .home-content-card");
  for (const card of cards) {
    if (card.isConnected === false) {
      active.delete(card);
      continue;
    }
    if (!parked.has(card)) active.add(card);
    const row = card.closest(ROW_SELECTOR);
    if (!row || card === focusedNode || card.contains(focusedNode)) continue;
    let rect = rows.get(row);
    if (!rect) {
      rect = row.getBoundingClientRect();
      rows.set(row, rect);
    }
    let near = rect.bottom >= viewportRect.top - 600 && rect.top <= viewportRect.bottom + 600;
    if (near) {
      const cardRect = card.getBoundingClientRect();
      near =
        cardRect.right >= viewportRect.left - 600 &&
        cardRect.left <= viewportRect.right + 600 &&
        cardRect.bottom >= viewportRect.top - 600 &&
        cardRect.top <= viewportRect.bottom + 600;
    }
    if (near && parked.has(card)) changes.push({ card, restore: true });
    else if (
      !near &&
      !parked.has(card) &&
      card.childNodes.length &&
      !card.querySelector("iframe, video")
    ) {
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      if (width > 0 && height > 0) changes.push({ card, width, height });
    }
  }
  // Complete geometry reads before detaching content or fixing slot dimensions.
  for (const change of changes) {
    const { card } = change;
    if (change.restore) {
      restoreVidaaHomeCard(screen, card);
      continue;
    }
    const record = {
      content: card.ownerDocument.createDocumentFragment(),
      styles: STYLE_PROPERTIES.map((property) => [
        property,
        card.style.getPropertyValue(property),
        card.style.getPropertyPriority(property)
      ])
    };
    card.querySelectorAll("img[src]").forEach((image) => {
      // Retiring a tree must not abort a poster still needed by the runway.
      const src = image.getAttribute("src");
      if (screen.homeVidaaPosterPrefetchDesired?.has(src) && image.complete === false) {
        prefetchVidaaPosterSource(screen, src);
      }
      releaseVidaaHomeImage(image);
    });
    card.style.setProperty("box-sizing", "border-box");
    card.style.setProperty("width", `${change.width}px`);
    card.style.setProperty("height", `${change.height}px`);
    while (card.firstChild) record.content.appendChild(card.firstChild);
    card.classList.add("vidaa-card-parked");
    parked.set(card, record);
    active.delete(card);
  }
  if (!activeOnly || changes.length === 0) screen.homeVidaaCardWindowBaseSize = active.size;
  return changes.length;
}
