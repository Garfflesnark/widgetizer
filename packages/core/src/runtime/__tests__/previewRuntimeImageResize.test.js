// @vitest-environment jsdom
import { beforeAll, expect, it, vi } from "vitest";

const sent = [];
const origin = window.location.origin;
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
  expect(document.querySelector(".wz-controls").style.top).toBe("-44px");
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
