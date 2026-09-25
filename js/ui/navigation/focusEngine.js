import { Router } from "./routerState.js";
import { Platform } from "../../platform/index.js";

function buildNormalizedEvent(event) {
  const normalizedKey = Platform.normalizeKey(event);
  const normalizedCode = Number(normalizedKey.keyCode || 0);

  return {
    key: normalizedKey.key,
    code: normalizedKey.code,
    keyName: normalizedKey.keyName,
    target: event?.target || null,
    altKey: Boolean(event?.altKey),
    ctrlKey: Boolean(event?.ctrlKey),
    shiftKey: Boolean(event?.shiftKey),
    metaKey: Boolean(event?.metaKey),
    repeat: Boolean(event?.repeat),
    defaultPrevented: Boolean(event?.defaultPrevented),
    isArrow: Boolean(normalizedKey.isArrow),
    isEnter: Boolean(normalizedKey.isEnter),
    isBack: Boolean(normalizedKey.isBack),
    keyCode: normalizedCode,
    which: normalizedCode,
    originalKeyCode: Number(normalizedKey.originalKeyCode || event?.keyCode || 0),
    keyDownDurationMs: 0,
    preventDefault: () => {
      if (typeof event?.preventDefault === "function") {
        event.preventDefault();
      }
    },
    stopPropagation: () => {
      if (typeof event?.stopPropagation === "function") {
        event.stopPropagation();
      }
    },
    stopImmediatePropagation: () => {
      if (typeof event?.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    }
  };
}

function hasActiveModal() {
  return Boolean(globalThis?.document?.body?.classList?.contains("nuvio-modal-open"));
}

const BACK_DEBOUNCE_MS = 250;
const VIDAA_SELECT_KEY_CODE = 13;

export const FocusEngine = {
  lastBackHandledAt: 0,
  lastPointerFocusTarget: null,
  pointerMoveFrame: null,
  pendingPointerMoveEvent: null,
  activeKeyDownStartedAt: new Map(),
  activeBackKeyIdentities: new Set(),

  init() {
    this.boundHandleKey = this.handleKey.bind(this);
    this.boundHandleKeyUp = this.handleKeyUp.bind(this);
    this.boundHandlePointerMove = this.handlePointerMove.bind(this);
    this.boundHandlePointerClick = this.handlePointerClick.bind(this);
    document.addEventListener("keydown", this.boundHandleKey, true);
    document.addEventListener("keyup", this.boundHandleKeyUp, true);
    if (Platform.isWebOS() || Platform.isVidaa()) {
      document.addEventListener("mousemove", this.boundHandlePointerMove, true);
      document.addEventListener("pointermove", this.boundHandlePointerMove, true);
      document.addEventListener("click", this.boundHandlePointerClick, true);
      if (Platform.isWebOS()) {
        document.documentElement?.classList?.add("webos-pointer-remote");
        document.body?.classList?.add("webos-pointer-remote");
      } else {
        document.documentElement?.classList?.add("vidaa-pointer-remote");
        document.body?.classList?.add("vidaa-pointer-remote");
      }
    }
  },

  handleBack(event, normalizedEvent = buildNormalizedEvent(event)) {
    const now = Date.now();
    const elapsedSinceHandled = now - Number(this.lastBackHandledAt || 0);
    if (normalizedEvent.repeat || elapsedSinceHandled < BACK_DEBOUNCE_MS) {
      normalizedEvent.preventDefault();
      normalizedEvent.stopPropagation();
      normalizedEvent.stopImmediatePropagation();
      Router.consumeRouteReturnBackGuard?.();
      return;
    }
    this.lastBackHandledAt = now;

    normalizedEvent.preventDefault();
    normalizedEvent.stopPropagation();
    normalizedEvent.stopImmediatePropagation();

    if (Router.consumeRouteReturnBackGuard?.()) {
      return;
    }

    const currentScreen = Router.getCurrentScreen();
    const consumeResult = currentScreen?.consumeBackRequest?.();
    if (consumeResult) {
      if (consumeResult === "history") {
        return;
      }
      Router.suppressNextPopstate?.();
      return;
    }

    if (hasActiveModal()) {
      Router.suppressNextPopstate?.();
      return;
    }

    Router.back();
  },

  handleKey(event) {
    if (event?.target && !document.contains(event.target)) {
      return;
    }

    if (hasActiveModal()) {
      return;
    }

    const normalizedEvent = buildNormalizedEvent(event);
    const keyIdentity = this.getKeyIdentity(normalizedEvent);
    const isVidaaSelectKey =
      Platform.isVidaa() && normalizedEvent.keyCode === VIDAA_SELECT_KEY_CODE;
    if (keyIdentity) {
      if (isVidaaSelectKey) {
        if (this.activeKeyDownStartedAt.has(keyIdentity)) {
          normalizedEvent.repeat = true;
        } else {
          this.activeKeyDownStartedAt.set(keyIdentity, Date.now());
        }
      } else if (!normalizedEvent.repeat || !this.activeKeyDownStartedAt.has(keyIdentity)) {
        this.activeKeyDownStartedAt.set(keyIdentity, Date.now());
      }
    }

    if (
      Platform.isBackEvent({
        target: normalizedEvent.target,
        key: normalizedEvent.key,
        code: normalizedEvent.code,
        keyName: normalizedEvent.keyName,
        keyCode: normalizedEvent.keyCode,
        originalKeyCode: normalizedEvent.originalKeyCode
      })
    ) {
      // Samsung TV delivers the mandatory Back key through keydown/keyup. A
      // held remote key can emit another keydown after the 250 ms timing
      // debounce, while the first Player -> Sources transition is still
      // mounting. Treat one keydown/keyup cycle as one Android-style Back
      // action; a later press is released first and therefore remains valid.
      // Samsung exposes the mandatory TV Back key through a few equivalent
      // DOM representations (10009, 461, Back, XF86Back). They are one
      // Android-style action, not separate keys. Canonicalize them before the
      // key-cycle latch so an alias change cannot navigate a second route.
      const backKeyIdentity = "back";
      if (this.activeBackKeyIdentities.has(backKeyIdentity)) {
        normalizedEvent.preventDefault();
        normalizedEvent.stopPropagation();
        normalizedEvent.stopImmediatePropagation();
        Router.consumeRouteReturnBackGuard?.();
        return;
      }
      this.activeBackKeyIdentities.add(backKeyIdentity);
      this.handleBack(event, normalizedEvent);
      return;
    }

    const isArrowKey =
      normalizedEvent.isArrow || (normalizedEvent.keyCode >= 37 && normalizedEvent.keyCode <= 40);

    if (Platform.isVidaa() && (isArrowKey || normalizedEvent.keyCode === VIDAA_SELECT_KEY_CODE)) {
      normalizedEvent.preventDefault();
      normalizedEvent.stopPropagation();
      normalizedEvent.stopImmediatePropagation();
      this.lastPointerFocusTarget = null;
      if (normalizedEvent.keyCode === VIDAA_SELECT_KEY_CODE && normalizedEvent.repeat) {
        return;
      }
    }

    if (isArrowKey) {
      const targetTag = String(event?.target?.tagName || "").toUpperCase();
      const isEditable =
        Boolean(event?.target?.isContentEditable) ||
        targetTag === "INPUT" ||
        targetTag === "TEXTAREA" ||
        targetTag === "SELECT";
      if (!isEditable) {
        normalizedEvent.preventDefault();
      }
    }

    const currentScreen = Router.getCurrentScreen();

    if (currentScreen?.onKeyDown) {
      Promise.resolve(currentScreen.onKeyDown(normalizedEvent)).catch((error) => {
        console.warn("Screen keydown handler failed", error);
      });
    }
  },

  handleKeyUp(event) {
    const normalizedEvent = buildNormalizedEvent(event);
    const keyIdentity = this.getKeyIdentity(normalizedEvent);
    if (
      Platform.isBackEvent({
        target: normalizedEvent.target,
        key: normalizedEvent.key,
        code: normalizedEvent.code,
        keyName: normalizedEvent.keyName,
        keyCode: normalizedEvent.keyCode,
        originalKeyCode: normalizedEvent.originalKeyCode
      })
    ) {
      this.activeBackKeyIdentities.delete("back");
    }
    if (keyIdentity) {
      const startedAt = Number(this.activeKeyDownStartedAt.get(keyIdentity) || 0);
      normalizedEvent.keyDownDurationMs = startedAt > 0 ? Math.max(0, Date.now() - startedAt) : 0;
      this.activeKeyDownStartedAt.delete(keyIdentity);
    }

    const isArrowKey =
      normalizedEvent.isArrow || (normalizedEvent.keyCode >= 37 && normalizedEvent.keyCode <= 40);
    if (Platform.isVidaa() && (isArrowKey || normalizedEvent.keyCode === VIDAA_SELECT_KEY_CODE)) {
      normalizedEvent.preventDefault();
      normalizedEvent.stopPropagation();
      normalizedEvent.stopImmediatePropagation();
      this.lastPointerFocusTarget = null;
    }

    if (event?.target && !document.contains(event.target) && !Platform.isVidaa()) return;
    if (hasActiveModal()) {
      return;
    }

    const currentScreen = Router.getCurrentScreen();
    if (!currentScreen?.onKeyUp) {
      return;
    }
    Promise.resolve(currentScreen.onKeyUp(normalizedEvent)).catch((error) => {
      console.warn("Screen keyup handler failed", error);
    });
  },

  getKeyIdentity(event) {
    if (Platform.isBackEvent(event)) {
      return "back";
    }
    const keyCode = Number(event?.keyCode || event?.which || 0);
    if (keyCode) {
      return `code:${keyCode}`;
    }
    const key = String(event?.key || event?.code || event?.keyName || "").trim();
    return key ? `key:${key}` : "";
  },

  getPointerFocusable(event) {
    const target =
      event?.target?.closest?.(".focusable") ||
      event?.target?.closest?.(
        "button, [role='button'], a[href], input, textarea, select, [data-action], [data-action-id]"
      );
    if (!target || !(target instanceof HTMLElement) || !document.contains(target)) {
      return null;
    }
    if (
      target.disabled ||
      target.classList.contains("is-disabled") ||
      target.classList.contains("disabled") ||
      target.getAttribute("aria-disabled") === "true"
    ) {
      return null;
    }
    const rect = target.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    return target;
  },

  focusPointerTarget(target, event = null) {
    if (!target) {
      return false;
    }
    if (hasActiveModal() && !target.closest?.(".nuvio-dialog-backdrop")) {
      return false;
    }
    const currentScreen = Router.getCurrentScreen();
    const screenContainer =
      currentScreen?.container instanceof HTMLElement
        ? currentScreen.container
        : target.closest(".screen");
    if (screenContainer && !screenContainer.contains(target)) {
      return false;
    }

    const focusRoot = screenContainer || document;
    focusRoot.querySelectorAll?.(".focused")?.forEach((node) => {
      if (node !== target) {
        node.classList.remove("focused");
      }
    });
    target.classList.add("focused");
    try {
      target.focus({ preventScroll: true });
    } catch (_) {
      try {
        target.focus();
      } catch (_) {}
    }
    currentScreen?.onPointerFocus?.(target, event);
    this.lastPointerFocusTarget = target;
    return true;
  },

  handlePointerMove(event) {
    if (!Platform.isWebOS() && !Platform.isVidaa()) {
      return;
    }
    this.pendingPointerMoveEvent = event;
    if (this.pointerMoveFrame) {
      return;
    }
    const run = () => {
      this.pointerMoveFrame = null;
      const pendingEvent = this.pendingPointerMoveEvent;
      this.pendingPointerMoveEvent = null;
      this.processPointerMove(pendingEvent);
    };
    if (typeof requestAnimationFrame === "function") {
      this.pointerMoveFrame = requestAnimationFrame(run);
    } else {
      this.pointerMoveFrame = setTimeout(run, 16);
    }
  },

  processPointerMove(event) {
    if (!Platform.isWebOS() && !Platform.isVidaa()) {
      return;
    }
    if (Platform.isVidaa()) {
      document.documentElement?.classList?.add("vidaa-pointer-active");
      document.body?.classList?.add("vidaa-pointer-active");
    }
    const currentScreen = Router.getCurrentScreen();
    currentScreen?.onPointerMove?.(event);
    const target = this.getPointerFocusable(event);
    if (!target || target === this.lastPointerFocusTarget) {
      return;
    }
    if (hasActiveModal() && !target.closest?.(".nuvio-dialog-backdrop")) {
      return;
    }
    this.focusPointerTarget(target, event);
  },

  handlePointerClick(event) {
    if (!Platform.isWebOS() && !Platform.isVidaa()) {
      return;
    }
    const target = this.getPointerFocusable(event);
    const currentScreen = Router.getCurrentScreen();
    if (!target) {
      const handled = currentScreen?.onPointerSurfaceActivate?.(event?.target, event);
      if (handled && typeof handled.then === "function") {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
        handled.catch((error) => console.warn("Screen pointer surface handler failed", error));
      } else if (handled) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
      }
      return;
    }
    if (hasActiveModal() && !target.closest?.(".nuvio-dialog-backdrop")) {
      return;
    }
    this.focusPointerTarget(target, event);
    if (hasActiveModal()) {
      return;
    }
    if (typeof currentScreen?.onPointerActivate !== "function") {
      return;
    }
    const handled = currentScreen.onPointerActivate(target, event);
    if (handled && typeof handled.then === "function") {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      event?.stopImmediatePropagation?.();
      handled.catch((error) => console.warn("Screen pointer activation failed", error));
      return;
    }
    if (handled) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      event?.stopImmediatePropagation?.();
    }
  }
};
