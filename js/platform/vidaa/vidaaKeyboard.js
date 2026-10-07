// Some VIDAA keyboards update value without emitting DOM input events.
// Observe only the focused text field; leave the native value setter intact.
export function installVidaaKeyboardFix(root = globalThis) {
  const documentRef = root.document;
  if (!documentRef?.addEventListener || root.__NUVIO_VIDAA_KEYBOARD_FIX_INSTALLED__) return;
  root.__NUVIO_VIDAA_KEYBOARD_FIX_INSTALLED__ = true;

  let field = null;
  let previousValue = "";
  let timer = null;
  const isTextField = (target) => {
    if (target?.tagName === "TEXTAREA") return true;
    return (
      target?.tagName === "INPUT" &&
      ["", "text", "search", "email", "password", "url", "tel", "number"].includes(
        String(target.type || "").toLowerCase()
      )
    );
  };
  const stop = () => {
    if (timer !== null) root.clearInterval(timer);
    timer = null;
    field = null;
  };
  const check = () => {
    if (!field || documentRef.hidden) return;
    const target = field;
    const value = String(target.value || "");
    if (value === previousValue) return;
    previousValue = value;
    target.dispatchEvent(new root.Event("input", { bubbles: true }));
    target.dispatchEvent(new root.Event("change", { bubbles: true }));
  };
  const observe = (target) => {
    if (field === target) return;
    stop();
    if (!isTextField(target) || documentRef.hidden) return;
    field = target;
    previousValue = String(target.value || "");
    timer = root.setInterval(check, 250);
    timer?.unref?.();
  };
  documentRef.addEventListener("focusin", (event) => observe(event.target));
  documentRef.addEventListener("focusout", (event) => {
    if (event.target !== field) return;
    // A keyboard may commit its final value immediately before closing.
    check();
    stop();
  });
  ["input", "change"].forEach((name) => {
    documentRef.addEventListener(name, (event) => {
      if (event.target === field) previousValue = String(field.value || "");
    });
  });
  documentRef.addEventListener("visibilitychange", () => {
    if (documentRef.hidden) stop();
    else observe(documentRef.activeElement);
  });
  root.addEventListener?.("pagehide", stop);
  root.addEventListener?.("pageshow", () => observe(documentRef.activeElement));
  observe(documentRef.activeElement);
}
