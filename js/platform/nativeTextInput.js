const TEXT_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "email",
  "password",
  "url",
  "tel",
  "number"
]);

export function getEditableTextTarget(target) {
  if (!target || target.isConnected === false || target.disabled || target.readOnly) return null;
  const tagName = String(target.tagName || "").toUpperCase();
  if (tagName === "TEXTAREA") return target;
  if (tagName === "INPUT") {
    return TEXT_INPUT_TYPES.has(String(target.type || "").toLowerCase()) ? target : null;
  }
  if (
    target.isContentEditable === true ||
    target.contentEditable === "true" ||
    target.contentEditable === "plaintext-only"
  ) {
    return (
      target.closest?.(
        '[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]'
      ) || target
    );
  }
  return null;
}

export function getTextInputTarget(event = null, documentRef = globalThis.document) {
  return getEditableTextTarget(documentRef?.activeElement) || getEditableTextTarget(event?.target);
}
