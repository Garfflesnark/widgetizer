// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createCompositionMoveController } from "../compositionMove.js";
let commit, controller, grip;
function pointer(type, x, y, target = document) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(e, "pointerId", { value: 1 });
  target.dispatchEvent(e);
}
beforeEach(() => {
  document.body.innerHTML = `<section data-composition-id="c" data-composition-width="1200" data-composition-height="800"><div data-composition-child="a" data-composition-frame='{"x":0.1,"y":0.1,"pivot":{"x":0,"y":0}}'><section data-widget-id="a"><div data-image-resize-target><img></div></section></div></section><div id="wz-selection-overlay"><button data-composition-move="a">Move image</button></div>`;
  document.querySelector("[data-composition-id]").getBoundingClientRect = () => ({
    left: 0,
    top: 50,
    width: 1200,
    height: 800,
  });
  document.querySelector("[data-widget-id]").getBoundingClientRect = () => ({
    left: 120,
    top: 170,
    width: 300,
    height: 200,
  });
  grip = document.querySelector("button");
  commit = vi.fn();
  controller = createCompositionMoveController({ document, selected: () => "a", onPreview: vi.fn(), onCommit: commit });
});
afterEach(() => {
  controller.destroy();
  vi.restoreAllMocks();
});
it("moves independently, constrains canvas bounds and commits once on release", () => {
  pointer("pointerdown", 120, 170, grip);
  pointer("pointermove", 500, 400);
  pointer("pointermove", 2000, 2000);
  pointer("pointerup", 2000, 2000);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0].frame).toEqual({ x: 0.75, y: 0.5, pivot: { x: 0, y: 0 } });
  expect(commit.mock.calls[0][0].startFrame.x).toBe(0.1);
});
it.each(["pointercancel", "lostpointercapture", "Escape"])(
  "cancels %s without committing or retaining transient geometry",
  (reason) => {
    pointer("pointerdown", 120, 170, grip);
    pointer("pointermove", 500, 400);
    if (reason === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    else pointer(reason, 500, 400);
    expect(commit).not.toHaveBeenCalled();
    expect(document.querySelector("[data-composition-child]").getAttribute("style")).toBeNull();
  },
);
it("clicks below threshold and generated mobile have no gesture history", () => {
  pointer("pointerdown", 120, 170, grip);
  pointer("pointerup", 121, 171);
  expect(commit).not.toHaveBeenCalled();
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
  pointer("pointerdown", 120, 170, grip);
  pointer("pointerup", 500, 400);
  expect(commit).not.toHaveBeenCalled();
});
it("moves a body surface only after selection, and keeps resize/menu interactions separate", () => {
  pointer("pointerdown", 120, 170, document.querySelector("img"));
  pointer("pointerup", 220, 270);
  expect(commit).toHaveBeenCalledTimes(1);
  commit.mockClear();
  grip.className = "wz-image-resize-handle";
  pointer("pointerdown", 120, 170, grip);
  pointer("pointerup", 220, 270);
  expect(commit).not.toHaveBeenCalled();
});
