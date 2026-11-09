// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { compositionAdapters } from "@widgetizer/core/compositionImage";
import { compositionRevision } from "@widgetizer/core/composition";
import { createWyrmetizerCopy, convertWyrmetizerPageToV3, openWyrmetizerEditorPage, serializeWyrmetizerEditorPage } from "@widgetizer/core/wyrmetizerLayouts";
import { fixture } from "../../../../../core/src/runtime/__tests__/compositionFixture.js";
import schema from "../../../../../../themes/arch/widgets/image/schema.json";
import SelectionOverlay from "../SelectionOverlay";
import usePageStore from "../../../stores/pageStore";
import useWidgetStore from "../../../stores/widgetStore";
import saveStore from "../../../stores/saveStore";
import useToastStore from "../../../stores/toastStore";
import { compositionInteractionContext } from "../../../lib/compositionActions";
import { getPreviewTargetOrigin } from "../../../lib/previewBase";

globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};

afterEach(() => { vi.useRealTimers(); useToastStore.getState().clearToasts(); });

function pageV3() {
  const page = convertWyrmetizerPageToV3(createWyrmetizerCopy(fixture(), compositionAdapters), compositionAdapters);
  page.widgets.a.settings.name = "Alpha";
  for (const id of ["a", "b"]) {
    const dimensions = page.layout.areas.canvas.composition.presentation[id].image_transform.dimensions;
    dimensions.width.value = null;
    dimensions.height.value = null;
  }
  return page;
}

function harness() {
  const postMessage = vi.fn();
  const iframe = {
    contentWindow: { innerWidth: 1200, postMessage },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const iframeRef = { current: iframe };
  return { postMessage, iframeRef };
}

function configure(page, imageGeometry = Object.fromEntries(["a", "b"].map(id => [id, {
  imageSource: "/uploads/images/photo.jpg", naturalWidth: 300, naturalHeight: 200,
  width: 300, height: 200, containerWidth: 1200,
}]))) {
  usePageStore.getState().setPage(page);
  useWidgetStore.setState({
    schemas: { image: { ...schema, displayName: "Image" } },
    compositionContext: "desktop",
    imageGeometry,
  });
}

function dispatchGeometry(iframeRef, payload) {
  const event = new Event("message");
  Object.assign(event, { source: iframeRef.current.contentWindow, origin: getPreviewTargetOrigin(),
    data: { type: "IMAGE_GEOMETRY_CONTEXT", payload } });
  window.dispatchEvent(event);
}

function measurement(widgetId, sync, changes = {}) {
  return { widgetId, width: 390, height: 219.375, containerWidth: 390,
    naturalWidth: 512, naturalHeight: 512, imageSource: "/uploads/images/photo.jpg",
    presentation: sync.presentation, presentationEpoch: sync.presentationEpoch, syncRevision: sync.syncRevision,
    interactionContext: compositionInteractionContext(), ...changes };
}

it("uses matching intrinsic image dimensions and reports invalid bounds without a partial sync", () => {
  const page = pageV3();
  configure(page);
  const { postMessage, iframeRef } = harness();
  render(<SelectionOverlay iframeRef={iframeRef} />);

  expect(postMessage.mock.calls.some(([message]) => message.type === "COMPOSITION_SYNC")).toBe(true);
  expect(useToastStore.getState().toasts).toHaveLength(0);

  postMessage.mockClear();
  const invalid = structuredClone(page);
  invalid.layout.areas.canvas.composition.geometry.placements.a.frames.desktop.x = 0.99;
  act(() => usePageStore.getState().setPage(invalid));

  expect(postMessage.mock.calls.some(([message]) => ["COMPOSITION_SYNC", "SET_IMAGE_RESIZE_SUPPORT"].includes(message.type))).toBe(false);
  expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
    variant: "error",
    message: expect.stringContaining('Widget “Alpha” in Composition Area “canvas”'),
  });
  expect(useToastStore.getState().toasts.at(-1).message).toMatch(/adjust its size or position|increase the Area height/i);
  expect(serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters))
    .toEqual(serializeWyrmetizerEditorPage(invalid, compositionAdapters));
});

it("reports a trusted rejection and forces canonical preview sync to clear its live draft", () => {
  const page = createWyrmetizerCopy(fixture(), compositionAdapters);
  configure(page);
  useWidgetStore.setState({ compositionContext: "desktop", selectedWidgetId: "a", selectedBlockId: null });
  const { postMessage, iframeRef } = harness();
  render(<SelectionOverlay iframeRef={iframeRef} />);
  postMessage.mockClear();
  const origin = getPreviewTargetOrigin();
  const dispatchMessage = data => {
    const event = new Event("message");
    Object.assign(event, { source: iframeRef.current.contentWindow, origin, data });
    window.dispatchEvent(event);
  };
  act(() => dispatchMessage({ type: "WZ_COMPOSITION_GEOMETRY_RECORDER_READY" }));
  act(() => dispatchMessage({ type: "COMPOSITION_ROTATE", diagnosticId: "geometry-1", payload: {
      widgetId: "a", compositionId: "canvas", interactionContext: "stale-context",
      startRevision: "stale-revision", startFrame: { rotation: 0 }, frame: { rotation: 45 },
    } }));

  const result = postMessage.mock.calls.map(([message]) => message).find(message => message.type === "WZ_COMPOSITION_GEOMETRY_RECORDER_RESULT");
  expect(result.payload).toMatchObject({ accepted: false, reason: "interaction-context-stale",
    diagnostics: { widgetId: "a", compositionId: "canvas", presentation: "desktop" } });
  expect(postMessage.mock.calls.map(([message]) => message).some(message => message.type === "COMPOSITION_SYNC" && message.force === true)).toBe(true);
});

it("synchronizes the authored Desktop frame and revision used by transaction validation", () => {
  const page = openWyrmetizerEditorPage(pageV3(), compositionAdapters);
  configure(page);
  useWidgetStore.setState({ compositionContext: "desktop", selectedWidgetId: "a", selectedBlockId: null });
  const { postMessage, iframeRef } = harness();
  render(<SelectionOverlay iframeRef={iframeRef} />);
  const sync = postMessage.mock.calls.map(([message]) => message).find(message => message.type === "COMPOSITION_SYNC");
  const frame = page.layout.compositions.canvas.placements.a.frames.desktop;
  expect(sync.resolvedPresentation.areas.canvas.placements.a.frame).toEqual(frame);
  expect(sync.revisions.a).toBe(compositionRevision(page.widgets.a, frame));
  const event = new Event("message");
  Object.assign(event, { source: iframeRef.current.contentWindow, origin: getPreviewTargetOrigin(), data: {
    type: "COMPOSITION_ROTATE", payload: { widgetId: "a", compositionId: "canvas", interactionContext: sync.context,
      startRevision: sync.revisions.a, startFrame: frame, frame: { ...frame, rotation: 25 },
      presentation: sync.presentation, presentationEpoch: sync.presentationEpoch, syncRevision: sync.syncRevision },
  } });
  act(() => window.dispatchEvent(event));
  expect(usePageStore.getState().page.layout.compositions.canvas.placements.a.frames.desktop.rotation).toBe(25);
});

it("coalesces delayed matching natural dimensions into one responsive sync without editing the page", async () => {
  const page = pageV3();
  page.layout.areas.canvas.composition.geometry.placements.b.frames.desktop.x = 0;
  const mobileTransform = structuredClone(page.layout.areas.canvas.composition.presentation.a.image_transform);
  mobileTransform.dimensions = { width: { unit: "px", value: 200 }, height: { unit: "px", value: null } };
  page.layout.mobile.areas = { canvas: { composition: { presentation: { a: { image_transform: mobileTransform } } } } };
  const placement = page.layout.areas.canvas.composition.geometry.placements.a;
  placement.version = 3;
  placement.frames.desktop.rotation = 8;
  placement.frames.desktop.rotationPivot = { x: 0.3, y: 0.6 };
  configure(page, Object.fromEntries(["a", "b"].map(id => [id, {
    imageSource: "/uploads/images/photo.jpg", naturalWidth: 0, naturalHeight: 0,
    width: 390, height: 219.375, containerWidth: 390,
  }])));
  usePageStore.temporal.getState().clear();
  saveStore.setState({ structureModified: false, modifiedWidgets: new Set() });
  const savedBefore = serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters);
  const { postMessage, iframeRef } = harness();
  iframeRef.current.contentWindow.innerWidth = 390;
  render(<SelectionOverlay iframeRef={iframeRef} />);
  const initialSync = postMessage.mock.calls.map(([message]) => message).find(message => message.type === "COMPOSITION_SYNC");
  expect(initialSync.resolvedPresentation.areas.canvas.placements.b.rect.height).toBeCloseTo(219.375, 3);
  postMessage.mockClear();
  vi.useFakeTimers();

  act(() => {
    dispatchGeometry(iframeRef, measurement("a", initialSync));
    dispatchGeometry(iframeRef, measurement("b", initialSync));
  });
  await act(async () => { await vi.runOnlyPendingTimersAsync(); });

  const responsiveSyncs = postMessage.mock.calls.map(([message]) => message)
    .filter(message => message.type === "COMPOSITION_SYNC" && message.responsive === true);
  expect(responsiveSyncs).toHaveLength(1);
  expect(responsiveSyncs[0].resolvedPresentation.areas.canvas.placements.b.rect).toMatchObject({ width: 390, height: 390 });
  expect(responsiveSyncs[0].resolvedPresentation.areas.canvas.placements.a.frame.rotationPivot).toEqual({ x: 0.3, y: 0.6 });
  expect(useWidgetStore.getState().imageGeometry.a).toMatchObject({ naturalWidth: 512, naturalHeight: 512 });
  expect(serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters)).toEqual(savedBefore);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(0);
  expect(saveStore.getState().structureModified).toBe(false);
  expect(saveStore.getState().modifiedWidgets.size).toBe(0);

  postMessage.mockClear();
  act(() => {
    dispatchGeometry(iframeRef, measurement("a", responsiveSyncs[0]));
    dispatchGeometry(iframeRef, measurement("b", responsiveSyncs[0]));
  });
  await act(async () => { await vi.runOnlyPendingTimersAsync(); });
  expect(postMessage.mock.calls.some(([message]) => message.type === "COMPOSITION_SYNC")).toBe(false);
});

it("ignores stale source, page, presentation and sync-revision measurements", () => {
  const page = pageV3();
  configure(page);
  usePageStore.temporal.getState().clear();
  saveStore.setState({ structureModified: false, modifiedWidgets: new Set() });
  const { postMessage, iframeRef } = harness();
  render(<SelectionOverlay iframeRef={iframeRef} />);
  const sync = postMessage.mock.calls.map(([message]) => message).find(message => message.type === "COMPOSITION_SYNC");
  const before = structuredClone(useWidgetStore.getState().imageGeometry);
  postMessage.mockClear();
  act(() => {
    dispatchGeometry(iframeRef, measurement("a", sync, { imageSource: "/uploads/images/old-source.jpg" }));
    dispatchGeometry(iframeRef, measurement("a", sync, { interactionContext: "old-project:old-page" }));
    dispatchGeometry(iframeRef, measurement("a", sync, { presentation: "mobile" }));
    dispatchGeometry(iframeRef, measurement("a", sync, { syncRevision: sync.syncRevision - 1 }));
  });
  expect(useWidgetStore.getState().imageGeometry).toEqual(before);
  expect(postMessage.mock.calls.some(([message]) => message.type === "COMPOSITION_SYNC")).toBe(false);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(0);
  expect(saveStore.getState().structureModified).toBe(false);
});

it("rechecks delayed dimensions and rejects invalid responsive geometry without changing authored data", async () => {
  const page = pageV3();
  configure(page);
  const { postMessage, iframeRef } = harness();
  render(<SelectionOverlay iframeRef={iframeRef} />);
  const initialSync = postMessage.mock.calls.map(([message]) => message).find(message => message.type === "COMPOSITION_SYNC");
  const invalid = structuredClone(page);
  invalid.layout.areas.canvas.composition.geometry.placements.a.frames.desktop.x = 0.99;
  act(() => usePageStore.getState().setPage(invalid));
  usePageStore.temporal.getState().clear();
  saveStore.setState({ structureModified: false, modifiedWidgets: new Set() });
  postMessage.mockClear();
  vi.useFakeTimers();

  act(() => dispatchGeometry(iframeRef, measurement("a", initialSync)));
  await act(async () => { await vi.runOnlyPendingTimersAsync(); });

  expect(postMessage.mock.calls.some(([message]) => message.type === "COMPOSITION_SYNC")).toBe(false);
  expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ variant: "error", message: expect.stringContaining("extends beyond the Area") });
  expect(serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters))
    .toEqual(serializeWyrmetizerEditorPage(invalid, compositionAdapters));
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(0);
  expect(saveStore.getState().structureModified).toBe(false);
});
