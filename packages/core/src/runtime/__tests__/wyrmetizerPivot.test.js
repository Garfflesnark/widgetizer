// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createWyrmetizerPivotController } from "../wyrmetizerPivot.js";
import { createCompositionRotateController } from "../compositionRotate.js";
import { rebaseRotationPivot, rotatedPoint, hitRotatedRect, rotatedResizeRect } from "../rotationGeometry.js";
import { compositionContext, unrotatedCompositionRect, applyCompositionRect } from "../compositionDOM.js";
let controller, rotateController, child, overlay, commit, rotateCommit, renderOverlay;
const frame = { x: 0.2, y: 0.2, pivot: { x: 0, y: 0 }, rotation: 30 };
function pointer(type, x, y, target = document, pointerId = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: pointerId }); target.dispatchEvent(event);
}
function pivotButton() { return document.querySelector("[data-rotation-pivot]"); }
function double() { pivotButton().dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true })); }
function expectOutlineNear(actual, expected) {
  const values = text => text.split(/[ ,]+/).map(Number);
  values(actual).forEach((value, index) => expect(value).toBeCloseTo(values(expected)[index], 8));
}
function expectOutlineGeometry(actual, rect, angle, pivot) {
  const values = actual.split(/[ ,]+/).map(Number);
  [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([x, y], index) => {
    const expected = rotatedPoint(rect, x, y, angle, pivot);
    expect(values[index * 2]).toBeCloseTo(expected.x, 8);
    expect(values[index * 2 + 1]).toBeCloseTo(expected.y, 8);
  });
}
beforeEach(() => {
  document.body.innerHTML = `<section data-composition-id="c" data-composition-width="1200" data-composition-height="800"><div data-composition-child="a" data-composition-revision="r"><section data-widget-id="a"></section></div></section><div id="wz-selection-overlay"></div>`;
  const area = document.querySelector("[data-composition-id]");
  area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800 });
  child = document.querySelector("[data-composition-child]"); child.dataset.compositionFrame = JSON.stringify(frame);
  child.style.cssText = "left:240px;top:240px;width:200px;height:100px;transform:rotate(30deg)";
  overlay = document.querySelector("#wz-selection-overlay");
  overlay.setPointerCapture = vi.fn(); overlay.hasPointerCapture = () => true; overlay.releasePointerCapture = vi.fn();
  commit = vi.fn(); rotateCommit = vi.fn();
  renderOverlay = () => {
    overlay.innerHTML = "";
    rotateController?.render(overlay, document.querySelector("[data-widget-id]"));
    controller?.render(overlay, document.querySelector("[data-widget-id]"));
  };
  rotateController = createCompositionRotateController({ document, selected: () => "a", getContext: () => "desktop",
    onStart: vi.fn(), onPreview: renderOverlay, onCommit: rotateCommit });
  controller = createWyrmetizerPivotController({ document, selected: () => "a", getContext: () => "desktop", onStart: vi.fn(), onPreview: renderOverlay, onCommit: commit });
  renderOverlay();
});
afterEach(() => { controller.destroy(); rotateController.destroy(); renderOverlay = null; });
it("keeps the relocated pivot outline through confirmation until canonical geometry sync", () => {
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
  const liveStyle = child.getAttribute("style"), liveOutline = overlay.querySelector("polygon").getAttribute("points");
  double();
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0]).toMatchObject({ startFrame: frame, startRevision: "r", interactionContext: "desktop" });
  expect(child.getAttribute("style")).not.toBe(liveStyle);
  expectOutlineNear(overlay.querySelector("polygon").getAttribute("points"), liveOutline);

  const edited = commit.mock.calls[0][0].rotationPivot;
  const originalRect = { left: 240, top: 240, width: 200, height: 100 };
  const syncedRect = rebaseRotationPivot(originalRect, frame.rotation, undefined, edited);
  const saved = { ...frame, x: (syncedRect.left + frame.pivot.x * syncedRect.width) / 1200,
    y: (syncedRect.top + frame.pivot.y * syncedRect.height) / 1200, rotationPivot: edited };
  child.dataset.compositionFrame = JSON.stringify(saved);
  applyCompositionRect({ ...compositionContext(document.querySelector("[data-widget-id]")), frame: saved }, syncedRect);
  overlay.innerHTML = ""; rotateController.render(overlay, document.querySelector("[data-widget-id]"));
  controller.render(overlay, document.querySelector("[data-widget-id]"));
  expectOutlineNear(overlay.querySelector("polygon").getAttribute("points"), liveOutline);
  expect(child.getAttribute("style")).not.toBe(before);
});
it("keeps rendered image and outline aligned through pivot confirm, rotation, re-edit and reset", () => {
  const widget = document.querySelector("[data-widget-id]");
  const sync = (nextFrame, nextRect, revision) => {
    child.dataset.compositionFrame = JSON.stringify(nextFrame);
    child.dataset.compositionRevision = revision;
    applyCompositionRect({ ...compositionContext(widget), frame: nextFrame }, nextRect);
    renderOverlay();
  };
  const originalRect = { left: 240, top: 240, width: 200, height: 100 };
  const initialStyle = child.getAttribute("style");

  double();
  pointer("pointerdown", 340, 290, pivotButton());
  pointer("pointermove", 370, 300); pointer("pointerup", 370, 300);
  const draftOutline = overlay.querySelector("polygon").getAttribute("points");
  expect(child.getAttribute("style")).toBe(initialStyle);
  double();
  const firstPivot = JSON.parse(child.dataset.compositionFrame).rotationPivot;
  const firstConfirmOutline = overlay.querySelector("polygon").getAttribute("points");
  expectOutlineNear(firstConfirmOutline, draftOutline);
  expect(child.style.transform).toBe("rotate(30deg)");
  expect(overlay.querySelector("polygon").getAttribute("points")).toBe(firstConfirmOutline);

  let rect = rebaseRotationPivot(originalRect, frame.rotation, undefined, firstPivot);
  let saved = { ...frame, x: rect.left / 1200, y: rect.top / 1200, rotationPivot: firstPivot };
  sync(saved, rect, "r2");
  expect(overlay.querySelector("polygon").getAttribute("points")).toBe(firstConfirmOutline);
  expectOutlineGeometry(firstConfirmOutline, rect, 30, firstPivot);
  expect(rect).toMatchObject({ width: originalRect.width, height: originalRect.height });

  const point = { x: rect.left + rect.width * firstPivot.x, y: rect.top + rect.height * firstPivot.y };
  const rotateHandle = overlay.querySelector("[data-composition-rotate]");
  pointer("pointerdown", point.x, point.y - 65, rotateHandle);
  pointer("pointermove", point.x + 65, point.y);
  const rotatedOutline = overlay.querySelector("polygon").getAttribute("points");
  expect(child.style.transform).toBe("rotate(120deg)");
  pointer("pointerup", point.x + 65, point.y);
  expect(rotateCommit).toHaveBeenCalledTimes(1);
  expect(overlay.querySelector("polygon").getAttribute("points")).toBe(rotatedOutline);
  saved = rotateCommit.mock.calls[0][0].frame;
  sync(saved, rect, "r3");
  expect(overlay.querySelector("polygon").getAttribute("points")).toBe(rotatedOutline);
  expect(child.style.transformOrigin).toBe(`${firstPivot.x * 100}% ${firstPivot.y * 100}%`);
  expectOutlineGeometry(rotatedOutline, rect, 120, firstPivot);

  double();
  const button = pivotButton();
  const buttonX = parseFloat(button.style.left) + 10, buttonY = parseFloat(button.style.top) + 10;
  pointer("pointerdown", buttonX, buttonY, button);
  pointer("pointermove", buttonX + 25, buttonY + 20); pointer("pointerup", buttonX + 25, buttonY + 20);
  const secondDraftOutline = overlay.querySelector("polygon").getAttribute("points");
  expect(child.style.transform).toBe("rotate(120deg)");
  double();
  const secondPivot = JSON.parse(child.dataset.compositionFrame).rotationPivot;
  expect(secondPivot).not.toEqual(firstPivot);
  const secondConfirmOutline = overlay.querySelector("polygon").getAttribute("points");
  expectOutlineNear(secondConfirmOutline, secondDraftOutline);
  expect(child.style.transform).toBe("rotate(120deg)");
  expect(overlay.querySelector("polygon").getAttribute("points")).toBe(secondConfirmOutline);

  const secondRect = rebaseRotationPivot(rect, 120, firstPivot, secondPivot);
  saved = { ...saved, x: secondRect.left / 1200, y: secondRect.top / 1200, rotationPivot: secondPivot };
  sync(saved, secondRect, "r4");
  expect(overlay.querySelector("polygon").getAttribute("points")).toBe(secondConfirmOutline);
  expectOutlineGeometry(secondConfirmOutline, secondRect, 120, secondPivot);

  const reset = document.createElement("button"); reset.dataset.resetRotationPivot = "a"; overlay.append(reset); reset.click();
  expect(commit).toHaveBeenCalledTimes(3);
  expect(commit.mock.calls[2][0].rotationPivot).toEqual({ x: 0.5, y: 0.5 });
  const resetRect = rebaseRotationPivot(secondRect, 120, secondPivot, { x: 0.5, y: 0.5 });
  saved = { ...saved, x: resetRect.left / 1200, y: resetRect.top / 1200, rotationPivot: { x: 0.5, y: 0.5 } };
  sync(saved, resetRect, "r5");
  expect(child.style.transform).toBe("rotate(120deg)");
  expect(child.style.transformOrigin).toBe("50% 50%");
  expectOutlineNear(overlay.querySelector("polygon").getAttribute("points"), secondConfirmOutline);
  expectOutlineGeometry(overlay.querySelector("polygon").getAttribute("points"), resetRect, 120, { x: 0.5, y: 0.5 });
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
  const initialStyle = child.getAttribute("style");
  commit.mockImplementation(({ rotationPivot }) => {
    const rect = rebaseRotationPivot(originalRect, frame.rotation, undefined, rotationPivot);
    const saved = { ...frame, x: rect.left / 1200, y: rect.top / 1200, rotationPivot };
    child.dataset.compositionFrame = JSON.stringify(saved);
    applyCompositionRect({ ...compositionContext(document.querySelector("[data-widget-id]")), frame: saved }, rect);
    renderOverlay(); // The parent COMPOSITION_SYNC repaint follows the accepted commit.
  });
  double();
  pointer("pointerdown", 340, 290, pivotButton());
  pointer("pointermove", 370, 300); pointer("pointerup", 370, 300, overlay);
  expect(child.getAttribute("style")).toBe(initialStyle);
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
  const edited = JSON.parse(child.dataset.compositionFrame).rotationPivot;
  expect(edited).not.toEqual({ x: 0.5, y: 0.5 });
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
it.each([0, 45, -56.849, 90, 180])("keeps the mounted image subtree fixed during pivot relocation at %s degrees", angle => {
  const widget = document.querySelector("[data-widget-id]");
  const originalPivot = { x: 0.4, y: 0.6 };
  const startFrame = { ...frame, rotation: angle, rotationPivot: originalPivot };
  child.dataset.compositionFrame = JSON.stringify(startFrame);
  applyCompositionRect({ ...compositionContext(widget), frame: startFrame }, { left: 240, top: 240, width: 200, height: 100 });
  renderOverlay();
  const startStyle = child.getAttribute("style"), startRect = unrotatedCompositionRect(compositionContext(widget));
  const startOutline = overlay.querySelector("polygon").getAttribute("points");
  const initialCorners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => rotatedPoint(startRect, x, y, angle, originalPivot));
  double();
  const initialMarker = pivotButton();
  const downX = parseFloat(initialMarker.style.left) + 10, downY = parseFloat(initialMarker.style.top) + 10;
  pointer("pointerdown", downX, downY, initialMarker);
  const drafts = [{ x: 0.2, y: 0.8 }, { x: 0.75, y: 0.25 }, { x: 0.35, y: 0.65 }];
  for (const draft of drafts) {
    const point = rotatedPoint(startRect, draft.x, draft.y, angle, originalPivot);
    pointer("pointermove", point.x, point.y);
    expect(child.getAttribute("style")).toBe(startStyle);
    expect(child.dataset.compositionFrame).toBe(JSON.stringify(startFrame));
    expect(overlay.querySelector("polygon").getAttribute("points")).toBe(startOutline);
    expect(parseFloat(pivotButton().style.left) + 10).toBeCloseTo(point.x, 7);
    expect(parseFloat(pivotButton().style.top) + 10).toBeCloseTo(point.y, 7);
  }
  const end = rotatedPoint(startRect, drafts.at(-1).x, drafts.at(-1).y, angle, originalPivot);
  pointer("pointerup", end.x, end.y);
  expect(child.getAttribute("style")).toBe(startStyle);
  expect(overlay.querySelector("polygon").getAttribute("points")).toBe(startOutline);
  double();

  const committed = JSON.parse(child.dataset.compositionFrame), committedPivot = committed.rotationPivot;
  expect(committedPivot.x).toBeCloseTo(drafts.at(-1).x, 7);
  expect(committedPivot.y).toBeCloseTo(drafts.at(-1).y, 7);
  const committedRect = unrotatedCompositionRect(compositionContext(widget));
  const committedOutline = overlay.querySelector("polygon").getAttribute("points");
  expectOutlineNear(committedOutline, startOutline);
  [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([x, y], index) => {
    const point = rotatedPoint(committedRect, x, y, angle, committedPivot);
    expect(point.x).toBeCloseTo(initialCorners[index].x, 7);
    expect(point.y).toBeCloseTo(initialCorners[index].y, 7);
  });

  child.dataset.compositionRevision = "r2";
  applyCompositionRect({ ...compositionContext(widget), frame: committed }, committedRect);
  renderOverlay(); // Accepted canonical synchronization keeps the same visual frame.
  expectOutlineNear(overlay.querySelector("polygon").getAttribute("points"), committedOutline);
  expect(child.style.transform).toBe(`rotate(${angle}deg)`);
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
