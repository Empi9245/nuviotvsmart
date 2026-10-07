import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
globalThis.HTMLElement = class {};
const { Platform } = await import("../js/platform/index.js");
const { createHomeScreenMethods12 } = await import("../js/ui/screens/home/homeScreenMethods-12-sync-collection-hero-media.js");
const { createHomeScreenMethods13 } = await import("../js/ui/screens/home/homeScreenMethods-13-mount-trailer-layer.js");
const { createHomeScreenMethods15 } = await import("../js/ui/screens/home/homeScreenMethods-15-schedule-focused-poster-flow.js");
const { createHomeScreenMethods04 } = await import("../js/ui/screens/home/homeScreenMethods-04-get-hero-focus-delay.js");

let frames = [];
globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
const classes = (...initial) => {
  const set = new Set(initial);
  return { contains: (value) => set.has(value), remove: (...values) => values.forEach(value => set.delete(value)) };
};
function platform(name) {
  globalThis.__NUVIO_PLATFORM__ = name;
  Platform.current = null;
  frames = [];
}

for (const name of ["vidaa", "webos", "tizen", "browser"]) {
  platform(name);
  let scans = 0, layoutReads = 0, transitionWrites = 0;
  const style = () => ({ transition: "transform 120ms", setProperty() { transitionWrites++; } });
  const frame = Object.assign(new HTMLElement(), {style: style(), isConnected:true});
  const layer = { classList: classes(), firstElementChild: null };
  const card = Object.assign(new HTMLElement(), {
    style: style(), isConnected:true, classList:classes("is-expanded"),
    querySelector: (selector) => selector === ".home-poster-frame" ? frame : layer
  });
  Object.defineProperty(card,"offsetWidth", {get() { layoutReads++; return 600; }});
  const screen = {
    ...createHomeScreenMethods12(), ...createHomeScreenMethods13(),
    container: { querySelector: () => layer, querySelectorAll() { scans++; return []; } },
    expandedPosterNode:card,
    isPerformanceConstrained:()=>true,
    shouldUseImmediateFocusScroll:()=>true,
    setHeroTrailerActive() {}
  };
  // No preview was mounted: repeated keys must not create work for empty layers.
  for(let n=0;n<100;n++) screen.refreshPendingHomeTrailerCleanup();
  if(name === "vidaa") assert.equal(scans,0,"Empty preview cleanup must not scan all cards per key");
  else assert.equal(scans,100,"Preserve the existing non-VIDAA cleanup path");

  // Use a stub for other platforms so this test does not create their timers.
  if(name !== "vidaa") screen.scheduleTrailerLayerCleanup = () => {};
  screen.collapseFocusedPoster(card);
  assert.equal(card.classList.contains("is-expanded"),false);
  assert.equal(screen.expandedPosterNode,null);
  if(name === "vidaa") {
    assert.equal(layoutReads,0,"VIDAA collapse must not force synchronous layout");
    assert.equal(transitionWrites,0,"VIDAA collapse relies on the existing CSS size-transition override");
    assert.equal(frames.length,0,"Empty previews and transition overrides must not queue callbacks");
    assert.equal(screen.homeTrailerLayerCleanupTimers,undefined,"Don't schedule cleanup for empty previews");
  } else {
    assert.equal(layoutReads,1,`${name}: preserve forced reflow for animated expansion`);
    assert.equal(transitionWrites,2);
    assert.equal(frames.length,1);
    frames.shift()();
    assert.equal(card.style.transition,"transform 120ms");
  }
}

platform("vidaa");
{
  const screen = {
    ...createHomeScreenMethods12(),
    shouldUseImmediateFocusScroll:()=>true,
    container:{querySelectorAll(){throw Error("Unexpected global scan");}},
    homeActiveTrailerLayers:new Set([{},{}]),
    scheduleTrailerLayerCleanup:()=>{screen.count++;}, count:0
  };
  screen.refreshPendingHomeTrailerCleanup();
  assert.equal(screen.count,2,"Actual mounted previews still receive cleanup");
  const emptyLayer={classList:classes(),firstElementChild:null};
  screen.homeActiveTrailerLayers.add(emptyLayer);
  screen.clearTrailerLayer(emptyLayer);
  assert.equal(screen.homeActiveTrailerLayers.has(emptyLayer),false,"Cleared preview references must be released");
}
{
  const empty={classList:classes(),firstElementChild:null};
  const screen={...createHomeScreenMethods12(),...createHomeScreenMethods13(),
    container:{querySelector:()=>empty,querySelectorAll(){throw Error("Empty expansion must not scan all cards");}},
    isPerformanceConstrained:()=>true,shouldUseImmediateFocusScroll:()=>true,setHeroTrailerActive(){}};
  for(let n=0;n<100;n++) screen.collapseFocusedPoster();
  assert.equal(screen.homeTrailerLayerCleanupTimers,undefined);
}
{
  const expanded={classList:classes("is-expanded")};
  const screen={...createHomeScreenMethods15(),layoutMode:"modern",expandedPosterNode:expanded,
    container:{querySelector(){throw Error("Horizontal collapse must not read computed dimensions");}}};
  assert.deepEqual(screen.getExpandedPosterScrollAdjustments(expanded,{},"right"),{horizontal:0,vertical:0});
}
// All VIDAA layouts defer background renders throughout held navigation, even
// between animations. They resume when input and scrolling have settled.
for(const layoutMode of ["modern","classic","grid"]) {
  const screen={...createHomeScreenMethods04(),layoutMode,hasUserInteractedSinceHomePaint:true,isVidaaHomeLoadingBusy:()=>true};
  assert.equal(screen.shouldDeferHomeRenderForInput(),true);
  screen.isVidaaHomeLoadingBusy=()=>false;
  assert.equal(screen.shouldDeferHomeRenderForInput(),false);
}
console.log("VIDAA focus checks passed: bounded preview cleanup, no forced collapse reflow, retained other-platform transitions and held-input render deferral.");
