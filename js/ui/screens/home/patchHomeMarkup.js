// Keep the last generated attributes separately from the live DOM: image
// hydration, focus, scrolling and hero animation modify the live nodes.
let sources = new WeakMap();
const roots = new WeakSet();

function attributes(node) {
  const values = new Map();
  for (const attribute of Array.from(node.attributes || []))
    values.set(attribute.name, attribute.value);
  return values;
}

function key(node) {
  if (node.nodeType !== 1) return `node:${node.nodeType}`;
  const get = (name) => node.getAttribute(name) || "";
  if (get("data-item-id")) {
    return JSON.stringify([
      node.nodeName,
      get("data-action"),
      get("data-item-type"),
      get("data-item-id"),
      get("data-video-id"),
      get("data-season"),
      get("data-episode")
    ]);
  }
  for (const name of ["id", "data-row-key", "data-track-row-key", "data-action"]) {
    if (get(name)) return `${node.nodeName}:${name}:${get(name)}`;
  }
  return `${node.nodeName}:${get("class").split(/\s+/)[0] || ""}`;
}

function source(node) {
  const keyedBlock =
    node.nodeType === 1 && (node.hasAttribute("data-item-id") || node.hasAttribute("data-row-key"));
  return { attributes: attributes(node), markup: keyedBlock ? node.outerHTML : null };
}

function rememberTree(node) {
  if (node.nodeType === 1) sources.set(node, source(node));
  for (const child of Array.from(node.childNodes)) rememberTree(child);
}

function patchStyle(live, previous, next) {
  const oldStyle = live.ownerDocument.createElement("div").style;
  oldStyle.cssText = previous || "";
  const newStyle = next.style;
  for (let index = 0; index < oldStyle.length; index++) {
    const property = oldStyle[index];
    if (!newStyle.getPropertyValue(property)) live.style.removeProperty(property);
  }
  for (let index = 0; index < newStyle.length; index++) {
    const property = newStyle[index];
    const priority =
      typeof newStyle.getPropertyPriority === "function"
        ? newStyle.getPropertyPriority(property)
        : "";
    const oldPriority =
      typeof oldStyle.getPropertyPriority === "function"
        ? oldStyle.getPropertyPriority(property)
        : "";
    if (
      oldStyle.getPropertyValue(property) !== newStyle.getPropertyValue(property) ||
      oldPriority !== priority
    ) {
      live.style.setProperty(property, newStyle.getPropertyValue(property), priority);
    }
  }
}

function patchAttributes(live, previous, next) {
  const incoming = attributes(next);
  for (const [name, value] of previous) {
    if (incoming.has(name)) continue;
    if (name === "class")
      value
        .split(/\s+/)
        .filter(Boolean)
        .forEach((token) => live.classList.remove(token));
    else if (name === "style") patchStyle(live, value, next);
    else live.removeAttribute(name);
  }
  for (const [name, value] of incoming) {
    if (previous.get(name) === value) continue;
    if (name === "class") {
      const oldClasses = new Set((previous.get(name) || "").split(/\s+/).filter(Boolean));
      const newClasses = new Set(value.split(/\s+/).filter(Boolean));
      oldClasses.forEach((token) => {
        if (!newClasses.has(token)) live.classList.remove(token);
      });
      newClasses.forEach((token) => {
        if (!oldClasses.has(token)) live.classList.add(token);
      });
    } else if (name === "style") patchStyle(live, previous.get(name), next);
    else live.setAttribute(name, value);
  }
  // A deferred poster changed: discard its old hydrated image so the existing
  // viewport loader can load the new source. Unchanged posters stay hydrated.
  if (
    live.nodeName === "IMG" &&
    incoming.has("data-src") &&
    previous.get("data-src") !== incoming.get("data-src")
  ) {
    live.removeAttribute("src");
  }
}

function patchNode(live, next, stats) {
  if (live.nodeType !== 1) {
    if (live.nodeValue !== next.nodeValue) {
      live.nodeValue = next.nodeValue;
      stats.changed++;
    }
    return;
  }
  const previous = sources.get(live);
  const incoming = source(next);
  stats.reused++;
  if (previous?.markup != null && previous.markup === incoming.markup) return;
  patchAttributes(live, previous?.attributes || attributes(live), next);
  patchChildren(live, next, stats);
  sources.set(live, incoming);
  stats.changed++;
}

function patchChildren(live, next, stats) {
  const available = new Map();
  const unused = new Set(Array.from(live.childNodes));
  for (const child of unused) {
    const childKey = key(child);
    if (!available.has(childKey)) available.set(childKey, []);
    available.get(childKey).push(child);
  }
  let cursor = live.firstChild;
  for (const nextChild of Array.from(next.childNodes)) {
    let child = available.get(key(nextChild))?.shift();
    if (child) {
      unused.delete(child);
      patchNode(child, nextChild, stats);
    } else {
      child = nextChild.cloneNode(true);
      rememberTree(child);
      stats.created++;
    }
    if (child !== cursor) live.insertBefore(child, cursor);
    cursor = child.nextSibling;
  }
  for (const child of unused) {
    live.removeChild(child);
    stats.removed++;
  }
}

export function patchHomeMarkup(container, markup, { reset = false } = {}) {
  const template = container.ownerDocument.createElement("template");
  template.innerHTML = markup;
  const next = template.content || template;
  const stats = { reused: 0, created: 0, removed: 0, changed: 0 };
  if (reset || !roots.has(container)) {
    while (container.firstChild) container.removeChild(container.firstChild);
    for (const child of Array.from(next.childNodes)) {
      rememberTree(child);
      container.appendChild(child);
      stats.created++;
    }
    roots.add(container);
  } else {
    patchChildren(container, next, stats);
  }
  return stats;
}

export function forgetHomeMarkup(container) {
  if (container) roots.delete(container);
  // Release source strings when Home is discarded. Retained DOM is reconciled
  // only while its corresponding source records remain available.
  sources = new WeakMap();
}
