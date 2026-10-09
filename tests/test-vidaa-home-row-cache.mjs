import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";

const { createHomeRowRenderPass } = await import("../js/ui/screens/home/homeRowRenderCache.js");
const { renderModernHomeLayout } = await import("../js/ui/screens/home/modernHomeLayout.js");
const { renderLegacyCatalogRowsMarkup } =
  await import("../js/ui/screens/home/homeScreenHelpers-13-continue-watching-stream-params.js");
const { createPosterCardMarkup } =
  await import("../js/ui/screens/home/homeScreenHelpers-15-create-poster-card-markup.js");
const { shouldDeferHomeRowImages } =
  await import("../js/ui/screens/home/homeScreenHelpers-14-get-home-grid-column-count.js");
const { escapeHtml, escapeAttribute, formatCatalogRowTitle } =
  await import("../js/ui/screens/home/homeUtils.js");

function catalogRow(key, count = 4) {
  return {
    homeCatalogKey: key,
    addonId: "test-addon",
    addonBaseUrl: "https://example.com",
    addonName: "Test addon",
    catalogId: key,
    catalogName: `Catalog ${key}`,
    type: "movie",
    result: {
      status: "ready",
      data: {
        items: Array.from({ length: count }, (_, index) => ({
          id: `${key}-${index}`,
          name: `Title ${key}-${index}`,
          type: "movie",
          poster: `https://example.com/${key}/${index}.jpg`,
          background: `https://example.com/${key}/${index}-wide.jpg`,
          imdbRating: 7.5
        })),
        nextSkip: count,
        hasMore: count > 15
      }
    }
  };
}

function render(
  layoutMode,
  rows,
  {
    previousRows = new Map(),
    context = { locale: "en", preferences: { homeImdbRatingsVisibility: "SHOW_ALL" } },
    options = {}
  } = {}
) {
  const pass = createHomeRowRenderPass(previousRows, context);
  const generatedRows = [];
  let posterCalls = 0;
  const sharedOptions = { layoutMode, rowItemLimit: 15, gridMaxDisplayItems: 12, ...options };
  const modernOptions = {
    rows,
    renderContinueWatchingSection: () => "",
    createPosterCardMarkup,
    formatCatalogRowTitle,
    shouldDeferRowImages: shouldDeferHomeRowImages,
    escapeHtml,
    escapeAttribute,
    ...sharedOptions
  };
  const renderCatalogRow = (rowKey, dependencies, factory) =>
    pass.renderRow(rowKey, dependencies, () => {
      generatedRows.push(rowKey);
      return factory();
    });
  const result =
    layoutMode === "modern"
      ? renderModernHomeLayout({
          ...modernOptions,
          createPosterCardMarkup(...args) {
            posterCalls++;
            return createPosterCardMarkup(...args);
          },
          renderCatalogRow
        })
      : renderLegacyCatalogRowsMarkup(rows, { ...sharedOptions, renderCatalogRow });
  const vanilla =
    layoutMode === "modern"
      ? renderModernHomeLayout(modernOptions)
      : renderLegacyCatalogRowsMarkup(rows, sharedOptions);
  const canonicalMarkup = pass.expand(result.markup);
  assert.equal(
    canonicalMarkup,
    vanilla.markup,
    `${layoutMode}: expanded cache output must match vanilla markup`
  );
  assert.deepEqual(result.catalogSeeAllMap, vanilla.catalogSeeAllMap);
  return { pass, generatedRows, posterCalls, canonicalMarkup, result };
}

for (const layoutMode of ["modern", "classic", "grid"]) {
  const rows = [catalogRow("a", 20), catalogRow("b"), catalogRow("c")];
  const watchedTitleIds = new Set();
  const options = { watchedTitleIds };
  const first = render(layoutMode, rows, { options });
  assert.deepEqual(first.generatedRows, ["a", "b", "c"]);
  assert.equal(first.pass.rowSources.size, 3);
  assert.match(first.result.markup, /data-home-row-source="0"/);
  assert.doesNotMatch(first.canonicalMarkup, /data-home-row-source=/);

  const hit = render(layoutMode, rows, { previousRows: first.pass.rows, options });
  assert.deepEqual(
    hit.generatedRows,
    [],
    `${layoutMode}: cache hits must skip entire row factories`
  );
  assert.equal(hit.posterCalls, 0, "Modern cache hits must not create poster markup");
  assert.equal(hit.canonicalMarkup, first.canonicalMarkup);
  assert.notEqual(hit.result.catalogSeeAllMap, first.result.catalogSeeAllMap);
  assert.notEqual(
    hit.pass.rows,
    first.pass.rows,
    "A render pass must not mutate the previous cache"
  );

  // The addon and metadata repositories can update existing objects in place.
  rows[0].result.data.items[0].name = "Changed title";
  rows[0].addonName = "Changed addon";
  const changed = render(layoutMode, rows, { previousRows: hit.pass.rows, options });
  assert.deepEqual(changed.generatedRows, ["a"]);
  assert.match(changed.canonicalMarkup, /Changed title/);
  assert.match(changed.canonicalMarkup, /Changed addon/);
  assert.notEqual(changed.canonicalMarkup, hit.canonicalMarkup);

  // Pagination belongs to the current result even when its card markup is equal.
  rows[0].result.data.nextSkip = 200;
  const pagination = render(layoutMode, rows, { previousRows: changed.pass.rows, options });
  assert.deepEqual(pagination.generatedRows, ["a"]);
  assert.equal(pagination.result.catalogSeeAllMap.get("test-addon_a_movie").initialNextSkip, 200);
  const paginationHit = render(layoutMode, rows, { previousRows: pagination.pass.rows, options });
  assert.deepEqual(paginationHit.generatedRows, []);
  assert.equal(
    paginationHit.result.catalogSeeAllMap.get("test-addon_a_movie").initialItems,
    rows[0].result.data.items
  );
  assert.equal(
    paginationHit.result.catalogSeeAllMap.get("test-addon_a_movie").initialNextSkip,
    200
  );

  // A Set cannot be serialized directly: changing it must still update badges.
  assert.doesNotMatch(paginationHit.canonicalMarkup, /class="title-watched-badge"/);
  watchedTitleIds.add("a-0");
  const watched = render(layoutMode, rows, { previousRows: paginationHit.pass.rows, options });
  assert.deepEqual(watched.generatedRows, ["a", "b", "c"]);
  assert.match(watched.canonicalMarkup, /class="title-watched-badge"/);

  const context = { locale: "en", preferences: { homeImdbRatingsVisibility: "SHOW_ALL" } };
  const contextHit = render(layoutMode, rows, {
    previousRows: watched.pass.rows,
    context,
    options
  });
  assert.deepEqual(contextHit.generatedRows, []);
  context.locale = "it";
  const localeChanged = render(layoutMode, rows, {
    previousRows: contextHit.pass.rows,
    context,
    options
  });
  assert.deepEqual(
    localeChanged.generatedRows,
    ["a", "b", "c"],
    "Locale context must invalidate translated markup"
  );
  context.preferences.homeImdbRatingsVisibility = "HIDE_ALL";
  const preferenceChanged = render(layoutMode, rows, {
    previousRows: localeChanged.pass.rows,
    context,
    options
  });
  assert.deepEqual(
    preferenceChanged.generatedRows,
    ["a", "b", "c"],
    "In-place preference changes must invalidate"
  );

  const reordered = render(layoutMode, [rows[1], rows[0], rows[2]], {
    previousRows: preferenceChanged.pass.rows,
    context,
    options
  });
  assert.deepEqual(
    reordered.generatedRows,
    ["b", "a"],
    "Reordering must refresh card navigation row indices"
  );
  assert.match(reordered.pass.rows.get("a").markup, /data-nav-row="1"/);
  assert.match(reordered.pass.rows.get("b").markup, /data-nav-row="0"/);

  const expandedOptions = {
    ...options,
    focusedRowKey: "a",
    focusedItemIndex: 1,
    expandFocusedPoster: true
  };
  const expanded = render(layoutMode, rows, {
    previousRows: watched.pass.rows,
    options: expandedOptions
  });
  assert.deepEqual(expanded.generatedRows, ["a"], "Expansion must invalidate only the focused row");
  assert.match(expanded.pass.rows.get("a").markup, /home-poster-card focusable is-expanded/);
  assert.doesNotMatch(expanded.pass.rows.get("b").markup, /is-expanded/);
  const limits = render(layoutMode, rows, {
    previousRows: expanded.pass.rows,
    options: {
      ...options,
      rowItemLimit: 3,
      gridMaxDisplayItems: 4,
      showPosterLabels: false,
      showCatalogTypeSuffix: false
    }
  });
  assert.deepEqual(limits.generatedRows, ["a", "b", "c"]);
  assert.doesNotMatch(limits.pass.rows.get("a").markup, /class="home-poster-copy"/);

  if (layoutMode === "modern") {
    const deeperFocus = render(layoutMode, rows, {
      previousRows: watched.pass.rows,
      options: { ...options, focusedRowKey: "a", focusedItemIndex: 18 }
    });
    assert.deepEqual(deeperFocus.generatedRows, ["a"]);
    assert.match(
      deeperFocus.pass.rows.get("a").markup,
      /data-item-id="a-18"/,
      "The focused card beyond the initial limit must remain in the row"
    );
    assert.doesNotMatch(watched.pass.rows.get("a").markup, /data-item-id="a-18"/);
  }

  const removed = render(layoutMode, rows.slice(0, 2), {
    previousRows: watched.pass.rows,
    options
  });
  assert.deepEqual(removed.generatedRows, []);
  assert.equal(removed.pass.rows.size, 2, "Removed rows must not remain in the next cache");
  assert.equal(removed.pass.rows.has("c"), false);
  assert.equal(watched.pass.rows.size, 3, "Preparing a next pass must preserve the previous cache");

  rows[0].nonRenderingCircularField = rows[0];
  const circular = render(layoutMode, rows, { previousRows: watched.pass.rows, options });
  assert.deepEqual(
    circular.generatedRows,
    ["a"],
    "Unserializable row inputs must fall back to full rendering"
  );
  const circularAgain = render(layoutMode, rows, { previousRows: circular.pass.rows, options });
  assert.deepEqual(
    circularAgain.generatedRows,
    ["a"],
    "Unserializable inputs must never reuse a null signature"
  );
  delete rows[0].nonRenderingCircularField;

  const circularContext = { locale: "en" };
  circularContext.self = circularContext;
  const uncachedContext = render(layoutMode, rows, {
    previousRows: watched.pass.rows,
    context: circularContext,
    options
  });
  assert.deepEqual(uncachedContext.generatedRows, ["a", "b", "c"]);

  // A normal render also covers loading, collection and empty row filtering.
  const loading = {
    homeCatalogKey: "loading",
    type: "series",
    result: { status: "loading" },
    loadingItems: [{ id: "loading-0", isLoading: true }]
  };
  const collection = {
    ...catalogRow("collection", 2),
    rowKind: "collection",
    collectionTitle: "Collection"
  };
  const mixed = render(layoutMode, [...rows, loading, collection, catalogRow("empty", 0)], {
    options
  });
  assert.deepEqual(mixed.generatedRows, ["a", "b", "c", "loading", "collection"]);
  assert.equal(mixed.result.catalogSeeAllMap.size, 3);
}

// Row keys are escaped in placeholder attributes without changing source lookup.
{
  const key = 'key&"<>';
  const pass = createHomeRowRenderPass();
  const source = `<section data-row-key="${escapeAttribute(key)}"><span>Content</span></section>`;
  const markup = pass.renderRow(key, { title: "Content" }, () => source);
  assert.equal(pass.expand(markup), source);
  assert.equal(pass.rowSources.get("0").rowKey, key);
}

console.log(
  "VIDAA Home row cache checks passed: lazy factories, canonical output, mutable data, watched badges, context, focus, limits, reordering and safe fallback."
);
