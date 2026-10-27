// Shared by the editor and its separately focused preview document.
export function getEditorHistoryShortcut(event) {
  if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return null;
  const targets = event.composedPath?.() || [event.target];
  if (targets.some((target) => target?.isContentEditable || target?.closest?.(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="spinbutton"]',
  ))) return null;
  const key = event.key?.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey) return "redo";
  return null;
}
