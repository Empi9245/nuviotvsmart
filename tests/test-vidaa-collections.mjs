import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.HTMLImageElement = class {};
const { Platform } = await import("../js/platform/index.js");
const { normalizeCollectionFolderItem } =
  await import("../js/ui/screens/home/homeScreenHelpers-05-normalize-collection-folder-item.js");
const { createHomeScreenMethods11 } =
  await import("../js/ui/screens/home/homeScreenMethods-11-enrich-current-hero-async.js");
const { createHomeScreenMethods12 } =
  await import("../js/ui/screens/home/homeScreenMethods-12-sync-collection-hero-media.js");
const seed = {
  collectionId: "collection",
  folderId: "folder",
  name: "Collection",
  coverImageUrl: "https://example.test/cover.jpg",
  focusGifUrl: "https://example.test/focus.gif",
  heroVideoUrl: "https://example.test/video.mp4"
};
for (const platform of ["vidaa", "tizen", "webos", "browser"]) {
  globalThis.__NUVIO_PLATFORM__ = platform;
  Platform.current = null;
  const hero = normalizeCollectionFolderItem(seed);
  assert.equal(hero.poster, seed.coverImageUrl);
  assert.equal(hero.heroVideoUrl, platform === "vidaa" ? "" : seed.heroVideoUrl);
  assert.equal(hero.focusGifUrl, platform === "vidaa" ? "" : seed.focusGifUrl);
  assert.equal(hero.focusGifEnabled, platform !== "vidaa");
  const configuredGif = normalizeCollectionFolderItem({ ...seed, focusGifEnabled: false });
  assert.equal(
    configuredGif.poster,
    platform === "vidaa" ? seed.coverImageUrl : seed.focusGifUrl,
    "VIDAA must not turn the GIF into an always-on poster"
  );
  const animatedHero = normalizeCollectionFolderItem({
    ...seed,
    heroBackdropUrl: "https://example.test/fullscreen.gif"
  });
  assert.equal(
    animatedHero.background,
    platform === "vidaa" ? seed.coverImageUrl : "https://example.test/fullscreen.gif",
    "VIDAA falls back to static artwork for animated full-screen backgrounds"
  );

  const image = new HTMLImageElement();
  image.dataset = { src: seed.focusGifUrl };
  const attrs = new Map([["src", seed.focusGifUrl]]);
  image.getAttribute = (name) => attrs.get(name) || null;
  image.setAttribute = (name, value) => attrs.set(name, value);
  image.removeAttribute = (name) => attrs.delete(name);
  const classes = new Set(["is-focus-gif-active"]);
  const card = {
    querySelector: () => image,
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) }
  };
  const methods = createHomeScreenMethods11();
  methods.hydrateCollectionFocusGif(card, true);
  assert.equal(attrs.has("src"), platform !== "vidaa");
  assert.equal(classes.has("is-focus-gif-active"), platform !== "vidaa");
  const preserveOwner = { isCollectionFolderNode: () => true, getNodeHeroSource: () => seed };
  assert.equal(
    methods.shouldPreserveCollectionHeroMedia.call(preserveOwner, card),
    platform !== "vidaa"
  );

  let mounts = 0;
  let clears = 0;
  let active = false;
  const layer = { querySelector: () => null, classList: { contains: () => false } };
  const media = {};
  const owner = {
    container: {
      querySelector: (selector) => (selector === ".home-hero-trailer-layer" ? layer : media)
    },
    collectionHeroMediaKey: "previous-video",
    clearTrailerLayer: () => {
      clears += 1;
    },
    setHeroTrailerActive: (enabled) => {
      active = enabled;
    },
    mountTrailerLayer: (_layer, source, ready) => {
      mounts += 1;
      assert.equal(source.url, seed.heroVideoUrl);
      ready();
    }
  };
  createHomeScreenMethods12().syncCollectionHeroMedia.call(owner, seed);
  assert.equal(mounts, platform === "vidaa" ? 0 : 1);
  assert.equal(clears, platform === "vidaa" ? 1 : 0);
  assert.equal(active, platform !== "vidaa");
}
console.log(
  "VIDAA collection checks passed: static artwork, no hover video/GIF, stale playback stopped, other platforms preserved."
);
