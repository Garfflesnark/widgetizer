// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createCompositionRotateController } from "../compositionRotate.js";
let controller, commit, child, handle;
function pointer(type, x, y, shiftKey = false, target = document) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, shiftKey });
  Object.defineProperty(e, "pointerId", { value: 1 }); target.dispatchEvent(e);
}
beforeEach(() => {
  document.body.innerHTML = `<section data-composition-id="c" data-composition-width="1200" data-composition-height="800"><div data-composition-child="a" data-composition-revision="r1" data-composition-frame='{"x":0.25,"y":0.25,"pivot":{"x":0,"y":0}}'><section data-widget-id="a"></section></div></section><div id="wz-selection-overlay"><button data-composition-rotate="a"></button></div>`;
  document.querySelector("[data-composition-id]").getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 });
  child = document.querySelector("[data-composition-child]");
  child.getBoundingClientRect = () => ({ left: 150, top: 150, width: 150, height: 100 });
  handle = document.querySelector("button"); commit = vi.fn();
  controller = createCompositionRotateController({ document, selected: () => "a", getContext: () => "desktop-page",
    onStart: vi.fn(), onPreview: vi.fn(), onCommit: commit });
});
afterEach(() => { controller.destroy(); vi.restoreAllMocks(); });
it("rotates around the center in a scaled viewport and commits just once with unchanged position", () => {
  pointer("pointerdown", 225, 135, false, handle);
  pointer("pointermove", 290, 200);
  expect(child.style.transform).toBe("rotate(90deg)"); expect(commit).not.toHaveBeenCalled();
  controller.reconcile("desktop-page", { a: "r1" }); expect(controller.active).toBe(true);
  pointer("pointerup", 290, 200);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0]).toMatchObject({ startRevision: "r1", frame: { x: 0.25, y: 0.25, rotation: 90 }, startFrame: { x: 0.25, y: 0.25 } });
});
it("snaps to 15 degrees with Shift, and releases snapping without committing a segment", () => {
  pointer("pointerdown", 225, 135, false, handle);
  const x = 225 + 65 * Math.sin(22 * Math.PI / 180), y = 200 - 65 * Math.cos(22 * Math.PI / 180);
  pointer("pointermove", x, y, true); expect(child.style.transform).toBe("rotate(15deg)");
  document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
  expect(child.style.transform).toBe("rotate(22deg)"); expect(commit).not.toHaveBeenCalled();
  pointer("pointerup", x, y); expect(commit).toHaveBeenCalledTimes(1);
});
it.each(["Escape", "pointercancel", "lostpointercapture", "blur", "context", "revision"])("cancels %s without history or draft styles", reason => {
  pointer("pointerdown", 225, 135, false, handle); pointer("pointermove", 290, 200);
  if (reason === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  else if (reason === "blur") window.dispatchEvent(new Event("blur"));
  else if (reason === "context") controller.reconcile("other", { a: "r1" });
  else if (reason === "revision") controller.reconcile("desktop-page", { a: "r2" });
  else pointer(reason, 290, 200);
  expect(commit).not.toHaveBeenCalled(); expect(child.getAttribute("style")).toBeNull();
});
it("does not edit generated mobile geometry or create click-only history", () => {
  pointer("pointerdown", 225, 135, false, handle); pointer("pointerup", 225, 135);
  expect(commit).not.toHaveBeenCalled();
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
  pointer("pointerdown", 225, 135, false, handle); pointer("pointerup", 290, 200);
  expect(commit).not.toHaveBeenCalled();
});
