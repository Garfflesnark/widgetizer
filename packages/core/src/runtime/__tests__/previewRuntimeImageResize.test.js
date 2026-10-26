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
