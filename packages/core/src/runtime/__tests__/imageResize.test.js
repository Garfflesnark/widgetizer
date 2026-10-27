// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImageResizeController, imageWidth, isImageWidth } from "../imageResize.js";

let controller, commit, preview, overlay, widget, target;
function pointer(element, type, x, pointerId = 1, y = 0) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
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
