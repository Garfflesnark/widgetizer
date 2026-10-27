// @vitest-environment jsdom
import { expect, it } from "vitest";
import { getEditorHistoryShortcut } from "../editorHistoryShortcut.js";

const key = (overrides = {}) => ({ key: "z", ctrlKey: true, target: document.body, ...overrides });
it.each([["z", false, "undo"], ["Z", true, "redo"], ["y", false, "redo"]])("recognizes Ctrl+%s", (value, shiftKey, expected) => {
  expect(getEditorHistoryShortcut(key({ key: value, shiftKey }))).toBe(expected);
});
it("retains Cmd+Z and Cmd+Shift+Z but leaves Cmd+Y browser history alone", () => {
  expect(getEditorHistoryShortcut(key({ ctrlKey: false, metaKey: true }))).toBe("undo");
  expect(getEditorHistoryShortcut(key({ ctrlKey: false, metaKey: true, shiftKey: true }))).toBe("redo");
  expect(getEditorHistoryShortcut(key({ key: "y", ctrlKey: false, metaKey: true }))).toBeNull();
});
it.each(["input", "textarea", "select"])("leaves native %s undo intact", (tag) => {
  expect(getEditorHistoryShortcut(key({ target: document.createElement(tag) }))).toBeNull();
});
it("respects nested editable areas, shadow composed paths, IME and other handlers", () => {
  const editor = document.createElement("div"); editor.contentEditable = "true"; editor.setAttribute("contenteditable", "true");
  const span = document.createElement("span"); editor.appendChild(span);
  expect(getEditorHistoryShortcut(key({ target: span }))).toBeNull();
  expect(getEditorHistoryShortcut(key({ composedPath: () => [document.createElement("input"), document.body] }))).toBeNull();
  for (const overrides of [{ isComposing: true }, { defaultPrevented: true }, { altKey: true }, { ctrlKey: false }, { key: "r" }]) {
    expect(getEditorHistoryShortcut(key(overrides))).toBeNull();
  }
});
