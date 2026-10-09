function escapeAttribute(value) {
  return String(value).replace(
    /[&"<>]/g,
    (char) =>
      ({
        "&": "&amp;",
        '"': "&quot;",
        "<": "&lt;",
        ">": "&gt;"
      })[char]
  );
}

// The cache belongs to one Home screen and is replaced after each successful
// render. Exact serialized inputs also detect mutations inside existing rows.
export function createHomeRowRenderPass(previousRows = new Map(), context = null) {
  const rows = new Map();
  const rowSources = new Map();
  const markers = new Map();
  let contextSignature;
  try {
    contextSignature = JSON.stringify(context);
  } catch {
    contextSignature = null;
  }

  function wrapRow(rowKey, markup) {
    if (!markup) return "";
    const id = String(markers.size);
    const marker = `<section data-row-key="${escapeAttribute(rowKey)}" data-home-row-source="${id}"></section>`;
    rowSources.set(id, { rowKey: String(rowKey), markup });
    markers.set(marker, markup);
    return marker;
  }

  function renderRow(rowKey, dependencies, factory) {
    let signature = null;
    if (contextSignature !== null) {
      try {
        signature = JSON.stringify([contextSignature, dependencies]);
      } catch {
        /* Render normally. */
      }
    }
    const previous = previousRows?.get(rowKey);
    const markup =
      signature !== null && previous?.signature === signature ? previous.markup : factory();
    rows.set(rowKey, { signature, markup });
    return wrapRow(rowKey, markup);
  }

  return {
    rows,
    rowSources,
    renderRow,
    wrapRow,
    // Canonical markup remains the equality baseline; placeholder IDs can be
    // reused by a later pass and must never be compared as content signatures.
    expand(markup) {
      return markup.replace(
        /<section data-row-key="[^"]*" data-home-row-source="\d+"><\/section>/g,
        (marker) => markers.get(marker) ?? marker
      );
    }
  };
}
