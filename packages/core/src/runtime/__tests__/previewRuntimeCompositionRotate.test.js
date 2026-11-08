// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

const sent = [];
const origin = window.location.origin;
window.history.replaceState({}, "", `/?parentOrigin=${encodeURIComponent(origin)}`);
Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
window.parent.postMessage = message => sent.push(message);
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });

document.body.innerHTML = `<section data-composition-id="canvas" data-composition-mode="composition" data-composition-width="1200" data-composition-height="800">
  <div data-composition-child="w" data-composition-revision="r1" data-composition-frame='{"x":0.25,"y":0.25,"pivot":{"x":0,"y":0},"rotation":-15.803,"rotationPivot":{"x":0.5,"y":0.5}}' style="left:25%;top:25%;width:25%;height:25%;transform:rotate(-15.803deg);transform-origin:50% 50%">
    <section data-widget-id="w" data-widget-type="image"></section>
  </div>
</section>`;
const area = document.querySelector("[data-composition-id]");
area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800 });
await import("../previewRuntime.js");

function send(type, payload = {}) {
  window.dispatchEvent(new MessageEvent("message", { origin, source: window.parent, data: { type, ...payload } }));
}
function pointer(target, type, x, y) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: 1 });
  target.dispatchEvent(event);
}
function outline() { return document.querySelector("#wz-selection-overlay polygon")?.getAttribute("points"); }

afterEach(() => {
  document.body.innerHTML = "";
  sent.length = 0;
});

it("keeps the mounted preview outline aligned from accepted rotation through metadata redraw and canonical sync", () => {
  const startFrame = { x: 0.25, y: 0.25, pivot: { x: 0, y: 0 }, rotation: -15.803, rotationPivot: { x: 0.5, y: 0.5 } };
  const initialComposition = { profiles: { desktop: { referenceWidthPx: 1200, height: { valuePx: 800 } } },
    childrenOrder: ["w"], stackOrder: ["w"], placements: { w: { frames: { desktop: startFrame } } } };
  send("COMPOSITION_SYNC", { context: "desktop", movementLocks: {}, sizes: {}, revisions: { w: "r1" },
    payload: { compositions: { canvas: initialComposition } } });
  send("UPDATE_SELECTION", { payload: { widgetId: "w", blockId: null } });

  const widget = document.querySelector('[data-widget-id="w"]');
  const rotateButton = document.querySelector("#wz-selection-overlay [data-composition-rotate]");
  expect(rotateButton).not.toBeNull();
  const centerX = 450, centerY = 300, radius = 100;
  const startAngle = startFrame.rotation * Math.PI / 180, acceptedAngle = 19.197 * Math.PI / 180;
  const startX = centerX + radius * Math.cos(startAngle), startY = centerY + radius * Math.sin(startAngle);
  const endX = centerX + radius * Math.cos(acceptedAngle), endY = centerY + radius * Math.sin(acceptedAngle);
  pointer(rotateButton, "pointerdown", startX, startY);
  pointer(document, "pointermove", endX, endY);
  const liveOutline = outline();
  pointer(document, "pointerup", endX, endY);

  const rotationMessage = sent.findLast(message => message.type === "COMPOSITION_ROTATE");
  expect(rotationMessage.payload.frame.rotation).toBeCloseTo(19.197, 3);
  const liveImageTransform = document.querySelector("[data-composition-child]").style.transform;
  expect(liveImageTransform).toContain("19.197");

  // A page update can redraw metadata before the matching COMPOSITION_SYNC arrives.
  send("SET_WIDGET_METADATA", { payload: { metadata: { w: "Image" }, widgetOrder: ["w"] } });
  expect(document.querySelector("[data-composition-child]").style.transform).toBe(liveImageTransform);
  expect(outline()).toBe(liveOutline);

  // A delayed sync carrying the starting revision must not restore the image angle either.
  send("COMPOSITION_SYNC", { context: "desktop", movementLocks: {}, sizes: {}, revisions: { w: "r1" },
    payload: { compositions: { canvas: initialComposition } } });
  expect(document.querySelector("[data-composition-child]").style.transform).toBe(liveImageTransform);
  expect(outline()).toBe(liveOutline);

  const committedFrame = rotationMessage.payload.frame;
  send("COMPOSITION_SYNC", { context: "desktop", movementLocks: {}, sizes: {}, revisions: { w: "r2" },
    payload: { compositions: { canvas: { ...initialComposition,
      placements: { w: { frames: { desktop: committedFrame } } } } } } });
  expect(document.querySelector("[data-composition-child]").style.transform).toBe("rotate(19.197deg)");
  expect(outline()).toBe(liveOutline);
  expect(widget.dataset.widgetId).toBe("w");

  // A later rejected rotation is recovered by the existing forced authoritative sync.
  const secondRotate = document.querySelector("#wz-selection-overlay [data-composition-rotate]");
  const nextAngle = 45 * Math.PI / 180;
  const nextX = centerX + radius * Math.cos(nextAngle), nextY = centerY + radius * Math.sin(nextAngle);
  pointer(secondRotate, "pointerdown", endX, endY);
  pointer(document, "pointermove", nextX, nextY);
  pointer(document, "pointerup", nextX, nextY);
  expect(document.querySelector("[data-composition-child]").style.transform).toBe("rotate(45deg)");
  const restoredOutline = outline();
  send("COMPOSITION_SYNC", { force: true, context: "desktop", movementLocks: {}, sizes: {}, revisions: { w: "r2" },
    payload: { compositions: { canvas: { ...initialComposition,
      placements: { w: { frames: { desktop: committedFrame } } } } } } });
  expect(document.querySelector("[data-composition-child]").style.transform).toBe("rotate(19.197deg)");
  expect(outline()).not.toBe(restoredOutline);
  expect(outline()).toBe(liveOutline);
});
