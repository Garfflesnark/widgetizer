// @vitest-environment jsdom
import { beforeAll, expect, it, vi } from "vitest";

const sent = [];
const origin = window.location.origin;

it("relays available editor shortcuts but preserves native input and empty history behaviour", () => {
  sent.length = 0;
  message("EDITOR_HISTORY_STATE", { canUndo: true, canRedo: true }, null);
  const first = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(first);
  expect(first.defaultPrevented).toBe(false);
  message("EDITOR_HISTORY_STATE", { canUndo: true, canRedo: true });
  for (const [key, command] of [["z", "undo"], ["y", "redo"]]) {
    const event = new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(sent.at(-1)).toEqual({ type: "EDITOR_HISTORY_SHORTCUT", payload: { command } });
  }
  const input = document.createElement("input");
  input.type = "number";
  document.body.append(input);
  const native = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true });
  input.dispatchEvent(native);
  expect(native.defaultPrevented).toBe(false);
  input.remove();
  message("EDITOR_HISTORY_STATE", { canUndo: false, canRedo: false });
  const empty = new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(empty);
  expect(empty.defaultPrevented).toBe(false);
});
function message(type, payload, source = window.parent, eventOrigin = origin) {
  window.dispatchEvent(new MessageEvent("message", { data: { type, payload }, source, origin: eventOrigin }));
}
function pointer(target, type, x) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  target.dispatchEvent(event);
}
beforeAll(async () => {
  window.history.replaceState({}, "", `/?parentOrigin=${encodeURIComponent(origin)}`);
  document.body.innerHTML =
    '<section data-widget-id="w1" data-widget-type="image" data-image-width="100"><div><div data-image-resize-target></div></div></section><section data-widget-id="w2" data-widget-type="image"></section>';
  const target = document.querySelector("[data-image-resize-target]");
  target.parentElement.getBoundingClientRect = () => ({ width: 1000 });
  target.getBoundingClientRect = () => ({ right: 1000, top: 0, height: 500 });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.parent.postMessage = (data) => sent.push(data);
  await import("../previewRuntime.js");
});

it("requires trusted support metadata before showing a selected image handle", () => {
  message("UPDATE_SELECTION", { widgetId: "w1", blockId: null });
  expect(document.querySelector(".wz-image-resize-handle")).toBeNull();
  message("SET_IMAGE_RESIZE_SUPPORT", { widgetIds: ["w1"] }, null);
  message("SET_IMAGE_RESIZE_SUPPORT", { widgetIds: ["w1"] }, window.parent, "https://evil.example");
  expect(document.querySelector(".wz-image-resize-handle")).toBeNull();
  message("SET_IMAGE_RESIZE_SUPPORT", { widgetIds: ["w1"] });
  expect(document.querySelector(".wz-image-resize-handle")).not.toBeNull();
});
it("sends one commit and no render request during pointer movements", () => {
  sent.length = 0;
  const handle = document.querySelector(".wz-image-resize-handle");
  pointer(handle, "pointerdown", 500);
  pointer(document, "pointermove", 400);
  pointer(document, "pointermove", 300);
  expect(sent).toEqual([]);
  pointer(document, "pointerup", 300);
  expect(sent).toEqual([{ type: "IMAGE_RESIZE_COMMIT", payload: { widgetId: "w1", startWidth: 100, width: 60 } }]);
});
it("cancels an active gesture when the actual runtime selection changes", () => {
  sent.length = 0;
  pointer(document.querySelector(".wz-image-resize-handle"), "pointerdown", 500);
  pointer(document, "pointermove", 300);
  message("UPDATE_SELECTION", { widgetId: "w2", blockId: null });
  pointer(document, "pointerup", 300);
  expect(sent.filter((event) => event.type === "IMAGE_RESIZE_COMMIT")).toEqual([]);
  expect(document.querySelector(".wz-image-resize-handle")).toBeNull();
  expect(document.querySelector("[data-image-resize-target]").style.width).toBe("60%");
});

it("outlines actual image bounds with a matching dashed border and keeps widget controls", () => {
  const widget = document.querySelector('[data-widget-id="w1"]');
  widget.dataset.imageHeight = "0";
  widget.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600 });
  const target = widget.querySelector("[data-image-resize-target]");
  const img = document.createElement("img");
  target.appendChild(img);
  img.getBoundingClientRect = () => ({ left: 200, right: 800, top: 20, bottom: 320, width: 600, height: 300 });
  message("SET_WIDGET_METADATA", { metadata: { w1: "Image", w2: "Other" }, widgetOrder: ["w1", "w2"] });
  message("UPDATE_SELECTION", { widgetId: "w1", blockId: null });
  message("SET_IMAGE_RESIZE_SUPPORT", { widgetIds: ["w1"], stretchWidgetIds: ["w1"] });
  const outline = document.querySelector(".wz-image-selection");
  expect(outline.style.width).toBe("600px");
  expect(outline.style.height).toBe("300px");
  expect(outline.style.borderStyle).toBe("dashed");
  expect(outline.style.borderColor).toBe(document.querySelector(".wz-image-resize-handle").style.backgroundColor);
  expect(document.querySelectorAll(".wz-image-resize-handle")).toHaveLength(8);
  expect(document.querySelector("[data-reorder]")).not.toBeNull();
  const toolbar = document.querySelector(".wz-image-controls");
  expect(toolbar.firstElementChild.dataset.reorder).toBe("up");
  expect(toolbar.querySelector(".wz-widget-label")).not.toBeNull();
  expect(toolbar.lastElementChild.dataset.reorder).toBe("down");
  expect(toolbar.firstElementChild.getAttribute("aria-label")).toBe("Move Block Up");
  expect(toolbar.lastElementChild.getAttribute("title")).toBe("Move Block Down");
  expect(getComputedStyle(toolbar.lastElementChild).color).toBe("rgb(224, 0, 109)");
  expect(toolbar.lastElementChild.querySelector("svg").getAttribute("stroke")).toBe("currentColor");
});

it("opens a compact image alignment menu and sends only an explicit action", () => {
  const widget = document.querySelector('[data-widget-id="w1"]');
  widget.dataset.imageUnits = "2";
  message("UPDATE_SELECTION", { widgetId: "w1", blockId: null });
  sent.length = 0;
  document.querySelector('[data-image-align-menu]').click();
  expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(3);
  expect(sent).toEqual([]);
  document.querySelector('[data-image-align="right"]').click();
  expect(sent).toEqual([{ type: "IMAGE_ALIGN", payload: { widgetId: "w1", alignment: "right" } }]);
  expect(document.querySelector('[role="menu"]')).toBeNull();
  document.querySelector('[data-image-align-menu]').click();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(document.querySelector('[role="menu"]')).toBeNull();
});
it("previews sidebar dimensions via trusted messages without sending a commit", () => {
  sent.length = 0;
  message("IMAGE_SIZE_PREVIEW", { widgetId: "w1", width: 40, height: 250, phase: "preview" });
  const target = document.querySelector("[data-image-resize-target]");
  expect(target.style.width).toBe("40%");
  expect(target.querySelector("img").style.height).toBe("250px");
  message("IMAGE_SIZE_PREVIEW", { widgetId: "w1", width: 20, height: 700, phase: "preview" }, null);
  expect(target.style.width).toBe("40%");
  expect(sent).toEqual([]);
  message("IMAGE_SIZE_PREVIEW", { widgetId: "w1", phase: "cancel" });
  expect(target.style.width).toBe("60%");
  expect(target.querySelector("img").style.height).toBe("");
  message("UPDATE_SELECTION", { widgetId: "w2", blockId: null });
  expect(document.querySelector(".wz-image-selection")).toBeNull();
  expect(document.querySelectorAll(".wz-image-resize-handle")).toHaveLength(0);
});

it("updates image dimensions on quick Undo without needing a server render", () => {
  message("UPDATE_SELECTION", { widgetId: "w1", blockId: null });
  const support = (width, height) =>
    message("SET_IMAGE_RESIZE_SUPPORT", {
      widgetIds: ["w1"],
      stretchWidgetIds: ["w1"],
      sizes: { w1: { width, height } },
    });
  support(73, 0);
  message("IMAGE_SIZE_PREVIEW", { widgetId: "w1", width: 58, height: 370, phase: "commit" });
  support(58, 370);
  support(73, 0);
  const target = document.querySelector("[data-image-resize-target]");
  expect(target.style.width).toBe("73%");
  expect(target.querySelector("img").style.height).toBe("auto");
});

it("keeps handles at their physical target size in a scaled design viewport and rejects untrusted zoom", () => {
  message("UPDATE_SELECTION", { widgetId: "w1", blockId: null });
  message("SET_IMAGE_RESIZE_SUPPORT", { widgetIds: ["w1"], stretchWidgetIds: ["w1"] });
  message("EDITOR_ZOOM", 0.5, null);
  expect(document.documentElement.style.getPropertyValue("--wz-editor-inverse-zoom")).toBe("");
  message("EDITOR_ZOOM", 0.5);
  expect(document.querySelector(".wz-image-resize-handle").style.width).toBe("24px");
  message("EDITOR_ZOOM", "0.2");
  expect(document.documentElement.style.getPropertyValue("--wz-editor-inverse-zoom")).toBe("2");
  message("EDITOR_ZOOM", 1);
  expect(document.querySelector(".wz-image-resize-handle").style.width).toBe("12px");
});

it("switches exclusive arrow ownership immediately between child and Composition background", () => {
  const widget = document.querySelector('[data-widget-id="w1"]');
  const area = document.createElement("section"), child = document.createElement("div");
  Object.assign(area.dataset, { compositionId: "canvas", compositionWidth: "1000", compositionHeight: "800" });
  child.dataset.compositionChild = "w1"; child.dataset.compositionFrame = JSON.stringify({ x: 0.2, y: 0.1, pivot: { x: 0, y: 0 } });
  widget.before(area); area.append(child); child.append(widget);
  area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 });
  message("SET_WIDGET_METADATA", { metadata: { w1: "Image" }, widgetOrder: ["w1", "w2"], orderingInfo: {
    widgets: { w1: { scope: "image", id: "w1", up: true, down: false, upLabel: "Bring Forward", downLabel: "Send Backward" } },
    compositions: { canvas: { scope: "composition", id: "canvas", up: false, down: true } },
  } });
  message("UPDATE_SELECTION", { widgetId: "w1" });
  let arrows = document.querySelectorAll('[data-order-scope]');
  expect(arrows).toHaveLength(2); expect(arrows[0].title).toBe("Bring Forward"); expect(arrows[1].disabled).toBe(true);
  sent.length = 0; arrows[0].click();
  expect(sent).toEqual([{ type: "ORDER_SELECTION", payload: { scope: "image", id: "w1", direction: "up" } }]);
  sent.length = 0; area.click();
  expect(sent).toEqual([{ type: "COMPOSITION_SELECTED", payload: { compositionId: "canvas" } }]);
  arrows = document.querySelectorAll('[data-order-scope]');
  expect(arrows).toHaveLength(2); expect(arrows[0].title).toBe("Move Block Up"); expect(arrows[0].disabled).toBe(true);
  expect(document.querySelectorAll('.wz-image-resize-handle')).toHaveLength(0);
  sent.length = 0; arrows[1].click();
  expect(sent).toEqual([{ type: "ORDER_SELECTION", payload: { scope: "composition", id: "canvas", direction: "down" } }]);
  message("UPDATE_SELECTION", { widgetId: "w1" });
  expect(document.querySelector('[data-order-scope]').title).toBe("Bring Forward");
});

it("starts unlocked, toggles a green position lock, and retains it across hierarchy and responsive contexts", () => {
  message("UPDATE_SELECTION", { widgetId: "w1" });
  let button = document.querySelector("[data-composition-lock]");
  expect(button.getAttribute("aria-pressed")).toBe("false");
  expect(button.title).toBe("Lock Image Position");
  expect(button.querySelector("svg")).not.toBeNull();
  expect(getComputedStyle(button).backgroundColor).toBe("rgb(224, 0, 109)");
  button.click(); button = document.querySelector("[data-composition-lock]");
  expect(button.getAttribute("aria-pressed")).toBe("true");
  expect(getComputedStyle(button).backgroundColor).toBe("rgb(0, 230, 118)");
  expect(button.title).toBe("Unlock Image Position");
  expect(document.querySelector("[data-composition-move]").disabled).toBe(true);
  message("UPDATE_SELECTION", { compositionId: "canvas" });
  message("UPDATE_SELECTION", { widgetId: "w2" });
  message("UPDATE_SELECTION", { widgetId: "w1" });
  expect(document.querySelector("[data-composition-lock]").getAttribute("aria-pressed")).toBe("true");
  window.dispatchEvent(new MessageEvent("message", { data: { type: "COMPOSITION_SYNC", context: "mobile", movementLocks: { w1: "canvas" }, payload: { compositions: { canvas: { childrenOrder: ["w1"], placements: {} } } } }, source: window.parent, origin }));
  expect(document.querySelector("[data-composition-lock]").getAttribute("aria-pressed")).toBe("true");
  document.querySelector("[data-composition-lock]").click();
  expect(document.querySelector("[data-composition-lock]").getAttribute("aria-pressed")).toBe("false");
  expect(document.querySelector("[data-composition-move]").disabled).toBe(false);
});
it("does not move a locked Image through either target or turn lock clicks into gestures", () => {
  message("UPDATE_SELECTION", { widgetId: "w1" });
  const lock = document.querySelector("[data-composition-lock]");
  sent.length = 0;
  pointer(lock, "pointerdown", 300); pointer(document, "pointerup", 400);
  expect(sent.filter(e => e.type === "COMPOSITION_MOVE")).toHaveLength(0);
  lock.click();
  expect(sent.at(-1).type).toBe("COMPOSITION_LOCK");
  sent.length = 0;
  for (const target of [document.querySelector("img"), document.querySelector("[data-composition-move]")]) {
    pointer(target, "pointerdown", 300); pointer(document, "pointermove", 400); pointer(document, "pointerup", 400);
  }
  expect(sent).toEqual([]);
  expect(document.querySelectorAll(".wz-image-resize-handle")).toHaveLength(8);
  expect(document.querySelector("[data-order-scope]").title).toBe("Bring Forward");
  document.querySelector("[data-composition-lock]").click();
});
it("preserves image selection through repeated captured releases, cancellation and synchronization", () => {
  message("UPDATE_SELECTION", { widgetId: "w1" });
  const area = document.querySelector("[data-composition-id]");
  sent.length = 0;
  for (let i = 0; i < 2; i++) {
    pointer(document.querySelector("img"), "pointerdown", 300);
    pointer(document, "pointermove", 400);
    pointer(document, "pointerup", 400);
    area.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    message("UPDATE_SELECTION", { widgetId: "w1" });
    expect(document.querySelector("[data-composition-lock]").getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector("[data-order-scope]").title).toBe("Bring Forward");
    expect(document.querySelectorAll(".wz-image-resize-handle")).toHaveLength(8);
  }
  expect(sent.filter(e => e.type === "COMPOSITION_MOVE")).toHaveLength(2);
  expect(sent.filter(e => e.type === "COMPOSITION_SELECTED")).toHaveLength(0);
  pointer(document.querySelector("img"), "pointerdown", 300);
  pointer(document, "pointermove", 400);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  area.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
  expect(sent.filter(e => e.type === "COMPOSITION_SELECTED")).toHaveLength(0);
  pointer(area, "pointerdown", 10); area.click();
  expect(sent.at(-1).type).toBe("COMPOSITION_SELECTED");
});
it("keeps toolbar and all handle hit areas on negative image coordinates after nested scrolling and zoom", async () => {
  message("UPDATE_SELECTION", { widgetId: "w1" });
  message("EDITOR_ZOOM", 0.5);
  const image = document.querySelector("img");
  image.getBoundingClientRect = () => ({ left: -20, right: 580, top: -200, bottom: 100, width: 600, height: 300 });
  document.querySelector("[data-composition-child]").dispatchEvent(new Event("scroll"));
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  const handle = document.querySelector('[data-resize-direction="nw"]');
  expect(handle.style.left).toBe("-32px"); expect(handle.style.top).toBe("-212px");
  expect(handle.style.width).toBe("24px"); expect(handle.style.pointerEvents).toBe("auto");
  expect(document.querySelector(".wz-image-selection").style.top).toBe("-200px");
  expect(document.querySelector(".wz-image-controls").style.top).toBe("-6px");
  expect(document.querySelectorAll('[data-composition-move]')).toHaveLength(1);
  message("EDITOR_ZOOM", 1);
});
