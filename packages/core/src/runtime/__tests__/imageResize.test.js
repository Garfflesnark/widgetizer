import { imageReference, transformRect } from "../imageTransform.js";
import { compositionRect } from "../composition.js";
import { rotatedBounds, rotatedPoint, rotateVector } from "../rotationGeometry.js";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImageResizeController, imageWidth, isImageWidth } from "../imageResize.js";

let controller, commit, preview, overlay, widget, target;
function pointer(element, type, x, pointerId = 1, y = 0, shiftKey = false) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, shiftKey });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  element.dispatchEvent(event);
}
function render() {
  overlay.replaceChildren();
  controller.renderHandle(overlay, widget, null);
}
function start() {
  pointer(overlay.querySelector("button"), "pointerdown", 500);
}

beforeEach(() => {
  document.body.innerHTML =
    '<section data-widget-id="w1" data-widget-type="image" data-image-width="100"><div><div data-image-resize-target></div></div></section><div id="overlay"></div>';
  widget = document.querySelector("section");
  target = widget.querySelector("[data-image-resize-target]");
  target.parentElement.getBoundingClientRect = () => ({ width: 1000 });
  target.getBoundingClientRect = () => ({ right: 1000, top: 0, height: 500 });
  overlay = document.getElementById("overlay");
  commit = vi.fn();
  preview = vi.fn(render);
  controller = createImageResizeController({ document, onCommit: commit, onPreview: preview });
  controller.setSupported(["w1"]);
  render();
});
afterEach(() => controller.destroy());

function modernFixture() {
  target.innerHTML = "<img>";
  widget.dataset.imageHeight = "0";
  widget.dataset.imageTransformCapable = "true";
  widget.dataset.imageNaturalWidth = "1000";
  widget.dataset.imageNaturalHeight = "500";
  target.parentElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000 });
  target.querySelector("img").getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500 });
  controller.setSupported(["w1"], ["w1"], ["w1"]);
  render();
}
function pinnedFixture(anchors = []) {
  modernFixture(); widget.dataset.imageUnits = "2";
  const transform = { version: 2, reference: "intrinsic-fit", alignment: "left", anchors,
    dimensions: { width: { unit: "px", value: 1000 }, height: { unit: "%", value: 100 } }, flowInset: { inlinePercent: 0, blockPercent: 0 } };
  controller.setSizes({ w1: { width: 100, height: 0, transform } }); render();
  return transform;
}
it.each([["px", "px"], ["px", "%"], ["%", "px"], ["%", "%"]])("resizes a rotated %s/%s composition image in local axes and keeps its green pin", (widthUnit, heightUnit) => {
  const model = pinnedFixture(["nw"]);
  model.dimensions = { width: { unit: widthUnit, value: widthUnit === "px" ? 200 : 20 },
    height: { unit: heightUnit, value: heightUnit === "px" ? 100 : 20 } };
  const frame = { x: 0.5, y: 0.3, pivot: { x: 0.5, y: 0.5 }, rotation: 90 };
  const area = document.createElement("section"), child = document.createElement("div");
  area.dataset.compositionId = "canvas"; area.dataset.compositionWidth = "1000"; area.dataset.compositionHeight = "800";
  child.dataset.compositionChild = "w1"; child.dataset.compositionFrame = JSON.stringify(frame);
  widget.before(area); area.append(child); child.append(widget);
  area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 400 });
  const initial = compositionRect(frame, 200, 100, 1000), bounds = rotatedBounds(initial, 90);
  const screen = { left: bounds.left / 2, top: bounds.top / 2, width: bounds.width / 2, height: bounds.height / 2 };
  child.getBoundingClientRect = () => screen;
  target.querySelector("img").getBoundingClientRect = () => ({ ...screen, right: screen.left + screen.width, bottom: screen.top + screen.height });
  controller.setSizes({ w1: { width: 100, height: 0, transform: model } }); render();
  const node = overlay.querySelector('[data-resize-direction="se"]');
  const start = rotatedPoint(initial, 1, 1, 90), delta = rotateVector(20, 10, 90);
  pointer(node, "pointerdown", start.x / 2, 1, start.y / 2);
  pointer(document, "pointerup", (start.x + delta.x) / 2, 1, (start.y + delta.y) / 2);
  expect(commit).toHaveBeenCalledTimes(1);
  const payload = commit.mock.calls[0][0];
  expect(payload.frame.rotation).toBe(90); expect(payload.transform.anchors).toEqual(["nw"]);
  expect(payload.transform.dimensions.width.unit).toBe(widthUnit); expect(payload.transform.dimensions.height.unit).toBe(heightUnit);
  const size = transformRect(payload.transform, imageReference(1000, 1000, 500));
  expect(size.width).toBeCloseTo(220, 2); expect(size.height).toBeCloseTo(110, 2);
  const after = compositionRect(payload.frame, size.width, size.height, 1000);
  const pinBefore = rotatedPoint(initial, 0, 0, 90), pinAfter = rotatedPoint(after, 0, 0, 90);
  expect(pinAfter.x).toBeCloseTo(pinBefore.x, 2); expect(pinAfter.y).toBeCloseTo(pinBefore.y, 2);
});
it("rebases mid-drag Shift changes without jumping and commits the whole interaction once", () => {
  pinnedFixture();
  pointer(overlay.querySelector('[data-resize-direction="se"]'), "pointerdown", 1000, 1, 500);
  pointer(document, "pointermove", 900, 1, 480);
  const before = [target.style.width, target.querySelector("img").style.height];
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true }));
  expect([target.style.width, target.querySelector("img").style.height]).toEqual(before);
  pointer(document, "pointermove", 850, 1, 460, true);
  const constrained = [target.style.width, target.querySelector("img").style.height];
  document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
  expect([target.style.width, target.querySelector("img").style.height]).toEqual(constrained);
  pointer(document, "pointerup", 850, 1, 460);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0].transform.dimensions.width.unit).toBe("px");
});
it("toggles a pin with one commit, displays green and keeps it through resize", () => {
  const model = pinnedFixture();
  overlay.querySelector('[data-resize-direction="nw"]').dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  expect(commit).toHaveBeenCalledTimes(1);
  const pinned = commit.mock.calls[0][0].transform;
  expect(pinned.anchors).toEqual(["nw"]);
  expect(commit.mock.calls[0][0].startTransform).toEqual(model);
  controller.setSizes({ w1: { width: 100, height: 0, transform: pinned } }); render();
  expect(overlay.querySelector('[data-resize-direction="nw"]').getAttribute("aria-pressed")).toBe("true");
  expect(overlay.querySelector('[data-resize-direction="nw"]').style.background).toBe("rgb(0, 230, 118)");
  commit.mockClear();
  pointer(overlay.querySelector('[data-resize-direction="se"]'), "pointerdown", 1000, 1, 500, true);
  pointer(document, "pointerup", 900, 1, 450, true);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0].transform.anchors).toEqual(["nw"]);
});
it("recognizes a double-click across overlay redraws without double committing", () => {
  pinnedFixture();
  for (let click = 0; click < 2; click++) {
    pointer(overlay.querySelector('[data-resize-direction="nw"]'), "pointerdown", 0);
    pointer(document, "pointerup", 0);
    render();
  }
  expect(commit).toHaveBeenCalledTimes(1);
  overlay.querySelector('[data-resize-direction="nw"]').dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  expect(commit).toHaveBeenCalledTimes(1);
  commit.mockClear();
  pinnedFixture(["nw", "se"]);
  for (let attempt = 0; attempt < 2; attempt++) {
    pointer(overlay.querySelector('[data-resize-direction="nw"]'), "pointerdown", 0);
    pointer(document, "pointerup", 20, 1, 20);
  }
  expect(commit).not.toHaveBeenCalled();
});
it("previews exact spacing separately from image flow insets and cancels cleanly", () => {
  pinnedFixture(); widget.dataset.imageSpacing = "1";
  target.parentElement.className = "widget-container";
  const container = target.parentElement;
  const inset = target.style.paddingBlockStart;
  controller.preview({ widgetId: "w1", spacing: { top: 23, bottom: 0 }, phase: "preview" });
  expect(container.style.paddingBlockStart).toBe("23px");
  expect(container.style.paddingBlockEnd).toBe("0px");
  expect(target.style.paddingBlockStart).toBe(inset);
  controller.preview({ widgetId: "w1", phase: "cancel" });
  expect(container.style.paddingBlockStart).toBe("");
  expect(commit).not.toHaveBeenCalled();
});
it("moves the modern top edge down with its bottom anchored and commits once", () => {
  modernFixture();
  pointer(overlay.querySelector('[data-resize-direction="n"]'), "pointerdown", 500, 1, 0);
  pointer(document, "pointermove", 500, 1, 100);
  expect(target.style.paddingBlockStart).toBe("100px");
  expect(target.querySelector("img").style.height).toBe("400px");
  expect(commit).not.toHaveBeenCalled();
  pointer(document, "pointerup", 500, 1, 100);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0]).toMatchObject({ startTransform: null, transform: {
    scale: { width: 100, height: 80 }, flowInset: { inlinePercent: 0, blockPercent: 20 },
  } });
});
it("cancels a modern corner gesture without leaving flow insets or committing", () => {
  modernFixture();
  pointer(overlay.querySelector('[data-resize-direction="nw"]'), "pointerdown", 0, 1, 0);
  pointer(document, "pointermove", 100, 1, 100);
  expect(target.style.marginInlineStart).toBe("100px");
  pointer(document, "pointercancel", 100, 1, 100);
  expect(target.style.marginInlineStart).toBe("");
  expect(target.style.paddingBlockStart).toBe("");
  expect(commit).not.toHaveBeenCalled();
});

it.each(["n", "ne", "e", "se", "s", "sw", "w", "nw"])("keeps mixed px/percent units and one commit through the actual %s handle", (direction) => {
  modernFixture();
  widget.dataset.imageUnits = "2";
  const transform = { version: 2, reference: "intrinsic-fit", alignment: "left", dimensions: { width: { unit: "px", value: 1000 }, height: { unit: "%", value: 100 } }, flowInset: { inlinePercent: 0, blockPercent: 0 } };
  controller.setSizes({ w1: { width: 100, height: 0, transform } });
  render();
  pointer(overlay.querySelector(`[data-resize-direction="${direction}"]`), "pointerdown", 0, 1, 0);
  pointer(document, "pointermove", direction.includes("e") ? -20 : 20, 1, direction.includes("s") ? -20 : 20);
  pointer(document, "pointerup", direction.includes("e") ? -20 : 20, 1, direction.includes("s") ? -20 : 20);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0].transform.dimensions.width.unit).toBe("px");
  expect(commit.mock.calls[0][0].transform.dimensions.height.unit).toBe("%");
  expect(commit.mock.calls[0][0].startTransform).toEqual(transform);
});

describe("image width values", () => {
  it.each([NaN, Infinity, -Infinity, "50", null, undefined, {}, 0, 9, 101, 50.5])("rejects %s", (value) => {
    expect(isImageWidth(value)).toBe(false);
    expect(imageWidth(value)).toBe(100);
  });
  it.each([10, 50, 100])("accepts %s", (value) => expect(isImageWidth(value)).toBe(true));
});

it("previews every move locally and sends exactly one final value", () => {
  start();
  pointer(document, "pointermove", 400);
  expect(target.style.width).toBe("80%");
  pointer(document, "pointermove", 300);
  expect(target.style.width).toBe("60%");
  expect(commit).not.toHaveBeenCalled();
  pointer(document, "pointerup", 250);
  expect(commit).toHaveBeenCalledExactlyOnceWith({ widgetId: "w1", width: 50, startWidth: 100 });
  pointer(document, "pointerup", 250);
  expect(commit).toHaveBeenCalledTimes(1);
});
it("clamps dragging to both bounds", () => {
  start();
  pointer(document, "pointermove", -1000);
  expect(target.style.width).toBe("10%");
  pointer(document, "pointermove", 2000);
  expect(target.style.width).toBe("100%");
});
it.each(["pointercancel", "lostpointercapture", "Escape", "blur", "selection", "unsupported"])(
  "cancels on %s",
  (reason) => {
    start();
    pointer(document, "pointermove", 300);
    if (reason === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    else if (reason === "blur") window.dispatchEvent(new Event("blur"));
    else if (reason === "selection") controller.cancel();
    else if (reason === "unsupported") controller.setSupported([]);
    else pointer(document, reason, 300);
    expect(target.style.width).toBe("");
    expect(commit).not.toHaveBeenCalled();
  },
);
it("ignores another pointer and does not commit a click or a returned-to-start drag", () => {
  start();
  pointer(document, "pointermove", 300, 2);
  expect(target.style.width).toBe("");
  pointer(document, "pointerup", 500);
  expect(commit).not.toHaveBeenCalled();
  start();
  pointer(document, "pointermove", 300);
  pointer(document, "pointerup", 500);
  expect(commit).not.toHaveBeenCalled();
});
it.each(["legacy", "different-type", "global", "block"])("hides handles for %s", (kind) => {
  if (kind === "legacy") target.removeAttribute("data-image-resize-target");
  if (kind === "different-type") widget.dataset.widgetType = "gallery";
  if (kind === "global") {
    widget.dataset.widgetId = "header";
    controller.setSupported(["header"]);
  }
  overlay.replaceChildren();
  controller.renderHandle(overlay, widget, kind === "block" ? "block-1" : null);
  expect(overlay.querySelector("button")).toBeNull();
});

function stretch() {
  widget.dataset.imageHeight = "0";
  target.getBoundingClientRect = () => ({ left: 0, right: 1000, top: 0, bottom: 500, width: 1000, height: 500 });
  controller.setSupported(["w1"], ["w1"]);
  render();
}
it("provides eight handles only for schemas and templates supporting height", () => {
  stretch();
  expect(overlay.querySelectorAll("button")).toHaveLength(8);
  widget.removeAttribute("data-image-height");
  render();
  expect(overlay.querySelectorAll("button")).toHaveLength(1);
});
it.each(["nw", "n", "ne", "e", "se", "s", "sw", "w"])("stretches the correct axes with the %s handle", (direction) => {
  stretch();
  const handle = overlay.querySelector(`[data-resize-direction="${direction}"]`);
  pointer(handle, "pointerdown", 500, 1, 200);
  const x = direction.includes("w") ? 600 : 400;
  const y = direction.includes("n") ? 150 : 250;
  pointer(document, "pointermove", x, 1, y);
  expect(commit).not.toHaveBeenCalled();
  pointer(document, "pointerup", x, 1, y);
  expect(commit).toHaveBeenCalledExactlyOnceWith({
    widgetId: "w1",
    startWidth: 100,
    startHeight: 0,
    width: /[ew]/.test(direction) ? 80 : 100,
    height: /[ns]/.test(direction) ? 550 : 0,
  });
});
it("restores both dimensions and Auto height after cancelling a corner gesture", () => {
  stretch();
  pointer(overlay.querySelector('[data-resize-direction="se"]'), "pointerdown", 500, 1, 200);
  pointer(document, "pointermove", 400, 1, 350);
  expect(target.style.height).toBe("650px");
  controller.cancel();
  expect(target.style.width).toBe("");
  expect(target.style.height).toBe("");
  expect(commit).not.toHaveBeenCalled();
});
it("previews sidebar dimensions without committing and restores both on cancellation", () => {
  stretch();
  controller.preview({ widgetId: "w1", width: 40, height: 250, phase: "preview" });
  controller.preview({ widgetId: "w1", width: 35, height: 300, phase: "preview" });
  expect(target.style.width).toBe("35%");
  expect(target.style.height).toBe("300px");
  expect(commit).not.toHaveBeenCalled();
  controller.preview({ widgetId: "w1", phase: "cancel" });
  expect(target.style.width).toBe("");
  expect(target.style.height).toBe("");
});
it("keeps committed sidebar styling until morph and rejects invalid drafts", () => {
  stretch();
  controller.preview({ widgetId: "w1", width: 50, height: 300, phase: "commit" });
  controller.preview({ widgetId: "w1", width: 1, height: 300, phase: "preview" });
  controller.preview({ widgetId: "w1", width: 50, height: Infinity, phase: "preview" });
  expect(target.style.width).toBe("50%");
  expect(target.style.height).toBe("300px");
  expect(commit).not.toHaveBeenCalled();
});

it("reconciles a quick Undo before any server morph, and keeps active drafts when canonical values are unchanged", () => {
  stretch();
  controller.setSizes({ w1: { width: 100, height: 0 } });
  controller.preview({ widgetId: "w1", width: 60, height: 300, phase: "preview" });
  controller.setSizes({ w1: { width: 100, height: 0 } });
  expect(target.style.width).toBe("60%");
  expect(target.style.height).toBe("300px");
  controller.preview({ widgetId: "w1", width: 60, height: 300, phase: "commit" });
  controller.setSizes({ w1: { width: 60, height: 300 } });
  controller.setSizes({ w1: { width: 100, height: 0 } });
  expect(target.style.width).toBe("100%");
  expect(target.style.height).toBe("auto");
  expect(commit).not.toHaveBeenCalled();
});

function compositionFixture(widthUnit = "%", heightUnit = "%", anchors = []) {
  modernFixture(); widget.dataset.imageUnits = "2";
  const area = document.createElement("section"), child = document.createElement("div");
  Object.assign(area.dataset, { compositionId: "canvas", compositionWidth: "1000", compositionHeight: "800" });
  child.dataset.compositionChild = "w1";
  const frame = { x: 0.2, y: 0.1, pivot: { x: 0, y: 0 } };
  child.dataset.compositionFrame = JSON.stringify(frame);
  widget.before(area); area.append(child); child.append(widget);
  area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 });
  target.querySelector("img").getBoundingClientRect = () => ({ left: 200, top: 100, right: 700, bottom: 350, width: 500, height: 250 });
  const model = { version: 2, reference: "intrinsic-fit", alignment: "center", anchors,
    dimensions: { width: { unit: widthUnit, value: widthUnit === "%" ? 50 : 500 }, height: { unit: heightUnit, value: heightUnit === "%" ? 50 : 250 } }, flowInset: { inlinePercent: 7, blockPercent: 12 } };
  controller.setSizes({ w1: { width: 100, height: 0, transform: model } }); render();
  return { area, child, frame, model };
}
it.each(["%", "px"].flatMap(w => ["%", "px"].flatMap(h => ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map(node => [w,h,node]))))(
  "composition %s/%s %s handle preserves opposite geometry and dormant flow insets", (w, h, node) => {
    const { frame, model } = compositionFixture(w, h);
    const dx = /[ew]/.test(node) ? (node.includes("w") ? -40 : 40) : 0;
    const dy = /[ns]/.test(node) ? (node.includes("n") ? -40 : 40) : 0;
    pointer(overlay.querySelector(`[data-resize-direction="${node}"]`), "pointerdown", 600, 1, 300);
    pointer(document, "pointermove", 600 + dx, 1, 300 + dy);
    expect(commit).not.toHaveBeenCalled();
    pointer(document, "pointerup", 600 + dx, 1, 300 + dy);
    expect(commit).toHaveBeenCalledTimes(1);
    const p = commit.mock.calls[0][0], size = transformRect(p.transform, imageReference(1000, 1000, 500));
    const rect = compositionRect(p.frame, size.width, size.height, 1000);
    expect(p.startFrame).toEqual(frame);
    expect(p.transform.flowInset).toEqual(model.flowInset);
    expect(p.transform.dimensions.width.unit).toBe(w); expect(p.transform.dimensions.height.unit).toBe(h);
    if (node.includes("w")) expect(rect.left + rect.width).toBeCloseTo(700, 2); else expect(rect.left).toBeCloseTo(200, 2);
    if (node.includes("n")) expect(rect.top + rect.height).toBeCloseTo(350, 2); else expect(rect.top).toBeCloseTo(100, 2);
  });
it("composition Shift resize preserves a green pin and cancellation restores the wrapper", () => {
  const { child, model } = compositionFixture("px", "%", ["nw"]), original = child.getAttribute("style");
  pointer(overlay.querySelector('[data-resize-direction="se"]'), "pointerdown", 700, 1, 350, true);
  pointer(document, "pointermove", 650, 1, 325, true);
  controller.cancel(); expect(child.getAttribute("style")).toBe(original); expect(commit).not.toHaveBeenCalled();
  pointer(overlay.querySelector('[data-resize-direction="se"]'), "pointerdown", 700, 1, 350, true);
  pointer(document, "pointerup", 650, 1, 325, true);
  expect(commit).toHaveBeenCalledTimes(1);
  const p = commit.mock.calls[0][0], size = transformRect(p.transform, imageReference(1000, 1000, 500));
  expect(size.width / size.height).toBeCloseTo(2, 2); expect(p.transform.anchors).toEqual(model.anchors);
  expect(p.frame.x).toBeCloseTo(0.2); expect(p.frame.y).toBeCloseTo(0.1);
});

it("reconciles canvas height alone without moving or resizing composition images", () => {
  const { area, child, model } = compositionFixture("px", "px");
  const sizes = { w1: { width: 100, height: 0, transform: model } };
  const image = widget.querySelector("img");
  for (const height of [1000, 600, 800]) {
    area.dataset.compositionHeight = String(height);
    controller.setSizes(sizes);
    expect(parseFloat(child.style.top) * height / 100).toBeCloseTo(100);
    expect(parseFloat(child.style.height) * height / 100).toBeCloseTo(250);
    expect(child.style.left).toBe("20%");
    expect(widget.querySelector("img")).toBe(image);
  }
});

it("keeps an idle selected image and its resize nodes unchanged through Shift press, repeat and release", () => {
  pinnedFixture(["nw"]);
  const before = widget.outerHTML, nodes = overlay.innerHTML;
  preview.mockClear(); commit.mockClear();
  for (const [type, repeat] of [["keydown", false], ["keydown", true], ["keyup", false]]) {
    const event = new KeyboardEvent(type, { key: "Shift", shiftKey: type === "keydown", repeat, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(widget.outerHTML).toBe(before);
    expect(overlay.innerHTML).toBe(nodes);
  }
  expect(preview).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  for (const node of overlay.querySelectorAll("button")) {
    expect(node.style.appearance).toBe("none");
    expect(node.style.boxSizing).toBe("border-box");
    expect(node.style.padding).toBe("0px");
    expect(node.style.boxShadow).toBe("none");
    expect(node.tabIndex).toBe(0);
  }
});
