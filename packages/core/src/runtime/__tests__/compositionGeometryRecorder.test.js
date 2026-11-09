// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { compositionGeometryRecorderEnabled, createCompositionGeometryRecorder, installCompositionGeometryRecorderApi, transformedCorners } from "../compositionGeometryRecorder.js";

let recorder;
afterEach(() => { recorder?.destroy(); recorder = null; delete window.__WZ_COMPOSITION_GEOMETRY_RECORDER__; vi.restoreAllMocks(); });

function fixture() {
  document.body.innerHTML = `<script data-preview-mode="editor" data-geometry-recorder-available="true"></script>
    <section data-composition-id="area" data-composition-width="1200" data-composition-height="800">
      <div data-composition-child="image-a" data-composition-revision="rev-1" data-composition-frame='{"x":0.2,"y":0.2,"pivot":{"x":0,"y":0},"rotation":30,"rotationPivot":{"x":0.25,"y":0.75}}' style="left:240px;top:160px;width:200px;height:100px;transform:rotate(30deg);transform-origin:25% 75%">
        <section data-widget-id="image-a"><img alt="private image alt text" src="data:image/png;base64,not-recorded"></section>
      </div>
    </section><div id="wz-selection-overlay"><svg><polygon points="240,160 413.2,260 363.2,346.6 190,246.6"></polygon></svg>
      <button data-rotation-pivot="image-a" style="left:300px;top:220px"></button><button data-composition-rotate="image-a"></button>
    </div>`;
  const area = document.querySelector("[data-composition-id]");
  const wrapper = document.querySelector("[data-composition-child]");
  const image = document.querySelector("img");
  area.getBoundingClientRect = () => ({ left: 10, top: 20, right: 610, bottom: 420, width: 600, height: 400 });
  wrapper.getBoundingClientRect = () => ({ left: 130, top: 100, right: 330, bottom: 200, width: 200, height: 100 });
  image.getBoundingClientRect = () => ({ left: 130, top: 100, right: 330, bottom: 200, width: 200, height: 100 });
  const quad = { p1: { x: 130, y: 100 }, p2: { x: 303.2, y: 200 }, p3: { x: 253.2, y: 286.6 }, p4: { x: 80, y: 186.6 } };
  wrapper.getBoxQuads = () => [quad]; image.getBoxQuads = () => [quad];
  return { area, wrapper, image };
}

it("is disabled unless local editor mode is explicitly opted in", () => {
  fixture(); window.sessionStorage.clear();
  expect(compositionGeometryRecorderEnabled(window, document)).toBe(false);
  window.sessionStorage.setItem("wz:composition-geometry-recorder", "1");
  expect(compositionGeometryRecorderEnabled(window, document)).toBe(true);
  document.querySelector("script").dataset.previewMode = "standalone";
  expect(compositionGeometryRecorderEnabled(window, document)).toBe(false);
  expect(compositionGeometryRecorderEnabled({ location: { hostname: "example.test" }, sessionStorage: window.sessionStorage }, document)).toBe(false);
});

it("records canonical sync, rendered corners and event order without mutating source geometry", () => {
  const { wrapper, image } = fixture(), beforeStyle = wrapper.getAttribute("style"), beforeFrame = wrapper.dataset.compositionFrame;
  recorder = createCompositionGeometryRecorder({ window, document, selected: () => "image-a" });
  recorder.captureSync({ resolvedCompositionAreas: { area: { placements: { "image-a": {
    frame: JSON.parse(beforeFrame), rect: { left: 240, top: 160, width: 200, height: 100 },
  } } } }, revisions: { "image-a": "rev-1" } }, "before");
  recorder.capture("pivot-edit-start");
  recorder.capture("rotation-pointerup");
  const report = recorder.report();
  expect(report.events.map(event => event.label)).toEqual(["composition-sync-before", "pivot-edit-start", "rotation-pointerup"]);
  expect(report.events[0].canonical).toMatchObject({ frame: { rotation: 30, rotationPivot: { x: 0.25, y: 0.75 } }, rect: { width: 200, height: 100 }, revision: "rev-1" });
  expect(report.events[0].wrapper.corners.source).toBe("getBoxQuads");
  expect(report.events[0].image.corners.points).toHaveLength(4);
  expect(report.events[0].area.scale).toBe(0.5);
  expect(report.firstDisagreement).toMatchObject({ order: 1, label: "composition-sync-before", pair: "outlineToWrapper" });
  expect(wrapper.getAttribute("style")).toBe(beforeStyle);
  expect(wrapper.dataset.compositionFrame).toBe(beforeFrame);
  expect(JSON.stringify(report)).not.toContain("private image alt text");
  expect(JSON.stringify(report)).not.toContain("data:image/png");
  expect(image.src).toContain("data:image/png");
});

it("bounds the event buffer, reports drops and exposes compact JSON export helpers", () => {
  fixture();
  recorder = createCompositionGeometryRecorder({ window, document, selected: () => "image-a", maxEvents: 2 });
  recorder.capture("first"); recorder.capture("second"); recorder.capture("third");
  const api = installCompositionGeometryRecorderApi(window, recorder);
  expect(api.report().buffer).toEqual({ retained: 2, dropped: 1 });
  expect(api.report().events.map(event => event.label)).toEqual(["second", "third"]);
  expect(JSON.parse(api.json()).format).toBe("wz-composition-geometry-diagnostic-v1");
  expect(api.clear()).toBeUndefined();
  expect(api.report().buffer).toEqual({ retained: 0, dropped: 0 });
});

it("samples pointer movement at a bounded rate and records interaction labels", async () => {
  fixture();
  recorder = createCompositionGeometryRecorder({ window, document, selected: () => "image-a", moveIntervalMs: 100 });
  const pivot = document.querySelector("[data-rotation-pivot]");
  pivot.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
  document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
  document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  await Promise.resolve();
  expect(recorder.report().events.map(event => event.label)).toEqual(["pivot-pointerdown", "pivot-pointermove", "pivot-pointerup"]);
});

it("correlates composition messages with editor acceptance results", () => {
  fixture(); recorder = createCompositionGeometryRecorder({ window, document, selected: () => "image-a" });
  const outgoing = recorder.decorateMessage({ type: "COMPOSITION_PIVOT", payload: { widgetId: "image-a", rotationPivot: { x: 0.3, y: 0.7 } } });
  expect(outgoing.diagnosticId).toMatch(/^geometry-/);
  const diagnostics = { expectedRevision: "rev-2", receivedRevision: "rev-1", canonicalFrame: { rotation: 15 } };
  recorder.recordResult({ diagnosticId: outgoing.diagnosticId, messageType: outgoing.type, accepted: false,
    reason: "stale-composition-revision", diagnostics });
  expect(recorder.report().events.map(event => event.label)).toEqual(["composition_pivot-sent", "composition_pivot-result"]);
  expect(recorder.report().events[1].detail).toMatchObject({ accepted: false, reason: "stale-composition-revision", diagnostics });
});

it("does not classify an axis-aligned fallback as a transformed-corner disagreement", () => {
  const { wrapper, image } = fixture();
  wrapper.getBoxQuads = undefined; image.getBoxQuads = undefined;
  recorder = createCompositionGeometryRecorder({ window, document, selected: () => "image-a" });
  const record = recorder.capture("fallback-capture");
  expect(record.wrapper.corners.source).toBe("axis-aligned-bounds-fallback");
  expect(record.comparison.wrapperToImage).toMatchObject({ comparable: false,
    reason: "axis-aligned-bounds-is-not-transformed-corners" });
  expect(recorder.report().firstDisagreement).toBeNull();
});

it("derives transformed DOM corners for cardinal and diagonal 2D rotations", () => {
  const { wrapper } = fixture(); wrapper.getBoxQuads = undefined;
  const originalRaf = window.requestAnimationFrame, originalCancel = window.cancelAnimationFrame;
  const rotations = [0, 45, 90, -47.161, 180];
  for (const degrees of rotations) {
    const radians = degrees * Math.PI / 180, a = Math.cos(radians), b = Math.sin(radians), c = -b, d = a;
    wrapper.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`;
    const raw = [[0, 0], [200, 0], [200, 100], [0, 100]].map(([x, y]) => [a * x + c * y, b * x + d * y]);
    const minX = Math.min(...raw.map(point => point[0])), minY = Math.min(...raw.map(point => point[1]));
    wrapper.getBoundingClientRect = () => ({ left: 500 + minX, top: 300 + minY, right: 500 + minX + Math.max(...raw.map(point => point[0])) - minX,
      bottom: 300 + minY + Math.max(...raw.map(point => point[1])) - minY, width: Math.max(...raw.map(point => point[0])) - minX,
      height: Math.max(...raw.map(point => point[1])) - minY });
    const result = transformedCorners(wrapper, window);
    expect(result.source).toBe("dom-transform-chain");
    expect(result.points.map(point => [point.x, point.y])).toEqual(raw.map(([x, y]) => [expect.closeTo(500 + x, 5), expect.closeTo(300 + y, 5)]));
  }
  window.requestAnimationFrame = originalRaf; window.cancelAnimationFrame = originalCancel;
});

it("captures bounded animation frames only when opted in during an active pivot drag", async () => {
  const { wrapper } = fixture();
  const raf = new Map(); let rafId = 0;
  vi.stubGlobal("requestAnimationFrame", callback => { raf.set(++rafId, callback); return rafId; });
  vi.stubGlobal("cancelAnimationFrame", id => raf.delete(id));
  wrapper.getBoxQuads = () => [{ p1: { x: 130, y: 100 }, p2: { x: 303.2, y: 200 }, p3: { x: 253.2, y: 286.6 }, p4: { x: 80, y: 186.6 } }];
  recorder = createCompositionGeometryRecorder({ window, document, selected: () => "image-a", maxFrames: 6 });
  recorder.captureSync({ resolvedCompositionAreas: { area: { placements: { "image-a": {
    frame: { rotation: 30, rotationPivot: { x: 0.25, y: 0.75 } }, rect: { left: 240, top: 160, width: 200, height: 100 },
  } } } }, revisions: { "image-a": "rev-1" } }, "before");
  const pivot = document.querySelector("[data-rotation-pivot]");
  const pointerEvent = (type, x, y) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: 7 }); return event;
  };
  pivot.dispatchEvent(pointerEvent("pointerdown", 300, 220));
  pivot.dispatchEvent(pointerEvent("pointermove", 310, 225));
  expect(recorder.status()).toMatchObject({ frameCaptureEnabled: false, retainedFrames: 0 });
  expect(raf.size).toBe(0);
  expect(recorder.setFrameCapture(true)).toBe(true);
  expect(raf.size).toBe(1);
  await Promise.resolve();
  const runFrame = timestamp => { const [id, callback] = raf.entries().next().value; raf.delete(id); callback(timestamp); };
  runFrame(16); runFrame(32);
  pivot.dispatchEvent(pointerEvent("pointermove", 320, 235));
  runFrame(48);
  pivot.dispatchEvent(pointerEvent("pointerup", 320, 235));
  await Promise.resolve(); await Promise.resolve();
  expect(raf.size).toBe(0);
  const report = recorder.report();
  expect(report.frames).toHaveLength(5);
  expect(report.frames.map(frame => frame.frameNumber)).toEqual([1, 2, 3, 4, 5]);
  expect(report.frames[1]).toMatchObject({ phase: "pivot-drag-frame", pointer: { id: 7, x: 310, y: 225 },
    wrapper: { corners: { source: "getBoxQuads" }, axisAlignedBounds: { left: 130 } },
    canonical: { available: true, revision: "rev-1", frame: { rotation: 30 } } });
  expect(report.frames[1].image.corners.points).toHaveLength(4);
  expect(report.frames[0].phase).toBe("pivot-drag-start");
  expect(report.frames[4].phase).toBe("pivot-drag-end");
  expect(report.frames[0].at).toMatch(/^\d{4}-\d\d-\d\dT/);
  expect(report.events.map(event => event.label)).toContain("pivot-drag-start");
  expect(report.events.map(event => event.label)).toContain("pivot-drag-end");
  expect(recorder.status()).toMatchObject({ frameCaptureEnabled: true, retainedFrames: 5, frameCaptureTruncated: false });
  const exported = JSON.parse(installCompositionGeometryRecorderApi(window, recorder).json());
  expect(exported.events.length).toBeGreaterThan(0);
  expect(exported.frames).toHaveLength(5);
  recorder.stop(); expect(raf.size).toBe(0);
});

it("stops its animation-frame loop at the configured frame limit", async () => {
  fixture(); const raf = new Map(); let rafId = 0;
  vi.stubGlobal("requestAnimationFrame", callback => { raf.set(++rafId, callback); return rafId; });
  vi.stubGlobal("cancelAnimationFrame", id => raf.delete(id));
  recorder = createCompositionGeometryRecorder({ window, document, selected: () => "image-a", maxFrames: 1 });
  recorder.setFrameCapture(true); const pivot = document.querySelector("[data-rotation-pivot]");
  const event = (type, x, y) => { const value = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(value, "pointerId", { value: 3 }); return value; };
  pivot.dispatchEvent(event("pointerdown", 100, 100)); pivot.dispatchEvent(event("pointermove", 110, 110));
  await Promise.resolve(); await Promise.resolve();
  expect(recorder.report().frames).toHaveLength(1);
  expect(recorder.status()).toMatchObject({ frameCaptureEnabled: false, frameCaptureTruncated: true, retainedFrames: 1 });
  expect(raf.size).toBe(0);
  recorder.stop();
});
