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

export function restoreVidaaHomeCard(screen, card) {
  const record = screen.homeVidaaParkedCards?.get(card);
  if (!record) return false;
  restoreCard(card, record);
  screen.homeVidaaParkedCards.delete(card);
  screen.homeLazyImageHydrationNeedsIndexRefresh = true;
  return true;
}

export function restoreAllVidaaHomeCards(screen) {
  screen.homeVidaaParkedCards?.forEach((record, card) => restoreCard(card, record));
  screen.homeVidaaParkedCards?.clear();
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
      styles: STYLE_PROPERTIES.map((property) => [property, card.style.getPropertyValue(property), card.style.getPropertyPriority(property)])
    };
    card.style.setProperty("box-sizing", "border-box");
    card.style.setProperty("width", `${change.width}px`);
    card.style.setProperty("height", `${change.height}px`);
    while (card.firstChild) record.content.appendChild(card.firstChild);
    card.classList.add("vidaa-card-parked");
    parked.set(card, record);
  }
  return changes.length;
}
