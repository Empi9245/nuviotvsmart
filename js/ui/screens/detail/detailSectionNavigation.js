const ROW_SELECTOR = [
  ".series-detail-actions",
  ".series-season-row",
  ".series-episode-track",
  ".movie-cast-track",
  ".series-cast-track",
  ".movie-ratings-row.focusable",
  ".series-ratings-panel",
  ".detail-morelike-track",
  ".detail-comments-track",
  ".detail-company-track"
].join(", ");

// Vertical movement follows sections; horizontal movement stays inside the
// current physical rail, including the two original rows in the ratings panel.
export function handleDetailSectionsDpad(screen, event, current) {
  if (!screen.container?.querySelector(".detail-insight-sections")) return false;
  const keyCode = Number(event?.keyCode || 0);
  if (![37, 38, 39, 40].includes(keyCode)) return false;
  const rows = Array.from(screen.container.querySelectorAll(ROW_SELECTOR))
    .map((root) => ({
      root,
      items: root.matches(".focusable") ? [root] : Array.from(root.querySelectorAll(".focusable"))
    }))
    .filter((row) => row.items.length);
  const rowIndex = rows.findIndex((row) => row.items.includes(current));
  if (rowIndex < 0) return false;
  event.preventDefault?.();

  const row = rows[rowIndex];
  const currentIndex = row.items.indexOf(current);
  const rowKey = row.root.dataset.scrollKey || row.root.dataset.focusKey;
  if (rowKey) {
    screen.railFocusIndexByKey ||= {};
    screen.railFocusIndexByKey[rowKey] = currentIndex;
  }
  if (keyCode === 37 || keyCode === 39) {
    const step = keyCode === 37 ? -1 : 1;
    if (row.root.matches(".series-episode-track")) {
      const absoluteIndex = Number(current.dataset.episodeIndex ?? currentIndex);
      screen.focusEpisodeByIndex(absoluteIndex + step, { preserveVerticalScroll: true });
    } else {
      const ratingRail = current.closest(".series-rating-seasons, .series-episode-ratings-grid");
      const items = ratingRail ? Array.from(ratingRail.querySelectorAll(".focusable")) : row.items;
      screen.focusInList(items, items.indexOf(current) + step, { preserveVerticalScroll: true });
    }
    return true;
  }

  const nextRow = rows[rowIndex + (keyCode === 38 ? -1 : 1)];
  if (!nextRow) return true;
  if (nextRow.root.matches(".series-episode-track")) {
    screen.focusEpisodeByIndex(screen.getRememberedEpisodeIndex(nextRow.items), {
      preserveVerticalScroll: false
    });
    return true;
  }
  const nextKey = nextRow.root.dataset.scrollKey || nextRow.root.dataset.focusKey;
  let nextIndex = screen.getRememberedRailIndex(nextKey, nextRow.items);
  if (nextRow.root.matches(".series-season-row")) {
    nextIndex = screen.getSelectedSeasonIndex(nextRow.items);
  } else if (
    nextRow.root.matches(".series-ratings-panel") &&
    !Object.prototype.hasOwnProperty.call(screen.railFocusIndexByKey || {}, nextKey)
  ) {
    nextIndex = Math.max(
      0,
      nextRow.items.findIndex(
        (item) => Number(item.dataset.season) === Number(screen.selectedRatingSeason)
      )
    );
  }
  screen.focusInList(nextRow.items, nextIndex);
  return true;
}
