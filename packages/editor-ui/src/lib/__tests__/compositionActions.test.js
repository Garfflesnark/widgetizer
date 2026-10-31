import { compositionRevision, compositionRect } from "@widgetizer/core/composition";
import { rotatedPoint } from "@widgetizer/core/rotationGeometry";
import { transformRect } from "@widgetizer/core/imageTransform";
import { createWyrmetizerCopy, serializeWyrmetizerEditorPage, initializeWyrmetizerPage } from "@widgetizer/core/wyrmetizerLayouts";
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
  reorderContentBlock,
  handleOrderingMessage,
  handleCompositionLockMessage,
  getCompositionMovementLocks,
  returnCompositionToFlow,
  rotateCompositionImage,
  switchPairedCompositionMode,
  setCompositionRotationPivot,
  convertImages,
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
