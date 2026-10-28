import { compositionRevision } from "@widgetizer/core/composition";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import schema from "../../../../../themes/arch/widgets/image/schema.json";
import { fixture } from "../../../../core/src/runtime/__tests__/compositionFixture.js";
vi.mock("../../queries/pageManager", () => ({ getPage: vi.fn() }));
vi.mock("../../queries/previewManager", () => ({ getGlobalWidgets: vi.fn(), getProjectWidgets: vi.fn() }));
vi.mock("../../stores/themeStore", () => ({ default: { getState: () => ({ settings: {} }) } }));
import usePageStore from "../../stores/pageStore";
import useWidgetStore from "../../stores/widgetStore";
import useAutoSave from "../../stores/saveStore";
import {
  applyCompositionGeometry,
  compositionInteractionContext,
  layerImage,
  handleCompositionMessage,
  reorderContentBlock,
  handleOrderingMessage,
} from "../compositionActions";
beforeEach(() => {
  const page = fixture();
  page.widgets.a.settings.image_transform.anchors = ["ne"];
  usePageStore.setState({ page, originalPage: structuredClone(page), globalWidgets: {} });
  usePageStore.temporal.getState().clear();
  useWidgetStore.setState({
    compositionContext: "desktop",
    schemas: { image: schema },
    selectedCompositionId: null,
    selectedWidgetId: "a",
    selectedBlockId: null,
    imageGeometry: { a: { containerWidth: 1200, width: 1200, height: 675, imageSource: "" } },
  });
});
afterEach(() => useAutoSave.getState().stopAutoSave());
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
