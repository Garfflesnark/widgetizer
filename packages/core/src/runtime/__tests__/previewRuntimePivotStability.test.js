// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { rotatedPoint } from "../rotationGeometry.js";
import { compositionContext, unrotatedCompositionRect } from "../compositionDOM.js";

const sent = [];
const origin = window.location.origin;
window.history.replaceState({}, "", `/?parentOrigin=${encodeURIComponent(origin)}`);
document.body.innerHTML = `<script data-preview-mode="editor"></script>
  <section data-composition-id="canvas" data-composition-mode="composition" data-composition-width="1200" data-composition-height="800">
    <div data-composition-child="w" data-composition-revision="r1" data-composition-frame='{"x":0.2,"y":0.2,"pivot":{"x":0,"y":0},"rotation":-56.849}' style="left:20%;top:30%;width:16.6666667%;height:12.5%;transform:rotate(-56.849deg);transform-origin:50% 50%;z-index:1">
      <section data-widget-id="w" data-widget-type="image"><img src="/fixture.png" alt=""></section>
    </div>
  </section>`;
window.innerWidth = 1200;
window.matchMedia = () => ({ matches: false });
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
window.parent.postMessage = message => sent.push(message);
await import("../previewRuntime.js");

const startFrame = { x: 0.2, y: 0.2, pivot: { x: 0, y: 0 }, rotation: -56.849 };
const startRect = { left: 240, top: 240, width: 200, height: 100 };
const area = document.querySelector("[data-composition-id]");
area.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 });
function send(type, payload = {}) {
  window.dispatchEvent(new MessageEvent("message", { origin, source: window.parent, data: { type, ...payload } }));
}
function pointer(type, x, y, target = document) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: 1 }); target.dispatchEvent(event);
}
function sync(frame, rect, revision, force = false) {
  send("COMPOSITION_SYNC", { context: "desktop", movementLocks: {}, sizes: {}, revisions: { w: revision }, force,
    resolvedCompositionAreas: { canvas: { mode: "composition", widthPx: 1200, heightPx: 800, stackOrder: ["w"],
      placements: { w: { frame, rect } } } } });
}
function corners() { return document.querySelector("#wz-selection-overlay polygon").getAttribute("points").split(/[ ,]+/).map(Number); }
function expectCornersNear(actual, expected) { actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 6)); }
function expectedOutline(rect, angle, pivot) {
  return [[0, 0], [1, 0], [1, 1], [0, 1]].flatMap(([x, y]) => {
    const p = rotatedPoint(rect, x, y, angle, pivot); return [p.x, p.y];
  });
}

afterEach(() => { document.body.innerHTML = ""; sent.length = 0; });

it("keeps the mounted preview fixed while dragging the pivot, then reconciles accepted and rejected syncs", () => {
  sync(startFrame, startRect, "r1");
  send("UPDATE_SELECTION", { payload: { widgetId: "w", blockId: null } });
  const child = document.querySelector("[data-composition-child]"), widget = document.querySelector("[data-widget-id]");
  const overlay = document.querySelector("#wz-selection-overlay");
  overlay.setPointerCapture = vi.fn(); overlay.hasPointerCapture = () => true; overlay.releasePointerCapture = vi.fn();
  const originalStyle = child.getAttribute("style"), originalFrame = child.dataset.compositionFrame;
  const initialOutline = corners();
  let marker = document.querySelector("#wz-selection-overlay [data-rotation-pivot]");
  marker.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  marker = document.querySelector("#wz-selection-overlay [data-rotation-pivot]");
  const startX = parseFloat(marker.style.left) + 10, startY = parseFloat(marker.style.top) + 10;
  pointer("pointerdown", startX, startY, marker);
  const oldPivot = { x: 0.5, y: 0.5 }, targetPivot = { x: 0.22, y: 0.78 };
  const target = rotatedPoint(startRect, targetPivot.x, targetPivot.y, startFrame.rotation, oldPivot);
  for (const [x, y] of [[0.35, 0.65], [targetPivot.x, targetPivot.y]]) {
    const point = rotatedPoint(startRect, x, y, startFrame.rotation, oldPivot);
    pointer("pointermove", point.x, point.y);
    expect(child.getAttribute("style")).toBe(originalStyle);
    expect(child.dataset.compositionFrame).toBe(originalFrame);
    expectCornersNear(corners(), initialOutline);
  }
  pointer("pointerup", target.x, target.y);
  expect(child.getAttribute("style")).toBe(originalStyle);
  marker = document.querySelector("#wz-selection-overlay [data-rotation-pivot]");
  expect(parseFloat(marker.style.left) + 10).toBeCloseTo(target.x, 5);
  expect(parseFloat(marker.style.top) + 10).toBeCloseTo(target.y, 5);
  marker.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));

  const pivotCommit = sent.findLast(message => message.type === "COMPOSITION_PIVOT");
  expect(pivotCommit.payload.rotationPivot.x).toBeCloseTo(targetPivot.x, 5);
  expect(pivotCommit.payload.rotationPivot.y).toBeCloseTo(targetPivot.y, 5);
  expect(child.getAttribute("style")).not.toBe(originalStyle);
  const committedFrame = JSON.parse(child.dataset.compositionFrame), committedRect = unrotatedCompositionRect(compositionContext(widget));
  const acceptedOutline = corners();
  expectCornersNear(acceptedOutline, expectedOutline(startRect, startFrame.rotation, oldPivot));
  expect(child.style.transform).toBe(`rotate(${startFrame.rotation}deg)`);
  expect(parseFloat(child.style.transformOrigin)).toBeCloseTo(targetPivot.x * 100, 8);
  expect(parseFloat(child.style.transformOrigin.split(" ")[1])).toBeCloseTo(targetPivot.y * 100, 8);

  sync(committedFrame, committedRect, "r2");
  expect(child.dataset.compositionRevision).toBe("r2");
  expectCornersNear(corners(), acceptedOutline);

  // A later transaction rejection is recovered by the parent's authoritative forced sync.
  const beforeRejectedEdit = child.getAttribute("style"), canonicalBeforeReject = JSON.parse(child.dataset.compositionFrame);
  const canonicalRectBeforeReject = unrotatedCompositionRect(compositionContext(widget));
  marker = document.querySelector("#wz-selection-overlay [data-rotation-pivot]");
  marker.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  marker = document.querySelector("#wz-selection-overlay [data-rotation-pivot]");
  const px = parseFloat(marker.style.left) + 10, py = parseFloat(marker.style.top) + 10;
  pointer("pointerdown", px, py, marker);
  pointer("pointermove", px + 32, py + 18);
  expect(child.getAttribute("style")).toBe(beforeRejectedEdit);
  pointer("pointerup", px + 32, py + 18);
  document.querySelector("#wz-selection-overlay [data-rotation-pivot]").dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  expect(child.getAttribute("style")).not.toBe(beforeRejectedEdit);
  sync(canonicalBeforeReject, canonicalRectBeforeReject, "r2", true);
  expect(child.dataset.compositionRevision).toBe("r2");
  expect(child.getAttribute("style")).toBe(beforeRejectedEdit);
  expectCornersNear(corners(), acceptedOutline);
});
