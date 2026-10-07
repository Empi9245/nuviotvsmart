const ROW_SELECTOR = ".home-row, .home-grid-section";
const STYLE_PROPERTIES = ["width", "height", "box-sizing"];

function restoreCard(card, record) {
  card.appendChild(record.content);
  for (const [property, value, priority] of record.styles) {
    if (value) card.style.setProperty(property, value, priority);
    else card.style.removeProperty(property);
  }
  card.classList.remove("vidaa-card-parked");
}

function rememberRestoredCard(screen, card, record) {
  const restored = screen.homeVidaaRestoredCards || (screen.homeVidaaRestoredCards = new Set());
  const metadata = screen.homeVidaaRestoredCardMeta || (screen.homeVidaaRestoredCardMeta = new WeakMap());
  restored.add(card);
  metadata.set(card, {
    width: Number(record.width || 0),
    height: Number(record.height || 0),
    styles: record.styles
  });
}

function reparkRestoredCard(screen, card) {
  const metadata = screen.homeVidaaRestoredCardMeta?.get(card);
  if (!metadata || !card?.childNodes?.length || card.querySelector("iframe, video")) return false;

  const width = Number(metadata.width || card.offsetWidth || 0);
  const height = Number(metadata.height || card.offsetHeight || 0);
  if (width <= 0 || height <= 0) return false;

  const content = card.ownerDocument.createDocumentFragment();
  while (card.firstChild) content.appendChild(card.firstChild);
  card.style.setProperty("box-sizing", "border-box");
  card.style.setProperty("width", `${width}px`);
  card.style.setProperty("height", `${height}px`);
  card.classList.add("vidaa-card-parked");

  const parked = screen.homeVidaaParkedCards || (screen.homeVidaaParkedCards = new Map());
  parked.set(card, {
    content,
    styles: metadata.styles,
    width,
    height
  });
  screen.homeVidaaRestoredCards?.delete(card);
  screen.homeLazyImageHydrationNeedsIndexRefresh = true;
  return true;
}

function trimVidaaRestoredNavigationCards(screen, target) {
  const restored = screen.homeVidaaRestoredCards;
  const rows = screen.navModel?.rows;
  if (!restored?.size || !target || !Array.isArray(rows)) return 0;

  const targetRow = Number(target.dataset?.navRow);
  const targetCol = Number(target.dataset?.navCol);
  if (!Number.isInteger(targetRow) || !Number.isInteger(targetCol)) return 0;

  let parked = 0;
  Array.from(restored).forEach((card) => {
    if (!card?.isConnected || card === target || card.contains?.(target)) {
      if (!card?.isConnected) restored.delete(card);
      return;
    }
    const row = Number(card.dataset?.navRow);
    const col = Number(card.dataset?.navCol);
    if (!Number.isInteger(row) || !Number.isInteger(col)) return;

    const rowDistance = Math.abs(row - targetRow);
    const colDistance = Math.abs(col - targetCol);
    // Keep the current row plus one row on either side for the 140 ms camera
    // transition. Everything restored farther behind can be re-parked without
    // geometry reads, preventing held vertical navigation from growing the DOM.
    const keep = rowDistance === 0 ? colDistance <= 7 : rowDistance === 1 && colDistance <= 4;
    if (!keep && reparkRestoredCard(screen, card)) parked += 1;
  });
  return parked;
}

export function restoreVidaaHomeCard(screen, card) {
  const record = screen.homeVidaaParkedCards?.get(card);
  if (!record) return false;
  restoreCard(card, record);
  screen.homeVidaaParkedCards.delete(card);
  rememberRestoredCard(screen, card, record);
  screen.homeLazyImageHydrationNeedsIndexRefresh = true;
  return true;
}

export function restoreAllVidaaHomeCards(screen) {
  screen.homeVidaaParkedCards?.forEach((record, card) => restoreCard(card, record));
  screen.homeVidaaParkedCards?.clear();
  screen.homeVidaaRestoredCards?.clear();
  screen.homeVidaaRestoredCardMeta = new WeakMap();
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
    const predictedCol = Math.max(0, Math.min(nextRow.length - 1, colIndex));
    addRange(nextRow, predictedCol - 2, predictedCol + 2);
  }

  let restored = 0;
  candidates.forEach((card) => {
    if (card && restoreVidaaHomeCard(screen, card)) restored += 1;
  });
  trimVidaaRestoredNavigationCards(screen, target);
  return restored;
}

// Keep the card anchor (identity, focus, flex slot and measured dimensions)
// mounted, but detach its visual subtree outside a small viewport neighborhood.
// This works on older engines without content-visibility/IntersectionObserver.
export function updateVidaaHomeCardWindow(screen, viewportRect, focusedNode) {
  const parked = screen.homeVidaaParkedCards || (screen.homeVidaaParkedCards = new Map());
  parked.forEach((record, card) => {
    if (!screen.container.contains(card)) {
      restoreCard(card, record);
      parked.delete(card);
    }
  });
  const rows = new Map();
  const changes = [];
  for (const card of screen.container.querySelectorAll(".home-main .home-content-card")) {
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
      near = cardRect.right >= viewportRect.left - 600 && cardRect.left <= viewportRect.right + 600 &&
        cardRect.bottom >= viewportRect.top - 600 && cardRect.top <= viewportRect.bottom + 600;
    }
    if (near && parked.has(card)) changes.push({ card, restore: true });
    else if (!near && !parked.has(card) && card.childNodes.length && !card.querySelector("iframe, video")) {
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
      styles: STYLE_PROPERTIES.map((property) => [property, card.style.getPropertyValue(property), card.style.getPropertyPriority(property)]),
      width: change.width,
      height: change.height
    };
    card.style.setProperty("box-sizing", "border-box");
    card.style.setProperty("width", `${change.width}px`);
    card.style.setProperty("height", `${change.height}px`);
    while (card.firstChild) record.content.appendChild(card.firstChild);
    card.classList.add("vidaa-card-parked");
    parked.set(card, record);
    screen.homeVidaaRestoredCards?.delete(card);
  }
  return changes.length;
}
