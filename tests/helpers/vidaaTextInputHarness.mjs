import { installVidaaKeyboardFix } from "../../js/platform/vidaa/vidaaKeyboard.js";

export class TestEvent {
  constructor(type, options = {}) {
    Object.assign(this, { type, bubbles: true, defaultPrevented: false, calls: [] }, options);
  }
  preventDefault() {
    this.defaultPrevented = true;
    this.calls.push("prevent");
  }
  stopPropagation() {
    this.stopped = true;
    this.calls.push("stop");
  }
  stopImmediatePropagation() {
    this.immediateStopped = true;
    this.stopped = true;
    this.calls.push("stopImmediate");
  }
}

function surface() {
  const listeners = new Map();
  return {
    addEventListener(name, handler, options = false) {
      const list = listeners.get(name) || [];
      list.push({ handler, capture: options === true || options?.capture === true });
      listeners.set(name, list);
    },
    removeEventListener(name, handler) {
      listeners.set(
        name,
        (listeners.get(name) || []).filter((entry) => entry.handler !== handler)
      );
    },
    invoke(event, capture) {
      for (const entry of listeners.get(event.type) || []) {
        if (entry.capture === capture && !event.immediateStopped) entry.handler(event);
      }
    }
  };
}

export function createTextInputHarness() {
  const nodes = [];
  const timers = new Map();
  let nextTimer = 0;
  const documentRef = {
    ...surface(),
    hidden: false,
    activeElement: null,
    contains: (node) => node?.isConnected !== false,
    querySelector: (selector) => nodes.find((node) => node.matches(selector)) || null
  };
  const root = {
    ...surface(),
    document: documentRef,
    Event: TestEvent,
    setInterval(callback) {
      const id = ++nextTimer;
      timers.set(id, callback);
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    }
  };
  function dispatch(event, target) {
    event.target = target;
    root.invoke(event, true);
    documentRef.invoke(event, true);
    if (!event.stopped) target?.invoke?.(event, true);
    if (!event.stopped) target?.invoke?.(event, false);
    if (!event.stopped) documentRef.invoke(event, false);
    if (!event.stopped) root.invoke(event, false);
    return event;
  }
  function node(tagName = "INPUT", options = {}) {
    const classes = new Set(options.classes || ["focusable"]);
    const result = {
      ...surface(),
      tagName,
      type: "text",
      value: "",
      textContent: "",
      isConnected: true,
      dataset: {},
      ...options,
      classList: {
        add: (value) => classes.add(value),
        remove: (value) => classes.delete(value),
        contains: (value) => classes.has(value),
        toggle(value, enabled = !classes.has(value)) {
          if (enabled) classes.add(value);
          else classes.delete(value);
        }
      },
      matches(selector) {
        return selector.split(",").some((part) => {
          let s = part.trim();
          if (s.includes(":not") && result.disabled) return false;
          s = s.replace(/:not\([^)]*\)/g, "");
          const tag = s.match(/^[a-z]+/i)?.[0];
          if (tag && tag.toUpperCase() !== tagName) return false;
          const id = s.match(/#([\w-]+)/)?.[1];
          if (id && result.id !== id) return false;
          const classNames = [...s.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
          if (classNames.some((name) => !classes.has(name))) return false;
          for (const [, attr, , value] of s.matchAll(/\[([\w-]+)(?:=(['"])(.*?)\2)?\]/g)) {
            const key = attr
              .replace(/^data-/, "")
              .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            const actual = attr.startsWith("data-") ? result.dataset[key] : result[attr];
            if (value === undefined ? actual === undefined : String(actual) !== value) return false;
          }
          return true;
        });
      },
      closest(selector) {
        return this.matches(selector) ? this : null;
      },
      getBoundingClientRect() {
        const index = Number(this.dataset.index || 0);
        return {
          top: index * 100,
          bottom: index * 100 + 50,
          left: index * 200,
          width: 100,
          height: 50
        };
      },
      focus() {
        if (documentRef.activeElement === this) return;
        documentRef.activeElement?.blur?.();
        documentRef.activeElement = this;
        dispatch(new TestEvent("focus"), this);
        dispatch(new TestEvent("focusin"), this);
      },
      blur() {
        if (documentRef.activeElement !== this) return;
        documentRef.activeElement = documentRef.body;
        dispatch(new TestEvent("focusout"), this);
      },
      dispatchEvent(event) {
        dispatch(event, this);
      },
      click() {
        dispatch(new TestEvent("click"), this);
      }
    };
    nodes.push(result);
    return result;
  }
  documentRef.body = node("BODY", { classes: [] });
  documentRef.documentElement = node("HTML", { classes: [] });
  documentRef.activeElement = documentRef.body;
  const container = {
    ...surface(),
    style: {},
    contains: (target) => nodes.includes(target) && !["BODY", "HTML"].includes(target.tagName),
    querySelector: (selector) => documentRef.querySelector(selector),
    querySelectorAll: (selector) => nodes.filter((target) => target.matches(selector))
  };
  // Include bubbling through the screen container for actual delegated handlers.
  const invokeDocument = documentRef.invoke;
  documentRef.invoke = (event, capture) => {
    if (!capture && !event.stopped) container.invoke(event, false);
    invokeDocument(event, capture);
  };
  installVidaaKeyboardFix(root);
  return {
    document: documentRef,
    root,
    container,
    node,
    timers,
    poll: () => [...timers.values()].forEach((callback) => callback()),
    dispatch,
    key: (code, target = documentRef.activeElement, options = {}) =>
      new TestEvent("keydown", { keyCode: code, target, ...options }),
    native: (name, target, options = {}) =>
      dispatch(new TestEvent(name, { isTrusted: true, ...options }), target),
    attachGlobals() {
      globalThis.document = documentRef;
      globalThis.window = root;
    }
  };
}
