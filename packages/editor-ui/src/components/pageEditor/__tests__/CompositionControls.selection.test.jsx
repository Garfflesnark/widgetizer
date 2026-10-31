// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initializeWyrmetizerPage, serializeWyrmetizerEditorPage } from "@widgetizer/core/wyrmetizerLayouts";
import { compositionAdapters } from "@widgetizer/core/compositionImage";
import { fixture } from "../../../../../core/src/runtime/__tests__/compositionFixture.js";
import schema from "../../../../../../themes/arch/widgets/image/schema.json";
vi.mock("../../../queries/pageManager", () => ({ getPage: vi.fn() }));
vi.mock("../../../queries/previewManager", () => ({ getGlobalWidgets: vi.fn(), getProjectWidgets: vi.fn() }));
vi.mock("../../../stores/themeStore", () => ({ default: { getState: () => ({ settings: {} }) } }));
import CompositionControls from "../CompositionControls";
import usePageStore from "../../../stores/pageStore";
import useWidgetStore from "../../../stores/widgetStore";
import useAutoSave from "../../../stores/saveStore";
import { compositionInteractionContext, handleCompositionSelectionMessage, switchPairedCompositionMode } from "../../../lib/compositionActions";

const saved = () => serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters);
beforeEach(() => {
  const source = fixture();
  delete source.layout;
  source.id = "selection";
  source.widgets.c = structuredClone(source.widgets.a);
  source.widgetsOrder = ["a", "b", "c", "after"];
  for (const id of ["a", "b", "c"]) source.widgets[id].settings.name = id.toUpperCase();
  usePageStore.setState({ loadedProjectId: "selection-project", activeLoadId: 1 });
  usePageStore.getState().setPage(initializeWyrmetizerPage(source, compositionAdapters));
  usePageStore.temporal.getState().clear();
  useWidgetStore.setState({ compositionSelection: { scope: null, ids: [] }, compositionContext: "desktop",
    schemas: { image: schema }, selectedWidgetId: "a", selectedBlockId: null, selectedCompositionId: null,
    imageGeometry: { a: { containerWidth: 1200, naturalWidth: 1600, naturalHeight: 900 } } });
});
afterEach(() => { cleanup(); useAutoSave.getState().stopAutoSave(); });

it("shows creation for freshly added Images before any size edit and leaves unchecked Images untouched", () => {
  usePageStore.getState().setPage(initializeWyrmetizerPage({ id: "fresh", widgets: {}, widgetsOrder: [] }, compositionAdapters));
  useWidgetStore.setState({ selectedWidgetId: null });
  const imageIds = ["First", "Second", "Third"].map((name, index) => {
    const id = useWidgetStore.getState().addWidget("image", index);
    useWidgetStore.getState().updateWidgetSettingValues(id, { image: "/uploads/images/photo.jpg", name });
    return id;
  });
  const before = structuredClone(usePageStore.getState().page);
  expect(before.layout.compositions).toEqual({});
  expect(imageIds.every(id => before.widgets[id].settings.image_transform === undefined)).toBe(true);
  render(<CompositionControls widgetId={imageIds[0]} />);
  const create = screen.getByRole("button", { name: "Create Composition Area" });
  expect(create.disabled).toBe(true);
  expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  fireEvent.click(screen.getByRole("checkbox", { name: "First" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Third" }));
  expect(create.disabled).toBe(false);
  expect(usePageStore.getState().page).toEqual(before);
  fireEvent.click(create);
  const page = saved(), area = Object.values(page.layout.areas)[0];
  expect(page.layout.version).toBe(2);
  expect(area.members).toEqual([imageIds[0], imageIds[2]]);
  expect(area.flow.presentation[imageIds[0]].image_transform.version).toBe(2);
  expect(page.widgets[imageIds[1]]).toEqual(before.widgets[imageIds[1]]);
  expect(page.layout.contentOrder).toContainEqual({ kind: "widget", id: imageIds[1] });
});

it("keeps unsupported and empty Images out of the creation controls", () => {
  const page = structuredClone(usePageStore.getState().page);
  delete page.widgets.a.settings.image_transform;
  page.widgets.a.settings.image = "";
  page.widgets.b.settings.image_transform = { version: 99 };
  page.widgets.c.settings.caption = "Captioned";
  usePageStore.getState().setPage(page);
  render(<CompositionControls widgetId="a" />);
  expect(screen.queryByRole("button", { name: "Create Composition Area" })).toBeNull();
  expect(useWidgetStore.getState().getCompositionCandidates()).toEqual([]);
});

it("keeps checkbox and Ctrl+Click selection through widget-panel remounts and combines only checked images", () => {
  const before = structuredClone(usePageStore.getState().page);
  const { rerender } = render(<CompositionControls key="a" widgetId="a" />);
  fireEvent.click(screen.getByRole("checkbox", { name: "A" }));
  const iframe = {}, origin = "https://preview.example";
  act(() => {
    expect(handleCompositionSelectionMessage({ source: iframe, origin, data: { type: "COMPOSITION_TOGGLE_IMAGE",
      payload: { widgetId: "c", interactionContext: compositionInteractionContext() } } }, iframe, origin)).toBe(true);
  });
  expect(screen.getByRole("checkbox", { name: "C" }).checked).toBe(true);
  rerender(<CompositionControls key="b" widgetId="b" />);
  expect(screen.getByRole("checkbox", { name: "A" }).checked).toBe(true);
  expect(screen.getByRole("checkbox", { name: "B" }).checked).toBe(false);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Create Composition Area" }));
  const page = saved(), area = Object.values(page.layout.areas)[0];
  expect(Object.keys(page.layout.areas)).toHaveLength(1);
  expect(area.members).toEqual(["a", "c"]);
  expect(area.composition.geometry.childrenOrder).toEqual(["a", "c"]);
  expect(area.composition.geometry.placements.a.frames.desktop).not.toEqual(area.composition.geometry.placements.c.frames.desktop);
  expect(page.widgets.b).toEqual(before.widgets.b);
  expect(page.layout.contentOrder).toContainEqual({ kind: "widget", id: "b" });
  expect(useWidgetStore.getState().getCompositionSelection()).toEqual([]);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  const after = structuredClone(usePageStore.getState().page);
  act(() => usePageStore.temporal.getState().undo()); expect(usePageStore.getState().page).toEqual(before);
  act(() => usePageStore.temporal.getState().redo()); expect(usePageStore.getState().page).toEqual(after);
});

it("offers the recovered checkboxes in an existing area's Flow view and adds without recreating members", () => {
  const fresh = structuredClone(usePageStore.getState().page);
  delete fresh.widgets.c.settings.image_transform;
  fresh.widgets.c.settings.image_width_percent = 25;
  usePageStore.getState().setPage(fresh);
  const { rerender } = render(<CompositionControls widgetId="a" />);
  fireEvent.click(screen.getByRole("checkbox", { name: "A" }));
  fireEvent.click(screen.getByRole("button", { name: "Create Composition Area" }));
  const areaId = Object.keys(saved().layout.areas)[0];
  act(() => switchPairedCompositionMode(areaId, "flow"));
  rerender(<CompositionControls widgetId="a" />);
  const before = saved().layout.areas[areaId];
  const beforePage = structuredClone(usePageStore.getState().page);
  usePageStore.temporal.getState().clear();
  fireEvent.click(screen.getByRole("checkbox", { name: "C" }));
  fireEvent.click(screen.getByRole("button", { name: "Add checked images to Composition Area" }));
  const page = saved(), area = page.layout.areas[areaId];
  expect(Object.keys(page.layout.areas)).toEqual([areaId]);
  expect(area.activeMode).toBe("flow");
  expect(area.members).toEqual(["a", "c"]);
  expect(area.composition.geometry.placements.a).toEqual(before.composition.geometry.placements.a);
  expect(area.flow.presentation.a).toEqual(before.flow.presentation.a);
  expect(area.flow.presentation.c.image_transform.dimensions.width.value).toBe(25);
  expect(page.layout.contentOrder).toContainEqual({ kind: "widget", id: "b" });
  expect(screen.queryByRole("checkbox", { name: "C" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Create Composition Area" })).toBeNull();
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  const afterPage = structuredClone(usePageStore.getState().page);
  act(() => usePageStore.temporal.getState().undo()); expect(usePageStore.getState().page).toEqual(beforePage);
  act(() => usePageStore.temporal.getState().redo()); expect(usePageStore.getState().page).toEqual(afterPage);
  act(() => usePageStore.getState().setPage(JSON.parse(JSON.stringify(page))));
  expect(saved()).toEqual(page);
});

it("does not relax legacy-page gating for Images without explicit sizing", () => {
  const page = structuredClone(usePageStore.getState().page);
  delete page.wyrmetizerEditorLayout;
  delete page.layout;
  for (const id of ["a", "b", "c"]) delete page.widgets[id].settings.image_transform;
  usePageStore.setState({ page });
  render(<CompositionControls widgetId="a" />);
  expect(screen.queryByRole("button", { name: "Create Composition Area" })).toBeNull();
  expect(usePageStore.getState().page).toEqual(page);
});

it("rejects stale or foreign Ctrl+Click messages and scopes draft checks to the current page load", () => {
  const iframe = {}, origin = "https://preview.example";
  const event = { source: iframe, origin, data: { type: "COMPOSITION_TOGGLE_IMAGE",
    payload: { widgetId: "a", interactionContext: compositionInteractionContext() } } };
  expect(handleCompositionSelectionMessage({ ...event, source: {} }, iframe, origin)).toBe(false);
  expect(handleCompositionSelectionMessage({ ...event, origin: "https://other.example" }, iframe, origin)).toBe(false);
  expect(handleCompositionSelectionMessage({ ...event, data: { ...event.data, payload: { ...event.data.payload, interactionContext: "stale" } } }, iframe, origin)).toBe(false);
  expect(handleCompositionSelectionMessage(event, iframe, origin)).toBe(true);
  expect(useWidgetStore.getState().selectedWidgetId).toBe("a");
  expect(handleCompositionSelectionMessage(event, iframe, origin)).toBe(true);
  expect(useWidgetStore.getState().getCompositionSelection()).toEqual([]);
  useWidgetStore.getState().toggleCompositionImage("b");
  usePageStore.setState({ activeLoadId: 2 });
  expect(useWidgetStore.getState().getCompositionSelection()).toEqual([]);
  expect(useWidgetStore.getState().toggleCompositionImage("after")).toBe(false);
  useWidgetStore.setState({ compositionContext: "mobile" });
  expect(useWidgetStore.getState().toggleCompositionImage("a")).toBe(false);
});
