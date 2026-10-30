// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createWyrmetizerPivotController } from "../wyrmetizerPivot.js";
import { rebaseRotationPivot, rotatedPoint, hitRotatedRect, rotatedResizeRect } from "../rotationGeometry.js";
import { compositionContext, unrotatedCompositionRect, applyCompositionRect } from "../compositionDOM.js";
let controller, child, overlay, commit;
const frame = { x: 0.2, y: 0.2, pivot: { x: 0, y: 0 }, rotation: 30 };
function pointer(type, x, y, target = document, pointerId = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: pointerId }); target.dispatchEvent(event);
}
function pivotButton() { return document.querySelector("[data-rotation-pivot]"); }
function double() { pivotButton().dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true })); }
beforeEach(() => {
  document.body.innerHTML = `<section data-composition-id="c" data-composition-width="1200" data-composition-height="800"><div data-composition-child="a" data-composition-revision="r"><section data-widget-id="a"></section></div></section><div id="wz-selection-overlay"></div>`;
  const area = document.querySelector("[data-composition-id]");
  area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800 });
  child = document.querySelector("[data-composition-child]"); child.dataset.compositionFrame = JSON.stringify(frame);
  child.style.cssText = "left:240px;top:240px;width:200px;height:100px;transform:rotate(30deg)";
  overlay = document.querySelector("#wz-selection-overlay");
  overlay.setPointerCapture = vi.fn(); overlay.hasPointerCapture = () => true; overlay.releasePointerCapture = vi.fn();
  commit = vi.fn();
  const render = () => { overlay.innerHTML = ""; controller.render(overlay, document.querySelector("[data-widget-id]")); };
  controller = createWyrmetizerPivotController({ document, selected: () => "a", getContext: () => "desktop", onStart: vi.fn(), onPreview: render, onCommit: commit });
  render();
});
afterEach(() => controller.destroy());
it("keeps pointer placement transient until confirmation and restores baseline before commit", () => {
  const before = child.getAttribute("style"); double();
  expect(pivotButton().getAttribute("aria-pressed")).toBe("true");
  pointer("pointerdown", 340, 290, pivotButton()); pointer("pointermove", 370, 300); pointer("pointerup", 370, 300);
  const context = compositionContext(document.querySelector("[data-widget-id]"));
  const rect = unrotatedCompositionRect(context);
  for (const [x, y] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const before = rotatedPoint({ left: 240, top: 240, width: 200, height: 100 }, x, y, 30);
    const after = rotatedPoint(rect, x, y, 30, context.frame.rotationPivot);
    expect(after.x).toBeCloseTo(before.x, 8); expect(after.y).toBeCloseTo(before.y, 8);
  }
  expect(commit).not.toHaveBeenCalled(); expect(controller.active).toBe(true);
  double();
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0]).toMatchObject({ startFrame: frame, startRevision: "r", interactionContext: "desktop" });
  expect(child.getAttribute("style")).toBe(before);
});
it("releases pointer zero when cancelling a drag", () => {
  double(); pointer("pointerdown", 340, 290, pivotButton(), 0);
  controller.cancel();
  expect(overlay.releasePointerCapture).toHaveBeenCalledWith(0);
  expect(commit).not.toHaveBeenCalled();
});
it("commits the dragged pivot through the native confirmation click sequence without moving the image", () => {
  let captured = false;
  overlay.setPointerCapture.mockImplementation(() => { captured = true; });
  overlay.hasPointerCapture = () => captured;
  overlay.releasePointerCapture.mockImplementation(() => { captured = false; });
  const originalRect = { left: 240, top: 240, width: 200, height: 100 };
  commit.mockImplementation(({ rotationPivot }) => {
    const rect = rebaseRotationPivot(originalRect, frame.rotation, undefined, rotationPivot);
    const saved = { ...frame, x: rect.left / 1200, y: rect.top / 1200, rotationPivot };
    child.dataset.compositionFrame = JSON.stringify(saved);
    applyCompositionRect({ ...compositionContext(document.querySelector("[data-widget-id]")), frame: saved }, rect);
  });
  double();
  pointer("pointerdown", 340, 290, pivotButton());
  pointer("pointermove", 370, 300); pointer("pointerup", 370, 300, overlay);
  const edited = JSON.parse(child.dataset.compositionFrame).rotationPivot;
  expect(edited).not.toEqual({ x: 0.5, y: 0.5 });
  const click = () => {
    const button = pivotButton();
    const x = parseFloat(button.style.left) + 10, y = parseFloat(button.style.top) + 10;
    pointer("pointerdown", x, y, button);
    const upTarget = captured ? overlay : button;
    pointer("pointerup", x, y, upTarget);
    // Capture or removal of the pressed button makes the overlay the click target.
    const target = upTarget === button && button.isConnected ? button : overlay;
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return target;
  };
  click();
  click().dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0].rotationPivot).toEqual(edited);
  expect(controller.active).toBe(false);
  const savedContext = compositionContext(document.querySelector("[data-widget-id]"));
  expect(savedContext.frame.rotationPivot).toEqual(edited);
  expect(pivotButton().getAttribute("aria-pressed")).toBe("false");
  for (const [x, y] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const before = rotatedPoint(originalRect, x, y, frame.rotation);
    const after = rotatedPoint(unrotatedCompositionRect(savedContext), x, y, frame.rotation, edited);
    expect(after.x).toBeCloseTo(before.x, 8); expect(after.y).toBeCloseTo(before.y, 8);
  }
});
it("shows pink/green edit states and resets an unconfirmed edit to the centre", () => {
  expect(pivotButton().style.background).toBe("rgb(224, 0, 109)");
  double(); expect(pivotButton().style.background).toBe("rgb(0, 230, 118)");
  pivotButton().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }));
  const reset = document.createElement("button"); reset.dataset.resetRotationPivot = "a"; overlay.append(reset);
  reset.click();
  expect(controller.active).toBe(false);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0]).toMatchObject({ startFrame: frame, rotationPivot: { x: 0.5, y: 0.5 } });
});
it.each(["Escape", "lostpointercapture", "pointercancel", "blur", "revision", "capture failure"])("cancels %s without committing", reason => {
  const before = child.getAttribute("style"); double();
  if (reason === "capture failure") overlay.setPointerCapture = () => { throw new Error("capture failed"); };
  pointer("pointerdown", 340, 290, pivotButton()); pointer("pointermove", 360, 310);
  if (reason === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  else if (reason === "blur") window.dispatchEvent(new Event("blur"));
  else if (reason === "revision") controller.reconcile("desktop", { a: "new" });
  else if (reason !== "capture failure") document.dispatchEvent(new Event(reason));
  expect(controller.active).toBe(false); expect(commit).not.toHaveBeenCalled();
  expect(child.getAttribute("style")).toBe(before);
});
it("supports keyboard start, adjustment and confirmation", () => {
  const key = key => pivotButton().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  key("Enter"); key("ArrowRight"); key("ArrowDown"); key("Enter");
  expect(commit.mock.calls[0][0].rotationPivot).toEqual({ x: 0.51, y: 0.51 });
});
it.each([0, 30, -90, 177])("preserves corners and hit testing through repeated pivot changes at %s degrees", angle => {
  let rect = { left: 200, top: 150, width: 320, height: 170 }, pivot = { x: 0.5, y: 0.5 };
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const before = corners.map(([x, y]) => rotatedPoint(rect, x, y, angle, pivot));
  for (let i = 0; i < 100; i++) {
    const next = { x: (i % 11) / 10, y: (i % 7) / 6 };
    rect = rebaseRotationPivot(rect, angle, pivot, next); pivot = next;
  }
  rect = rebaseRotationPivot(rect, angle, pivot, { x: 0.5, y: 0.5 }); pivot = { x: 0.5, y: 0.5 };
  corners.forEach(([x, y], i) => {
    const point = rotatedPoint(rect, x, y, angle, pivot);
    expect(point.x).toBeCloseTo(before[i].x, 9); expect(point.y).toBeCloseTo(before[i].y, 9);
  });
  expect(hitRotatedRect(rect, rotatedPoint(rect, 0.3, 0.7, angle, pivot), angle, pivot)).toBe(true);
});
it("keeps the stationary local origin fixed while resizing around an off-centre pivot", () => {
  const start = { left: 200, top: 200, width: 300, height: 100 }, pivot = { x: 0.1, y: 0.8 };
  const resized = rotatedResizeRect(start, { ...start, width: 450, height: 200 }, 42, pivot);
  const before = rotatedPoint(start, 0, 0, 42, pivot), after = rotatedPoint(resized, 0, 0, 42, pivot);
  expect(after.x).toBeCloseTo(before.x, 10); expect(after.y).toBeCloseTo(before.y, 10);
});
