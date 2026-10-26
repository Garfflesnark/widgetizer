// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImageResizeController, imageWidth, isImageWidth } from "../imageResize.js";

let controller, commit, preview, overlay, widget, target;
function pointer(element, type, x, pointerId = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0 });
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
