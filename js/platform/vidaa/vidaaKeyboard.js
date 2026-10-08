import { getEditableTextTarget, getTextInputTarget } from "../nativeTextInput.js";
import { normalizeKeyEvent } from "../sharedKeys.js";

const keyboards = new WeakMap();

export function getVidaaTextInputKeyCode(event) {
  // FocusEngine has already applied platform/simulator mapping to this shape.
  if (event?.originalKeyCode !== undefined && Number(event?.keyCode)) return Number(event.keyCode);
  const code = normalizeKeyEvent(event).keyCode;
  if (code) return code;
  return { Backspace: 8, Delete: 46, Home: 36, End: 35, Escape: 27, Esc: 27 }[event?.key] || 0;
}

function readValue(target) {
  return String(target.value ?? target.textContent ?? "");
}

function editingTarget(event, documentRef) {
  if (documentRef?.hidden) return null;
  const target = getTextInputTarget(event, documentRef);
  const keyboard = documentRef && keyboards.get(documentRef);
  return target && !keyboard?.closedFields.has(target) ? target : null;
}

export function isVidaaTextInputEditingActive(event = null, documentRef = globalThis.document) {
  return Boolean(editingTarget(event, documentRef));
}

export function shouldPreserveVidaaTextInputKey(event, documentRef = globalThis.document) {
  const target = editingTarget(event, documentRef);
  if (!target) return false;
  const code = getVidaaTextInputKeyCode(event);
  if (event?.isComposing || code === 229) return true;
  if ([8, 13, 35, 36, 37, 39, 46].includes(code)) return true;
  // A single-line field uses up/down to return to the page. Multiline editors
  // retain them for caret movement; Escape/remote Back can finish those editors.
  return [38, 40].includes(code) && String(target.tagName).toUpperCase() !== "INPUT";
}

function stopPageHandlers(event) {
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}

export function handleVidaaTextInputKey(event, { keyUp = false } = {}, root = globalThis) {
  const documentRef = root.document;
  if (!documentRef) return false;
  installVidaaKeyboardFix(root);
  const keyboard = keyboards.get(documentRef);
  const code = getVidaaTextInputKeyCode(event);
  let target = editingTarget(event, documentRef);
  if (!keyUp && code === 13 && !target) {
    // After a commit, the visual focus may still be on the field. OK starts a
    // fresh native editing session without clicking/submitting another control.
    const focused = getEditableTextTarget(documentRef.querySelector?.(".focused"));
    const activeTag = String(documentRef.activeElement?.tagName || "").toUpperCase();
    if (
      focused &&
      (!activeTag || ["BODY", "HTML"].includes(activeTag) || documentRef.activeElement === focused)
    ) {
      focused.focus?.({ preventScroll: true });
      keyboard?.observe(focused);
      target = focused;
    }
  }
  if (!target) return false;
  if (!keyUp && [27, 461, 10009].includes(code)) {
    keyboard?.finish(target, true);
    event?.preventDefault?.();
    stopPageHandlers(event);
    return true;
  }
  if (shouldPreserveVidaaTextInputKey(event, documentRef)) {
    // Preserve the native default action, but never forward editing keys to a
    // screen, focus trap, search-submit listener or the global Back handler.
    stopPageHandlers(event);
    return true;
  }
  if (!keyUp && [38, 40].includes(code)) keyboard?.finish(target, true);
  return false;
}

// Some VIDAA keyboards mutate value silently. Keep DOM semantics: input while
// editing, one change on commit. Never replace the native value setter.
export function installVidaaKeyboardFix(root = globalThis) {
  const documentRef = root.document;
  if (!documentRef?.addEventListener || keyboards.has(documentRef)) return;

  const records = new WeakMap();
  const syntheticEvents = new WeakSet();
  const closedFields = new WeakSet();
  let field = null;
  let timer = null;
  const stop = () => {
    if (timer !== null) root.clearInterval(timer);
    timer = null;
    field = null;
  };
  const emit = (record, name) => {
    const event = new root.Event(name, { bubbles: true });
    syntheticEvents.add(event);
    record.target.dispatchEvent(event);
    if (name === "input") {
      // Screen listeners may normalize the value (e.g. profile maxlength).
      record.value = readValue(record.target);
      record.syntheticInputValue = record.value;
    }
  };
  const check = (record = field) => {
    if (!record) return;
    const value = readValue(record.target);
    if (value === record.value) return;
    record.value = value;
    record.dirty = true;
    record.syntheticInputValue = value;
    emit(record, "input");
  };
  const finish = (target, blur = false) => {
    const record = records.get(target);
    if (field?.target === target) stop();
    closedFields.add(target);
    check(record);
    if (record?.dirty && record.changeValue !== record.value) {
      record.changeValue = record.value;
      record.dirty = false;
      record.syntheticChangeValue = record.value;
      emit(record, "change");
    }
    if (blur && documentRef.activeElement === target) target.blur?.();
  };
  const observe = (target) => {
    if (field?.target === target) return;
    if (field) finish(field.target);
    if (!getEditableTextTarget(target) || documentRef.hidden) return;
    const value = readValue(target);
    field = {
      target,
      value,
      changeValue: value,
      dirty: false,
      syntheticInputValue: null,
      syntheticChangeValue: null
    };
    records.set(target, field);
    closedFields.delete(target);
    timer = root.setInterval(() => {
      if (
        documentRef.hidden ||
        target.isConnected === false ||
        documentRef.activeElement !== target
      ) {
        finish(target);
        return;
      }
      check();
    }, 250);
    timer?.unref?.();
  };
  keyboards.set(documentRef, { closedFields, observe, finish });

  // Capture before screen handlers can rerender/remove the field or submit a
  // stale draft. Keep records through blur to deduplicate a delayed native event.
  documentRef.addEventListener(
    "focusin",
    (event) => observe(getEditableTextTarget(event.target)),
    true
  );
  documentRef.addEventListener(
    "focusout",
    (event) => {
      const target = getEditableTextTarget(event.target) || event.target;
      if (records.has(target)) finish(target);
    },
    true
  );
  for (const name of ["input", "change"]) {
    documentRef.addEventListener(
      name,
      (event) => {
        const record = records.get(getEditableTextTarget(event.target) || event.target);
        if (!record || syntheticEvents.has(event)) return;
        const value = readValue(record.target);
        const syntheticValue =
          name === "input" ? record.syntheticInputValue : record.syntheticChangeValue;
        if (syntheticValue === value) {
          stopPageHandlers(event);
          return;
        }
        if (name === "change") {
          check(record);
          record.changeValue = record.value;
          record.dirty = false;
          record.syntheticChangeValue = null;
          finish(record.target, true);
        } else {
          record.value = value;
          record.dirty = true;
          record.syntheticInputValue = null;
        }
      },
      true
    );
  }
  const suspend = () => {
    if (field) finish(field.target);
  };
  documentRef.addEventListener("visibilitychange", () => {
    if (documentRef.hidden) suspend();
    else observe(getEditableTextTarget(documentRef.activeElement));
  });
  root.addEventListener?.("pagehide", suspend);
  root.addEventListener?.("pageshow", () =>
    observe(getEditableTextTarget(documentRef.activeElement))
  );
  observe(getEditableTextTarget(documentRef.activeElement));
}
