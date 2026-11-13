import { compositionRevision, compositionRect } from "@widgetizer/core/composition";
import { resolveWyrmetizerPresentation } from "@widgetizer/core/wyrmetizerPresentation";
import { rotatedPoint } from "@widgetizer/core/rotationGeometry";
import { transformRect } from "@widgetizer/core/imageTransform";
import { convertWyrmetizerPageToV3, createWyrmetizerCopy, openWyrmetizerEditorPage, serializeWyrmetizerEditorPage, initializeWyrmetizerPage, resolveWyrmetizerPage } from "@widgetizer/core/wyrmetizerLayouts";
import { compositionAdapters } from "@widgetizer/core/compositionImage";
import { renderPageContent } from "../../../../render-engine/src/compositionRenderer.js";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import schema from "../../../../../themes/arch/widgets/image/schema.json";
import { fixture } from "../../../../core/src/runtime/__tests__/compositionFixture.js";
vi.mock("../../queries/pageManager", () => ({ getPage: vi.fn() }));
vi.mock("../../queries/previewManager", () => ({ getGlobalWidgets: vi.fn(), getProjectWidgets: vi.fn() }));
vi.mock("../../stores/themeStore", () => ({ default: { getState: () => ({ settings: {} }) } }));
import usePageStore from "../../stores/pageStore";
import useWidgetStore from "../../stores/widgetStore";
import useAutoSave from "../../stores/saveStore";
import { handleImageResizeMessage } from "../imageResizeBridge";
import {
  applyCompositionGeometry,
  compositionInteractionContext,
  layerImage,
  handleCompositionMessage,
  handleCompositionMessageDetailed,
  reorderContentBlock,
  handleOrderingMessage,
  handleCompositionLockMessage,
  getCompositionMovementLocks,
  returnCompositionToFlow,
  rotateCompositionImage,
  switchPairedCompositionMode,
  setCompositionRotationPivot,
  convertImages,
  createEmptyCompositionArea,
  deleteCompositionArea,
  addImagesToComposition,
  removeImageFromComposition,
  beginMobilePresentationTransaction,
  stageMobilePresentationValue,
  cancelMobilePresentationTransaction,
  commitMobilePresentationTransaction,
  resetMobilePresentationProperty,
  resetMobileWidgetPresentation,
  resetMobileModePresentation,
  customizeMobileCompositionLayout,
  setMobileCompositionPlacement,
} from "../compositionActions";
beforeEach(() => {
  const page = fixture();
  page.widgets.a.settings.image_transform.anchors = ["ne"];
  usePageStore.setState({ page, originalPage: structuredClone(page), globalWidgets: {} });
  usePageStore.temporal.getState().clear();
  useWidgetStore.setState({
    compositionContext: "desktop",
    compositionMovementLocks: {},
    schemas: { image: schema },
    selectedCompositionId: null,
    selectedWidgetId: "a",
    selectedBlockId: null,
    imageGeometry: { a: { containerWidth: 1200, width: 1200, height: 675, imageSource: "" } },
  });
});
afterEach(() => useAutoSave.getState().stopAutoSave());
function v3WithStandaloneImage(mobilePatch) {
  const page = convertWyrmetizerPageToV3(createWyrmetizerCopy(fixture(), compositionAdapters), compositionAdapters);
  const desktopView = resolveWyrmetizerPage(page);
  page.widgets.c = structuredClone(desktopView.widgets.a);
  page.widgetsOrder.push("c");
  page.layout.contentOrder.push({ kind: "widget", id: "c" });
  page.layout.mobile.rootOrder = [
    ...page.layout.contentOrder.map(entry => structuredClone(entry)),
  ];
  page.layout.mobile.presentation = { c: mobilePatch };
  const transform = structuredClone(page.layout.areas.canvas.composition.presentation.a.image_transform);
  transform.dimensions = {
    width: { unit: "px", value: 100 },
    height: { unit: "px", value: 70 },
  };
  page.layout.mobile.areas = { canvas: { composition: { presentation: {
    a: { image_transform: transform }, b: { image_transform: transform },
  } } } };
  return { canonical: page, editor: openWyrmetizerEditorPage(page, compositionAdapters) };
}
it("orders a Flow parent as one root and its children within the Area with atomic history and persisted rendering", async () => {
  usePageStore.getState().setPage(createWyrmetizerCopy(fixture(), compositionAdapters));
  switchPairedCompositionMode("canvas", "flow");
  const before = structuredClone(usePageStore.getState().page);
  usePageStore.temporal.getState().clear();
  const iframe = {}, origin = "https://preview.example";
  const event = (scope, id, direction) => ({ source: iframe, origin, data: { type: "ORDER_SELECTION", payload: { scope, id, direction } } });
  useWidgetStore.getState().setSelectedWidgetId("b");
  expect(handleOrderingMessage(event("widget", "b", "down"), iframe, origin)).toBe(false);
  expect(handleOrderingMessage(event("widget", "b", "up"), iframe, origin)).toBe(true);
  useWidgetStore.getState().setSelectedCompositionId("canvas");
  expect(handleOrderingMessage(event("composition", "canvas", "down"), iframe, origin)).toBe(true);
  const after = structuredClone(usePageStore.getState().page);
  const saved = serializeWyrmetizerEditorPage(after, compositionAdapters);
  expect(saved.layout.contentOrder).toEqual([{ kind: "widget", id: "after" }, { kind: "area", id: "canvas" }]);
  expect(saved.layout.areas.canvas.flow.order).toEqual(["b", "a"]);
  expect(saved.layout.areas.canvas.composition).toEqual(before.wyrmetizerEditorLayout.areas.canvas.composition);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(2);
  const html = await renderPageContent(after, id => `<div data-widget-id="${id}"></div>`);
  expect(html).toContain('<div data-widget-id="after"></div><section data-composition-id="canvas"');
  expect(html.indexOf('data-widget-id="b"')).toBeLessThan(html.indexOf('data-widget-id="a"'));
  usePageStore.temporal.getState().undo(); usePageStore.temporal.getState().undo();
  expect(usePageStore.getState().page).toEqual(before);
  usePageStore.temporal.getState().redo(); usePageStore.temporal.getState().redo();
  expect(usePageStore.getState().page).toEqual(after);
  usePageStore.getState().setPage(JSON.parse(JSON.stringify(saved)));
  expect(await renderPageContent(usePageStore.getState().page, id => `<div data-widget-id="${id}"></div>`)).toBe(html);
});
it("records each container lifecycle and membership operation atomically and persists the full sequence", () => {
  const flow = fixture();
  delete flow.layout;
  usePageStore.getState().setPage(initializeWyrmetizerPage(flow, compositionAdapters));
  usePageStore.temporal.getState().clear();
  useAutoSave.setState({ structureModified: false });
  const snapshots = [structuredClone(usePageStore.getState().page)];
  const record = action => {
    action();
    snapshots.push(structuredClone(usePageStore.getState().page));
    expect(usePageStore.temporal.getState().pastStates).toHaveLength(snapshots.length - 1);
    const saved = serializeWyrmetizerEditorPage(snapshots.at(-1), compositionAdapters);
    expect(saved.wyrmetizerEditorLayout).toBeUndefined();
    usePageStore.getState().setPage(JSON.parse(JSON.stringify(saved)));
    expect(usePageStore.getState().page).toEqual(snapshots.at(-1));
  };
  record(() => expect(createEmptyCompositionArea({ index: 1, height: 1000 })).toBe(true));
  const id = Object.keys(usePageStore.getState().page.wyrmetizerEditorLayout.areas)[0];
  expect(usePageStore.getState().page.layout.contentOrder[1]).toEqual({ kind: "composition", id });
  record(() => expect(addImagesToComposition(id, ["a", "b"])).toBe(true));
  record(() => expect(removeImageFromComposition(id, "a")).toBe(true));
  record(() => useWidgetStore.getState().deleteWidget("b"));
  expect(usePageStore.getState().page.layout.compositions[id].childrenOrder).toEqual([]);
  record(() => expect(addImagesToComposition(id, ["a"])).toBe(true));
  useWidgetStore.getState().setSelectedCompositionId(id);
  record(() => expect(deleteCompositionArea(id)).toBe(true));
  expect(useWidgetStore.getState().selectedCompositionId).toBeNull();
  expect(useAutoSave.getState().structureModified).toBe(true);
  expect(usePageStore.getState().page.widgets.a).toEqual(flow.widgets.a);
  expect(usePageStore.getState().page.widgets.b).toBeUndefined();
  expect(usePageStore.getState().page.widgets.after).toEqual(flow.widgets.after);
  expect(deleteCompositionArea(id)).toBe(false);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(snapshots.length - 1);
  for (let i = snapshots.length - 2; i >= 0; i--) {
    usePageStore.temporal.getState().undo();
    expect(usePageStore.getState().page).toEqual(snapshots[i]);
  }
  for (let i = 1; i < snapshots.length; i++) {
    usePageStore.temporal.getState().redo();
    expect(usePageStore.getState().page).toEqual(snapshots[i]);
  }
});
it("keeps lifecycle actions behind legacy copy-first conversion and rejects invalid creation atomically", () => {
  const before = structuredClone(usePageStore.getState().page);
  expect(() => createEmptyCompositionArea()).toThrow(/paired-layout copy/);
  expect(() => deleteCompositionArea("canvas")).toThrow(/paired-layout copy/);
  expect(usePageStore.getState().page).toEqual(before);
  usePageStore.getState().setPage(createWyrmetizerCopy(before, compositionAdapters));
  usePageStore.temporal.getState().clear();
  const paired = structuredClone(usePageStore.getState().page);
  expect(() => createEmptyCompositionArea({ height: -1 })).toThrow();
  expect(usePageStore.getState().page).toEqual(paired);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(0);
});
it("deletes a Flow-mode container atomically using its authored order and geometry", () => {
  usePageStore.getState().setPage(createWyrmetizerCopy(fixture(), compositionAdapters));
  switchPairedCompositionMode("canvas", "flow");
  const page = structuredClone(usePageStore.getState().page);
  page.widgetsOrder = ["b", "a", "after"];
  page.widgets.a.settings.image_transform.dimensions.width.value = 177;
  usePageStore.getState().setPage(page);
  const before = structuredClone(usePageStore.getState().page);
  usePageStore.temporal.getState().clear();
  expect(deleteCompositionArea("canvas")).toBe(true);
  const after = structuredClone(usePageStore.getState().page);
  expect(after.widgetsOrder).toEqual(["b", "a", "after"]);
  expect(after.widgets).toEqual(before.widgets);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  usePageStore.temporal.getState().undo(); expect(usePageStore.getState().page).toEqual(before);
  usePageStore.temporal.getState().redo(); expect(usePageStore.getState().page).toEqual(after);
});
it("deletes an empty Area in one history step without changing independent Widgets", () => {
  const flow = fixture(); delete flow.layout;
  usePageStore.getState().setPage(initializeWyrmetizerPage(flow, compositionAdapters));
  createEmptyCompositionArea({ index: 1 });
  const before = structuredClone(usePageStore.getState().page);
  const id = Object.keys(before.wyrmetizerEditorLayout.areas)[0];
  usePageStore.temporal.getState().clear();
  expect(deleteCompositionArea(id)).toBe(true);
  expect(usePageStore.getState().page.widgets).toEqual(flow.widgets);
  expect(usePageStore.getState().page.widgetsOrder).toEqual(flow.widgetsOrder);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  usePageStore.temporal.getState().undo(); expect(usePageStore.getState().page).toEqual(before);
});
it("creates paired Composition from authored Flow and retains independent edits across reloads", () => {
  const flow = fixture();
  delete flow.layout;
  flow.widgets.a.settings.top_spacing_px = 71;
  usePageStore.getState().setPage(initializeWyrmetizerPage(flow, compositionAdapters));
  expect(convertImages(["a", "b"], 1000)).toBe(true);
  let page = usePageStore.getState().page;
  const areaId = Object.keys(page.layout.compositions)[0];
  const initial = page.layout.compositions[areaId].placements.a.frames.desktop;
  expect(applyCompositionGeometry("a", { startFrame: initial, frame: { ...initial, x: 0.4, y: 0.2 } })).toBe(true);
  expect(rotateCompositionImage("a", 25)).toBe(true);
  expect(setCompositionRotationPivot("a", { x: 0.2, y: 0.8 })).toBe(true);
  page = usePageStore.getState().page;
  const startFrame = page.layout.compositions[areaId].placements.a.frames.desktop;
  expect(applyCompositionGeometry("a", { startFrame, frame: { ...startFrame, x: 0.5, y: 0.3 } })).toBe(true);
  expect(layerImage("a", "forward")).toBe(true);
  const composition = structuredClone(serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters).layout.areas[areaId].composition);
  expect(returnCompositionToFlow(areaId)).toBe(true);
  expect(usePageStore.getState().page.widgets).toEqual(flow.widgets);
  useWidgetStore.getState().updateWidgetSettingValues("a", { top_spacing_px: 93,
    image_transform: { ...flow.widgets.a.settings.image_transform, dimensions: { width: { unit: "px", value: 177 }, height: { unit: "px", value: 99 } } } });
  const authoredFlow = structuredClone(serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters).layout.areas[areaId].flow);
  for (let i = 0; i < 5; i++) {
    const saved = serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters);
    usePageStore.getState().setPage(JSON.parse(JSON.stringify(saved)));
    expect(switchPairedCompositionMode(areaId, "composition")).toBe(true);
    expect(serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters).layout.areas[areaId].composition).toEqual(composition);
    expect(() => convertImages(["a"], 1000)).toThrow(/already has/);
    expect(returnCompositionToFlow(areaId)).toBe(true);
    expect(serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters).layout.areas[areaId].flow).toEqual(authoredFlow);
  }
});
it("commits existing-Area root Mobile transfers as one reversible editor action", () => {
  const { canonical, editor } = v3WithStandaloneImage({ fullwidth: false, top_spacing_px: 0 });
  const desktopBefore = structuredClone(canonical.layout.areas.canvas.composition);
  usePageStore.getState().setPage(editor);
  usePageStore.temporal.getState().clear();
  useAutoSave.setState({ structureModified: false, modifiedWidgets: new Set() });

  expect(addImagesToComposition("canvas", ["c"])).toBe(true);
  const saved = serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters);

  expect(saved.layout.mobile.presentation?.c).toBeUndefined();
  expect(saved.layout.mobile.areas.canvas.flow.presentation.c).toEqual({ fullwidth: false, top_spacing_px: 0 });
  expect(saved.layout.mobile.areas.canvas.composition.presentation.c).toEqual({ fullwidth: false, top_spacing_px: 0 });
  expect(saved.layout.mobile.rootOrder).toEqual([{ kind: "area", id: "canvas" }, { kind: "widget", id: "after" }]);
  expect(saved.layout.areas.canvas.composition.geometry.placements.a).toEqual(desktopBefore.geometry.placements.a);
  expect(saved.layout.areas.canvas.composition.geometry.placements.b).toEqual(desktopBefore.geometry.placements.b);
  expect(resolveWyrmetizerPresentation(saved, 390).widgets.c.settings).toMatchObject({ fullwidth: false, top_spacing_px: 0 });
  expect(serializeWyrmetizerEditorPage(openWyrmetizerEditorPage(JSON.parse(JSON.stringify(saved)), compositionAdapters), compositionAdapters)).toEqual(saved);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  expect(useAutoSave.getState().structureModified).toBe(true);
});
it("rejects a transferred Mobile size that exceeds bounds before changing editor state", () => {
  const { canonical } = v3WithStandaloneImage({ fullwidth: false });
  const desktopView = resolveWyrmetizerPage(canonical);
  canonical.widgets.d = structuredClone(desktopView.widgets.c);
  canonical.widgetsOrder.push("d");
  canonical.layout.contentOrder.push({ kind: "widget", id: "d" });
  canonical.layout.mobile.rootOrder.push({ kind: "widget", id: "d" });
  const oversized = structuredClone(canonical.widgets.d.settings.image_transform);
  oversized.dimensions = {
    width: { unit: "px", value: 400 },
    height: { unit: "px", value: 10000 },
  };
  canonical.layout.mobile.presentation.d = { image_transform: oversized };
  const invalidEditor = openWyrmetizerEditorPage(canonical, compositionAdapters);
  usePageStore.getState().setPage(invalidEditor);
  const before = structuredClone(usePageStore.getState().page);
  usePageStore.temporal.getState().clear();
  useAutoSave.setState({ structureModified: false, modifiedWidgets: new Set() });

  expect(() => addImagesToComposition("canvas", ["c", "d"]))
    .toThrow(/Cannot transfer these Widgets into the Area because their resolved Mobile layout is invalid/);
  expect(usePageStore.getState().page).toEqual(before);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(0);
  expect(useAutoSave.getState().structureModified).toBe(false);
});
it("customizes Mobile placement as one undoable action and keeps Desktop independent through save/reload", () => {
  const { canonical, editor } = v3WithStandaloneImage({ fullwidth: false });
  usePageStore.getState().setPage(editor);
  useWidgetStore.setState({ compositionContext: "mobile" });
  usePageStore.temporal.getState().clear();
  useAutoSave.setState({ structureModified: false, modifiedWidgets: new Set() });
  const mobileBefore = resolveWyrmetizerPresentation(canonical, 390);
  const desktopBefore = resolveWyrmetizerPresentation(canonical, 750);

  expect(customizeMobileCompositionLayout("canvas")).toBe(true);
  let saved = serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters);
  expect(saved.layout.mobile.areas.canvas.composition.geometry).toBeDefined();
  expect(resolveWyrmetizerPresentation(saved, 390).areas.canvas.geometry).toEqual(mobileBefore.areas.canvas.geometry);
  expect(resolveWyrmetizerPresentation(saved, 750)).toEqual(desktopBefore);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);

  usePageStore.temporal.getState().undo();
  expect(serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters).layout.mobile.areas?.canvas?.composition?.geometry).toBeUndefined();
  usePageStore.temporal.getState().redo();
  expect(setMobileCompositionPlacement("canvas", "a", "x", 100)).toBe(true);
  saved = serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters);
  expect(saved.layout.mobile.areas.canvas.composition.geometry.placements.a.x).toEqual({ value: 100, unit: "px" });
  expect(resolveWyrmetizerPresentation(saved, 750)).toEqual(desktopBefore);
  expect(serializeWyrmetizerEditorPage(openWyrmetizerEditorPage(JSON.parse(JSON.stringify(saved)), compositionAdapters), compositionAdapters)).toEqual(saved);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(2);
  expect(useAutoSave.getState().structureModified).toBe(true);

  const beforeInvalid = structuredClone(usePageStore.getState().page);
  expect(() => setMobileCompositionPlacement("canvas", "a", "x", 350))
    .toThrow(/Mobile placement would exceed the Area bounds/);
  expect(usePageStore.getState().page).toEqual(beforeInvalid);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(2);

  const after = structuredClone(usePageStore.getState().page);
  usePageStore.temporal.getState().undo();
  expect(serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters).layout.mobile.areas.canvas.composition.geometry.placements.a.x)
    .not.toEqual({ value: 100, unit: "px" });
  usePageStore.temporal.getState().redo();
  expect(usePageStore.getState().page).toEqual(after);
});
it("does not silently create paired geometry on an older Flow page", () => {
  const page = structuredClone(usePageStore.getState().page);
  delete page.layout;
  usePageStore.setState({ page });
  expect(() => convertImages(["a"])).toThrow(/paired-layout copy/);
  expect(usePageStore.getState().page).toEqual(page);
});
it("does not discard an older Composition when switching to Flow", () => {
  const before = structuredClone(usePageStore.getState().page);
  expect(() => returnCompositionToFlow("canvas")).toThrow(/paired-layout copy/);
  expect(usePageStore.getState().page).toEqual(before);
});
it("restores an authored paired position through switching, persistence and rendering", async () => {
  usePageStore.getState().setPage(createWyrmetizerCopy(fixture(), compositionAdapters));
  const startFrame = usePageStore.getState().page.layout.compositions.canvas.placements.a.frames.desktop;
  const frame = { ...startFrame, x: 0.6, y: 0.3 };
  expect(applyCompositionGeometry("a", { frame, startFrame })).toBe(true);
  const authored = structuredClone(usePageStore.getState().page.layout.compositions.canvas);
  for (let i = 0; i < 3; i++) {
    expect(returnCompositionToFlow("canvas")).toBe(true);
    const saved = serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters);
    expect(saved.layout.areas.canvas.composition.geometry).toEqual(authored);
    usePageStore.getState().setPage(JSON.parse(JSON.stringify(saved)));
    expect(switchPairedCompositionMode("canvas", "composition")).toBe(true);
    const restored = usePageStore.getState().page;
    expect(restored.layout.compositions.canvas).toEqual(authored);
    const html = await renderPageContent(restored, () => '<section data-composition-capability="image.v1" data-image-natural-width="1600" data-image-natural-height="900"><img></section>');
    expect(html).toContain('left:47.5%;top:45%');
  }
});
it("persists pivot edits and Reset Pivot without moving corners, with atomic Undo/Redo", () => {
  rotateCompositionImage("a", 30);
  const before = structuredClone(usePageStore.getState().page);
  const size = transformRect(before.widgets.a.settings.image_transform, useWidgetStore.getState().imageGeometry.a);
  const corners = page => {
    const frame = page.layout.compositions.canvas.placements.a.frames.desktop;
    const rect = compositionRect(frame, size.width, size.height, 1200);
    return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => rotatedPoint(rect, x, y, frame.rotation, frame.rotationPivot));
  };
  const originalCorners = corners(before);
  usePageStore.temporal.getState().clear();
  expect(setCompositionRotationPivot("a", { x: 0.2, y: 0.8 })).toBe(true);
  const after = structuredClone(usePageStore.getState().page);
  expect(after.layout.compositions.canvas.placements.a.version).toBe(3);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  corners(after).forEach((point, i) => { expect(point.x).toBeCloseTo(originalCorners[i].x, 8); expect(point.y).toBeCloseTo(originalCorners[i].y, 8); });
  usePageStore.temporal.getState().undo(); expect(usePageStore.getState().page).toEqual(before);
  usePageStore.temporal.getState().redo(); expect(usePageStore.getState().page).toEqual(after);
  expect(setCompositionRotationPivot("a", { x: 0.5, y: 0.5 })).toBe(true);
  const reset = JSON.parse(JSON.stringify(usePageStore.getState().page));
  corners(reset).forEach((point, i) => { expect(point.x).toBeCloseTo(originalCorners[i].x, 8); expect(point.y).toBeCloseTo(originalCorners[i].y, 8); });
  expect(setCompositionRotationPivot("a", { x: 0.5, y: 0.5 })).toBe(false);
  expect(setCompositionRotationPivot("a", { x: -1, y: 0.5 })).toBe(false);
});
it("commits a rotated image move through its own geometry channel and preserves rotation and pivot", () => {
  rotateCompositionImage("a", 37.25);
  expect(setCompositionRotationPivot("a", { x: 0.2, y: 0.8 })).toBe(true);
  usePageStore.temporal.getState().clear();
  const before = structuredClone(usePageStore.getState().page);
  const frame = before.layout.compositions.canvas.placements.a.frames.desktop;
  const iframe = {}, origin = "https://preview.example";
  const payload = {
    widgetId: "a", compositionId: "canvas", interactionContext: compositionInteractionContext(),
    startRevision: compositionRevision(before.widgets.a, frame), startFrame: frame,
    frame: { ...frame, x: frame.x + 0.08, y: frame.y + 0.04, pivot: { x: 0.5, y: 0.5 } },
  };
  expect(handleCompositionMessage({ source: iframe, origin, data: { type: "COMPOSITION_MOVE", payload } }, iframe, origin)).toBe(true);
  const moved = usePageStore.getState().page;
  expect(moved.layout.compositions.canvas.placements.a.frames.desktop).toMatchObject({
    rotation: 37.25, rotationPivot: { x: 0.2, y: 0.8 }, pivot: frame.pivot, x: payload.frame.x, y: payload.frame.y,
  });
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  usePageStore.temporal.getState().undo(); expect(usePageStore.getState().page).toEqual(before);
  usePageStore.temporal.getState().redo(); expect(usePageStore.getState().page).toEqual(moved);
  const saved = serializeWyrmetizerEditorPage(moved, compositionAdapters);
  usePageStore.getState().setPage(JSON.parse(JSON.stringify(saved)));
  expect(serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters)).toEqual(saved);
});
it("confirms a relocated pivot through the parent bridge and keeps rotation anchored after reload", () => {
  rotateCompositionImage("a", 30);
  const before = structuredClone(usePageStore.getState().page);
  const frame = before.layout.compositions.canvas.placements.a.frames.desktop;
  const iframe = {}, origin = "https://preview.example";
  const pivot = { x: 0.2, y: 0.8 };
  const payload = {
    widgetId: "a", compositionId: "canvas", interactionContext: compositionInteractionContext(),
    startRevision: compositionRevision(before.widgets.a, frame), startFrame: frame, rotationPivot: pivot,
  };
  usePageStore.temporal.getState().clear();
  expect(handleCompositionMessage({ source: iframe, origin, data: { type: "COMPOSITION_PIVOT", payload } }, iframe, origin)).toBe(true);
  const confirmed = structuredClone(usePageStore.getState().page);
  const confirmedFrame = confirmed.layout.compositions.canvas.placements.a.frames.desktop;
  expect(confirmedFrame).toMatchObject({ rotation: 30, rotationPivot: pivot });
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  const size = transformRect(confirmed.widgets.a.settings.image_transform, useWidgetStore.getState().imageGeometry.a);
  const rect = compositionRect(confirmedFrame, size.width, size.height, 1200);
  const initialRect = compositionRect(frame, size.width, size.height, 1200);
  [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([x, y]) => {
    const beforePoint = rotatedPoint(initialRect, x, y, frame.rotation);
    const afterPoint = rotatedPoint(rect, x, y, confirmedFrame.rotation, confirmedFrame.rotationPivot);
    expect(afterPoint.x).toBeCloseTo(beforePoint.x, 8);
    expect(afterPoint.y).toBeCloseTo(beforePoint.y, 8);
  });
  usePageStore.temporal.getState().undo(); expect(usePageStore.getState().page).toEqual(before);
  usePageStore.temporal.getState().redo(); expect(usePageStore.getState().page).toEqual(confirmed);
  const saved = serializeWyrmetizerEditorPage(confirmed, compositionAdapters);
  usePageStore.getState().setPage(JSON.parse(JSON.stringify(saved)));
  expect(serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters)).toEqual(saved);
  expect(rotateCompositionImage("a", 47)).toBe(true);
  expect(usePageStore.getState().page.layout.compositions.canvas.placements.a.frames.desktop.rotationPivot).toEqual(pivot);
});
it("switches paired modes with one Undo step, independent geometry and preserved selection", () => {
  usePageStore.getState().setPage(createWyrmetizerCopy(fixture(), compositionAdapters));
  const before = structuredClone(usePageStore.getState().page);
  usePageStore.temporal.getState().clear();
  expect(returnCompositionToFlow("canvas")).toBe(true);
  expect(usePageStore.getState().page.layout.compositions).toEqual({});
  expect(useWidgetStore.getState().selectedWidgetId).toBe("a");
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  expect(switchPairedCompositionMode("canvas", "flow")).toBe(false);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  usePageStore.temporal.getState().undo();
  expect(usePageStore.getState().page).toEqual(before);
  usePageStore.temporal.getState().redo();
  const edited = structuredClone(usePageStore.getState().page);
  edited.widgets.a.settings.image_transform.dimensions.width = { unit: "px", value: 177 };
  usePageStore.getState().setPage(edited);
  switchPairedCompositionMode("canvas", "composition");
  expect(usePageStore.getState().page.widgets.a.settings.image_transform).toEqual(before.widgets.a.settings.image_transform);
  const saved = serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters);
  expect(saved.layout.areas.canvas.flow.presentation.a.image_transform.dimensions.width.value).toBe(177);
});
it("duplicates and deletes paired members through editor actions atomically", () => {
  usePageStore.getState().setPage(createWyrmetizerCopy(fixture(), compositionAdapters));
  const id = useWidgetStore.getState().duplicateWidget("a");
  let canonical = serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters);
  expect(canonical.layout.areas.canvas.flow.order).toContain(id);
  expect(canonical.layout.areas.canvas.composition.geometry.stackOrder).toContain(id);
  useWidgetStore.getState().deleteWidget(id);
  canonical = serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters);
  expect(canonical.widgets[id]).toBeUndefined();
  expect(canonical.layout.areas.canvas.members).not.toContain(id);
});
it("toggles a pin on a rotated image without changing its angle or allowing resize to inject rotation", () => {
  rotateCompositionImage("a", 30);
  usePageStore.temporal.getState().clear();
  const page = usePageStore.getState().page, previous = page.widgets.a.settings.image_transform;
  const iframe = {}, origin = "https://preview.example";
  const payload = { widgetId: "a", startTransform: previous,
    transform: { ...previous, anchors: ["nw"] }, interactionContext: compositionInteractionContext() };
  const event = { source: iframe, origin, data: { type: "IMAGE_RESIZE_COMMIT", payload } };
  const frame = page.layout.compositions.canvas.placements.a.frames.desktop;
  expect(handleImageResizeMessage({ ...event, data: { ...event.data, payload: { ...payload,
    frame: { ...frame, rotation: 45 }, startFrame: frame } } }, iframe, origin)).toBe(false);
  expect(handleImageResizeMessage(event, iframe, origin)).toBe(true);
  expect(usePageStore.getState().page.widgets.a.settings.image_transform.anchors).toEqual(["nw"]);
  expect(usePageStore.getState().page.layout.compositions.canvas.placements.a.frames.desktop.rotation).toBe(30);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
});
it("precisely rotates with retained pins and position lock, one Undo/Redo step and a versioned JSON round trip", () => {
  const before = structuredClone(usePageStore.getState().page);
  const iframe = {}, origin = "https://preview.example";
  handleCompositionLockMessage({ source: iframe, origin, data: { type: "COMPOSITION_LOCK", payload: {
    widgetId: "a", compositionId: "canvas", interactionContext: compositionInteractionContext(), locked: true,
  } } }, iframe, origin);
  expect(rotateCompositionImage("a", 382.125)).toBe(true);
  const next = usePageStore.getState().page;
  expect(next.widgets).toEqual(before.widgets);
  expect(next.layout.compositions.canvas.placements.a).toMatchObject({ version: 2, frames: { desktop: { rotation: 22.125 } } });
  expect(next.layout.compositions.canvas.stackOrder).toEqual(before.layout.compositions.canvas.stackOrder);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  expect(JSON.parse(JSON.stringify(next))).toEqual(next);
  usePageStore.temporal.getState().undo(); expect(usePageStore.getState().page).toEqual(before);
  usePageStore.temporal.getState().redo(); expect(usePageStore.getState().page).toEqual(next);
  expect(getCompositionMovementLocks()).toEqual({ a: "canvas" });
  expect(rotateCompositionImage("a", 22.125)).toBe(false);
  expect(rotateCompositionImage("a", NaN)).toBe(false);
});
it("rejects rotation messages with foreign origins, stale context/revision, or position changes", () => {
  const iframe = {}, origin = "https://preview.example", page = usePageStore.getState().page;
  const start = page.layout.compositions.canvas.placements.a.frames.desktop;
  const e = { source: iframe, origin, data: { type: "COMPOSITION_ROTATE", payload: {
    widgetId: "a", compositionId: "canvas", interactionContext: compositionInteractionContext(),
    startRevision: compositionRevision(page.widgets.a, start), startFrame: start, frame: { ...start, rotation: 45 },
  } } };
  expect(handleCompositionMessage({ ...e, source: {} }, iframe, origin)).toBe(false);
  expect(handleCompositionMessage({ ...e, origin: "https://evil.example" }, iframe, origin)).toBe(false);
  expect(handleCompositionMessage({ ...e, data: { ...e.data, payload: { ...e.data.payload, frame: { ...start, x: 0.6, rotation: 45 } } } }, iframe, origin)).toBe(false);
  expect(handleCompositionMessage({ ...e, data: { ...e.data, payload: { ...e.data.payload, startRevision: "old" } } }, iframe, origin)).toBe(false);
  expect(handleCompositionMessage(e, iframe, origin)).toBe(true);
  expect(handleCompositionMessage(e, iframe, origin)).toBe(false);
  useWidgetStore.setState({ compositionContext: "mobile" });
  expect(rotateCompositionImage("a", 20)).toBe(false);
});
it("reports the exact reason and canonical revision when a trusted geometry message is rejected", () => {
  const iframe = {}, origin = "https://preview.example", page = usePageStore.getState().page;
  const start = page.layout.compositions.canvas.placements.a.frames.desktop;
  const event = { source: iframe, origin, data: { type: "COMPOSITION_ROTATE", payload: {
    widgetId: "a", compositionId: "canvas", interactionContext: compositionInteractionContext(),
    startRevision: "stale-revision", startFrame: start, frame: { ...start, rotation: 45 },
  } } };
  const result = handleCompositionMessageDetailed(event, iframe, origin);
  expect(result).toMatchObject({ accepted: false, reason: "stale-composition-revision",
    diagnostics: { widgetId: "a", compositionId: "canvas", presentation: "desktop",
      receivedRevision: "stale-revision", revisionMatches: false, canonicalFrame: start } });
  expect(usePageStore.getState().page).toEqual(page);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(0);
});
it("reports frame drift separately from revision drift", () => {
  const iframe = {}, origin = "https://preview.example", page = usePageStore.getState().page;
  const canonicalFrame = page.layout.compositions.canvas.placements.a.frames.desktop;
  const staleFrame = { ...canonicalFrame, x: canonicalFrame.x + 0.01 };
  const result = handleCompositionMessageDetailed({ source: iframe, origin, data: { type: "COMPOSITION_PIVOT", payload: {
    widgetId: "a", compositionId: "canvas", interactionContext: compositionInteractionContext(),
    startRevision: compositionRevision(page.widgets.a, canonicalFrame), startFrame: staleFrame,
    rotationPivot: { x: 0.3, y: 0.7 },
  } } }, iframe, origin);
  expect(result).toMatchObject({ accepted: false, reason: "stale-start-frame",
    diagnostics: { expectedRevision: compositionRevision(page.widgets.a, canonicalFrame),
      receivedStartFrame: staleFrame, canonicalFrame } });
  expect(usePageStore.getState().page).toEqual(page);
});
it("reproduces a resolved Desktop revision rejected against its canonical editor frame", () => {
  const page = openWyrmetizerEditorPage(convertWyrmetizerPageToV3(createWyrmetizerCopy(fixture(), compositionAdapters), compositionAdapters), compositionAdapters);
  usePageStore.setState({ page, originalPage: structuredClone(page) });
  usePageStore.temporal.getState().clear();
  useWidgetStore.setState({ compositionContext: "desktop", selectedWidgetId: "a", selectedBlockId: null,
    imageGeometry: { a: { containerWidth: 1200, naturalWidth: 300, naturalHeight: 200, width: 300, height: 200 },
      b: { containerWidth: 1200, naturalWidth: 300, naturalHeight: 200, width: 300, height: 200 } } });
  const canonical = serializeWyrmetizerEditorPage(page, compositionAdapters);
  const resolved = resolveWyrmetizerPresentation(canonical, 1200, { adapters: compositionAdapters,
    imageDimensions: { a: { width: 300, height: 200 }, b: { width: 300, height: 200 } } });
  const placement = resolved.areas.canvas.geometry.placements.a;
  const resolvedFrame = { x: placement.xPx / resolved.areas.canvas.geometry.widthPx,
    y: placement.yPx / resolved.areas.canvas.geometry.widthPx, pivot: placement.pivot,
    rotation: placement.rotation, ...(placement.rotationPivot ? { rotationPivot: placement.rotationPivot } : {}) };
  const canonicalFrame = page.layout.compositions.canvas.placements.a.frames.desktop;
  expect(resolved.widgets.a).toEqual(page.widgets.a);
  const event = { source: {}, origin: "https://preview.example", data: { type: "COMPOSITION_ROTATE", payload: {
    widgetId: "a", compositionId: "canvas", interactionContext: compositionInteractionContext(),
    startRevision: compositionRevision(resolved.widgets.a, resolvedFrame), startFrame: canonicalFrame,
    frame: { ...canonicalFrame, rotation: 25 },
  } } };
  const result = handleCompositionMessageDetailed(event, event.source, event.origin);
  expect(result).toMatchObject({ accepted: false, reason: "stale-composition-revision" });
  expect(result.diagnostics).toMatchObject({ presentation: "desktop", canonicalFrame,
    expectedRevision: compositionRevision(page.widgets.a, canonicalFrame), revisionMatches: false });
  expect(result.diagnostics.receivedRevision).toBe(compositionRevision(resolved.widgets.a, resolvedFrame));
  expect(resolvedFrame.rotation).toBe(0);
  expect(canonicalFrame.rotation).toBeUndefined();
});
it("moves with pins and mixed dimension modes in one Undo/Redo boundary, round trips JSON", () => {
  const before = structuredClone(usePageStore.getState().page),
    start = before.layout.compositions.canvas.placements.a.frames.desktop;
  const frame = { ...start, x: 0.6, y: 0.2 };
  expect(applyCompositionGeometry("a", { frame, startFrame: start })).toBe(true);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  expect(usePageStore.getState().page.widgets).toEqual(before.widgets);
  expect(
    JSON.parse(JSON.stringify(usePageStore.getState().page)).layout.compositions.canvas.placements.a.frames.desktop,
  ).toEqual(frame);
  expect(useWidgetStore.getState().selectedWidgetId).toBe("a");
  usePageStore.temporal.getState().undo();
  expect(useWidgetStore.getState().selectedWidgetId).toBe("a");
  expect(usePageStore.getState().page).toEqual(before);
  usePageStore.temporal.getState().redo();
  expect(useWidgetStore.getState().selectedWidgetId).toBe("a");
  expect(useWidgetStore.getState().selectedCompositionId).toBeNull();
  expect(usePageStore.getState().page.layout.compositions.canvas.placements.a.frames.desktop).toEqual(frame);
});
it("layers separately and moves the Composition Block separately from reading or paint order", () => {
  const c = usePageStore.getState().page.layout.compositions.canvas;
  layerImage("a", "forward");
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  layerImage("a", "forward");
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  reorderContentBlock("canvas", "down");
  const next = usePageStore.getState().page;
  expect(next.layout.contentOrder[0].id).toBe("after");
  expect(next.layout.compositions.canvas.childrenOrder).toEqual(c.childrenOrder);
  expect(next.layout.compositions.canvas.placements).toEqual(c.placements);
  expect(next.layout.compositions.canvas.stackOrder).toEqual(["b", "a"]);
});
it("rejects stale, malformed, out-of-bounds and mobile-generated geometry without history", () => {
  const start = usePageStore.getState().page.layout.compositions.canvas.placements.a.frames.desktop;
  for (const frame of [{}, { ...start, x: NaN }, { ...start, x: 1 }, { ...start, y: -1 }])
    expect(applyCompositionGeometry("a", { frame })).toBe(false);
  expect(applyCompositionGeometry("a", { frame: start, startFrame: { ...start, x: 0.9 } })).toBe(false);
  useWidgetStore.setState({ compositionContext: "mobile" });
  expect(applyCompositionGeometry("a", { frame: { ...start, x: 0.6 } })).toBe(false);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(0);
});
it("validates message source, selection, composition ownership and origin", () => {
  const iframe = {},
    origin = "https://preview.example",
    start = usePageStore.getState().page.layout.compositions.canvas.placements.a.frames.desktop;
  const e = {
    source: iframe,
    origin,
    data: {
      type: "COMPOSITION_MOVE",
      payload: {
        widgetId: "a",
        compositionId: "canvas",
        interactionContext: compositionInteractionContext(),
        startRevision: compositionRevision(usePageStore.getState().page.widgets.a, start),
        frame: { ...start, x: 0.6 },
        startFrame: start,
      },
    },
  };
  expect(handleCompositionMessage({ ...e, origin: "https://evil.example" }, iframe, origin)).toBe(false);
  expect(handleCompositionMessage({ ...e, source: {} }, iframe, origin)).toBe(false);
  expect(handleCompositionMessage(e, iframe, origin)).toBe(true);
  expect(handleCompositionMessage(e, iframe, origin)).toBe(false);
});

it("Default Scale also clears legacy fullwidth atomically while retaining pin identities and placement pivot", () => {
  const page = structuredClone(usePageStore.getState().page); page.widgets.a.settings.fullwidth = true;
  usePageStore.setState({ page }); usePageStore.temporal.getState().clear();
  useWidgetStore.getState().resetImageScale("a");
  const next = usePageStore.getState().page;
  expect(next.widgets.a.settings.fullwidth).toBe(false);
  expect(next.widgets.a.settings.image_transform.dimensions.width.value).toBeNull();
  expect(next.widgets.a.settings.image_transform.dimensions.height.value).toBeNull();
  expect(next.widgets.a.settings.image_transform.anchors).toEqual(["ne"]);
  expect(next.layout.compositions.canvas.placements.a.frames.desktop.pivot).toEqual(page.layout.compositions.canvas.placements.a.frames.desktop.pivot);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  usePageStore.temporal.getState().undo(); expect(usePageStore.getState().page.widgets.a.settings.fullwidth).toBe(true);
});

it("routes arrows by current hierarchy, rejects stale scope and preserves independent histories", () => {
  const iframe = {}, origin = "https://preview.example";
  const event = (scope, id, direction) => ({ source: iframe, origin, data: { type: "ORDER_SELECTION", payload: { scope, id, direction } } });
  const before = structuredClone(usePageStore.getState().page);
  expect(handleOrderingMessage(event("image", "a", "up"), iframe, origin)).toBe(true);
  expect(usePageStore.getState().page.layout.contentOrder).toEqual(before.layout.contentOrder);
  expect(usePageStore.getState().page.layout.compositions.canvas.placements).toEqual(before.layout.compositions.canvas.placements);
  expect(handleOrderingMessage(event("image", "a", "up"), iframe, origin)).toBe(false);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  useWidgetStore.getState().setSelectedCompositionId("canvas");
  expect(useWidgetStore.getState().selectedWidgetId).toBeNull();
  expect(handleOrderingMessage(event("image", "a", "down"), iframe, origin)).toBe(false);
  expect(handleOrderingMessage(event("composition", "canvas", "down"), iframe, origin)).toBe(true);
  expect(usePageStore.getState().page.layout.compositions).toEqual({ canvas: { ...before.layout.compositions.canvas, stackOrder: ["b", "a"] } });
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(2);
  usePageStore.temporal.getState().undo(); expect(usePageStore.getState().page.layout.contentOrder).toEqual(before.layout.contentOrder);
  usePageStore.temporal.getState().undo(); expect(usePageStore.getState().page).toEqual(before);
  usePageStore.temporal.getState().redo(); usePageStore.temporal.getState().redo();
  const reloaded = JSON.parse(JSON.stringify(usePageStore.getState().page));
  expect(reloaded.layout.compositions.canvas.stackOrder).toEqual(["b", "a"]);
  expect(reloaded.layout.contentOrder[0].id).toBe("after");
  useWidgetStore.getState().setSelectedWidgetId("a");
  expect(useWidgetStore.getState().selectedCompositionId).toBeNull();
  expect(handleOrderingMessage(event("composition", "canvas", "up"), iframe, origin)).toBe(false);
  expect(handleOrderingMessage(event("image", "a", "down"), iframe, origin)).toBe(true);
});

it("keeps movement locks outside content/history and rejects locked moves through the trusted bridge", () => {
  const iframe = {}, origin = "https://preview.example";
  const before = structuredClone(usePageStore.getState().page);
  const lock = (locked) => ({ source: iframe, origin, data: { type: "COMPOSITION_LOCK", payload: { widgetId: "a", compositionId: "canvas", interactionContext: compositionInteractionContext(), locked } } });
  expect(handleCompositionLockMessage({ ...lock(true), source: {} }, iframe, origin)).toBe(false);
  expect(handleCompositionLockMessage({ ...lock(true), origin: "https://evil.example" }, iframe, origin)).toBe(false);
  expect(handleCompositionLockMessage(lock(true), iframe, origin)).toBe(true);
  expect(getCompositionMovementLocks()).toEqual({ a: "canvas" });
  const start = before.layout.compositions.canvas.placements.a.frames.desktop;
  const move = { source: iframe, origin, data: { type: "COMPOSITION_MOVE", payload: { widgetId: "a", compositionId: "canvas", interactionContext: compositionInteractionContext(), startRevision: compositionRevision(before.widgets.a, start), startFrame: start, frame: { ...start, x: 0.6 } } } };
  expect(handleCompositionMessage(move, iframe, origin)).toBe(false);
  expect(usePageStore.getState().page).toEqual(before);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(0);
  useWidgetStore.getState().setSelectedWidgetId("b");
  useWidgetStore.getState().setSelectedCompositionId("canvas");
  useWidgetStore.setState({ compositionContext: "mobile" });
  expect(getCompositionMovementLocks()).toEqual({ a: "canvas" });
  useWidgetStore.setState({ compositionContext: "desktop" });
  useWidgetStore.getState().setSelectedWidgetId("a");
  expect(handleCompositionLockMessage(lock(false), iframe, origin)).toBe(true);
  expect(handleCompositionMessage(move, iframe, origin)).toBe(true);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  expect(useWidgetStore.getState().selectedWidgetId).toBe("a");
  usePageStore.temporal.getState().undo(); usePageStore.temporal.getState().redo();
  expect(useWidgetStore.getState().selectedWidgetId).toBe("a");
});
it("clears locks on Return to Flow without restoring them on Undo", () => {
  usePageStore.getState().setPage(createWyrmetizerCopy(fixture(), compositionAdapters));
  const iframe = {}, origin = "https://preview.example";
  const event = { source: iframe, origin, data: { type: "COMPOSITION_LOCK", payload: { widgetId: "a", compositionId: "canvas", interactionContext: compositionInteractionContext(), locked: true } } };
  handleCompositionLockMessage(event, iframe, origin);
  returnCompositionToFlow("canvas");
  expect(getCompositionMovementLocks()).toEqual({});
  usePageStore.temporal.getState().undo();
  expect(getCompositionMovementLocks()).toEqual({});
});

it("commits one Mobile transaction, upgrades v2 only on edit, and restores inheritance through Undo", () => {
  const source = fixture();
  source.layout.compositions.canvas.placements.b.frames.desktop.x = 0.1;
  usePageStore.getState().setPage(createWyrmetizerCopy(source, compositionAdapters));
  usePageStore.temporal.getState().clear();
  useAutoSave.setState({ structureModified: false });
  const before = structuredClone(usePageStore.getState().page);
  const target = { areaId: "canvas", mode: "composition", widgetId: "a" };
  const cancelled = beginMobilePresentationTransaction(target);
  expect(cancelMobilePresentationTransaction(cancelled)).toEqual(before);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(0);

  const transaction = beginMobilePresentationTransaction(target);
  const changedTransform = structuredClone(transaction.initialValues.image_transform);
  changedTransform.dimensions.width.value = 250;
  const staged = stageMobilePresentationValue(transaction, "image_transform", changedTransform);
  expect(commitMobilePresentationTransaction(staged)).toBe(true);
  const committed = structuredClone(usePageStore.getState().page);
  const canonical = serializeWyrmetizerEditorPage(committed, compositionAdapters);
  expect(canonical.layout.version).toBe(3);
  expect(canonical.layout.mobile.areas.canvas.composition.presentation.a).toEqual({ image_transform: changedTransform });
  expect(committed.wyrmetizerEditorLayout.areas.canvas.composition.presentation.a.image_transform)
    .toEqual(before.wyrmetizerEditorLayout.areas.canvas.composition.presentation.a.image_transform);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  expect(useAutoSave.getState().structureModified).toBe(true);

  usePageStore.temporal.getState().undo();
  expect(serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters).layout.version).toBe(2);
  usePageStore.temporal.getState().redo();
  expect(usePageStore.getState().page).toEqual(committed);
  usePageStore.getState().setPage(JSON.parse(JSON.stringify(canonical)));
  expect(serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters)).toEqual(canonical);
});

it("rejects invalid Mobile size edits before page, dirty state, revision, or history changes", () => {
  const canonical = createWyrmetizerCopy(fixture(), compositionAdapters);
  for (const id of ["a", "b"]) canonical.layout.areas.canvas.composition.presentation[id].image_transform.dimensions = {
    width: { unit: "px", value: 100 }, height: { unit: "px", value: 70 },
  };
  usePageStore.getState().setPage(canonical);
  usePageStore.temporal.getState().clear();
  useAutoSave.setState({ structureModified: false, modifiedWidgets: new Set() });
  useWidgetStore.setState({ compositionContext: "mobile", selectedWidgetId: "b", imageGeometry: {
    a: { imageSource: "/uploads/images/photo.jpg", naturalWidth: 300, naturalHeight: 300, width: 300, height: 300 },
    b: { imageSource: "/uploads/images/photo.jpg", naturalWidth: 300, naturalHeight: 300, width: 300, height: 300 },
  } });
  const before = structuredClone(usePageStore.getState().page);
  const revision = compositionRevision(before.widgets.b,
    before.wyrmetizerEditorLayout.areas.canvas.composition.geometry.placements.b.frames.desktop);
  const target = { areaId: "canvas", mode: "composition", widgetId: "b" };
  const transaction = beginMobilePresentationTransaction(target);
  const transform = structuredClone(transaction.initialValues.image_transform);
  transform.dimensions.width.value = 300;
  const staged = stageMobilePresentationValue(transaction, "image_transform", transform);

  for (let attempt = 0; attempt < 3; attempt++) {
    expect(() => commitMobilePresentationTransaction(staged)).toThrow(/Reduce the image width, height or scale/);
    expect(usePageStore.getState().page).toEqual(before);
    expect(usePageStore.temporal.getState().pastStates).toHaveLength(0);
    expect(useAutoSave.getState().structureModified).toBe(false);
    expect(useAutoSave.getState().modifiedWidgets.size).toBe(0);
    expect(compositionRevision(usePageStore.getState().page.widgets.b,
      usePageStore.getState().page.wyrmetizerEditorLayout.areas.canvas.composition.geometry.placements.b.frames.desktop)).toBe(revision);
  }
});

it("commits valid Mobile dimensions without changing Desktop geometry", () => {
  const canonical = createWyrmetizerCopy(fixture(), compositionAdapters);
  for (const id of ["a", "b"]) canonical.layout.areas.canvas.composition.presentation[id].image_transform.dimensions = {
    width: { unit: "px", value: 100 }, height: { unit: "px", value: 70 },
  };
  usePageStore.getState().setPage(canonical);
  usePageStore.temporal.getState().clear();
  useAutoSave.setState({ structureModified: false });
  useWidgetStore.setState({ compositionContext: "mobile", selectedWidgetId: "b", imageGeometry: {
    a: { imageSource: "/uploads/images/photo.jpg", containerWidth: 1200, naturalWidth: 300, naturalHeight: 200, width: 300, height: 200 },
    b: { imageSource: "/uploads/images/photo.jpg", containerWidth: 1200, naturalWidth: 300, naturalHeight: 300, width: 300, height: 300 },
  } });
  useWidgetStore.setState({ compositionContext: "desktop" });
  expect(rotateCompositionImage("b", 12)).toBe(true);
  expect(setCompositionRotationPivot("b", { x: 0.4, y: 0.6 })).toBe(true);
  useWidgetStore.setState({ compositionContext: "mobile" });
  usePageStore.temporal.getState().clear();
  useAutoSave.setState({ structureModified: false });
  const before = serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters);
  const target = { areaId: "canvas", mode: "composition", widgetId: "b" };
  const transaction = beginMobilePresentationTransaction(target);
  const transform = structuredClone(transaction.initialValues.image_transform);
  transform.dimensions = { width: { unit: "px", value: null }, height: { unit: "px", value: 200 } };
  expect(commitMobilePresentationTransaction(stageMobilePresentationValue(transaction, "image_transform", transform))).toBe(true);

  const after = serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters);
  expect(after.layout.areas.canvas.composition).toEqual(before.layout.areas.canvas.composition);
  expect(after.layout.mobile.areas.canvas.composition.presentation.b.image_transform).toEqual(transform);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  expect(useAutoSave.getState().structureModified).toBe(true);
  const dimensions = { a: { width: 300, height: 200 }, b: { width: 300, height: 300 } };
  const mobileRect = resolveWyrmetizerPresentation(after, 390, { imageDimensions: dimensions }).areas.canvas.geometry.placements.b.rect;
  expect(mobileRect.left).toBeCloseTo(156, 0);
  expect(mobileRect).toMatchObject({ width: 200, height: 200 });
  expect(resolveWyrmetizerPresentation(after, 1200, { imageDimensions: dimensions }).areas.canvas.geometry.placements)
    .toEqual(resolveWyrmetizerPresentation(before, 1200, { imageDimensions: dimensions }).areas.canvas.geometry.placements);
});

it("records each Mobile reset as one Undo/Redo step and leaves untouched v2 pages unchanged", () => {
  const v2 = createWyrmetizerCopy(fixture(), compositionAdapters);
  usePageStore.getState().setPage(v2);
  usePageStore.temporal.getState().clear();
  expect(resetMobilePresentationProperty({ areaId: "canvas", mode: "flow", widgetId: "a" }, "fullwidth")).toBe(false);
  expect(serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters).layout.version).toBe(2);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(0);

  const v3 = convertWyrmetizerPageToV3(v2, compositionAdapters);
  v3.layout.mobile.areas = { canvas: {
    flow: { presentation: { a: { fullwidth: false, top_spacing_px: 0 }, b: { top_spacing_px: 9 } } },
    composition: { presentation: { a: { fullwidth: false }, b: { top_spacing_px: 14 } } },
  } };
  usePageStore.getState().setPage(v3);
  usePageStore.temporal.getState().clear();
  const before = structuredClone(usePageStore.getState().page);

  expect(resetMobilePresentationProperty({ areaId: "canvas", mode: "flow", widgetId: "a" }, "fullwidth")).toBe(true);
  const afterProperty = structuredClone(usePageStore.getState().page);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  expect(serializeWyrmetizerEditorPage(afterProperty, compositionAdapters).layout.mobile.areas.canvas.flow.presentation.a).toEqual({ top_spacing_px: 0 });
  usePageStore.temporal.getState().undo(); expect(usePageStore.getState().page).toEqual(before);
  usePageStore.temporal.getState().redo(); expect(usePageStore.getState().page).toEqual(afterProperty);

  expect(resetMobileWidgetPresentation({ areaId: "canvas", mode: "flow", widgetId: "a" })).toBe(true);
  const afterWidget = structuredClone(usePageStore.getState().page);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(2);
  expect(serializeWyrmetizerEditorPage(afterWidget, compositionAdapters).layout.mobile.areas.canvas.flow.presentation.b.top_spacing_px).toBe(9);
  expect(resetMobileModePresentation("flow")).toBe(true);
  const afterMode = structuredClone(usePageStore.getState().page);
  const reset = serializeWyrmetizerEditorPage(afterMode, compositionAdapters);
  expect(reset.layout.mobile.areas.canvas.composition.presentation.b.top_spacing_px).toBe(14);
  expect(reset.layout.mobile.areas.canvas.flow).toBeUndefined();
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(3);
  usePageStore.temporal.getState().undo(); expect(usePageStore.getState().page).toEqual(afterWidget);
  usePageStore.temporal.getState().redo(); expect(usePageStore.getState().page).toEqual(afterMode);
});
