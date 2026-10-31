// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initializeWyrmetizerPage, createWyrmetizerCopy, serializeWyrmetizerEditorPage } from "@widgetizer/core/wyrmetizerLayouts";
import { compositionAdapters } from "@widgetizer/core/compositionImage";
import { fixture } from "../../../../../core/src/runtime/__tests__/compositionFixture.js";
import schema from "../../../../../../themes/arch/widgets/image/schema.json";
vi.mock("../../../queries/pageManager", () => ({ getPage: vi.fn() }));
vi.mock("../../../queries/previewManager", () => ({ getGlobalWidgets: vi.fn(), getProjectWidgets: vi.fn(), scrollElementIntoView: vi.fn() }));
vi.mock("../../../stores/themeStore", () => ({ default: { getState: () => ({ settings: {} }) } }));
vi.mock("../../../hooks/useThemeLocale", () => ({ useThemeLocale: () => ({ tTheme: value => value }) }));
vi.mock("../../../hooks/useCollections", () => ({ default: () => ({ schemas: [] }) }));
vi.mock("../../settings", () => ({ SettingsRenderer: () => null }));
import WidgetList from "../WidgetList";
import SettingsPanel from "../SettingsPanel";
import SelectionOverlay from "../SelectionOverlay";
import usePageStore from "../../../stores/pageStore";
import useWidgetStore from "../../../stores/widgetStore";
import useAutoSave from "../../../stores/saveStore";
import useDeleteKeyShortcut from "../../../hooks/useDeleteKeyShortcut";
import { createEmptyCompositionArea, switchPairedCompositionMode } from "../../../lib/compositionActions";
import { moveHierarchyItem } from "../../../lib/compositionHierarchy";

const saved = () => serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters);
function Editor() {
  const page = usePageStore(s => s.page);
  const state = useWidgetStore();
  useDeleteKeyShortcut();
  return <><WidgetList page={page} widgets={page.widgets} widgetSchemas={state.schemas}
    selectedWidgetId={state.selectedWidgetId} selectedBlockId={state.selectedBlockId}
    onWidgetSelect={state.setSelectedWidgetId} onBlockSelect={state.setSelectedBlockId} />
    <SelectionOverlay selectedWidgetId={state.selectedWidgetId} selectedBlockId={state.selectedBlockId}
      onWidgetSelect={state.setSelectedWidgetId} onBlockSelect={state.setSelectedBlockId} />
    <SettingsPanel selectedWidgetId={state.selectedWidgetId} selectedWidget={page.widgets[state.selectedWidgetId]}
      selectedWidgetSchema={state.schemas[page.widgets[state.selectedWidgetId]?.type]} widgetSchemas={state.schemas} /></>;
}
const areaRegion = id => screen.getByRole("region", { name: `Composition Area ${id}` });
const source = () => {
  const page = fixture();
  page.id = "hierarchy";
  page.widgets.a.settings.name = "Alpha";
  page.widgets.b.settings.name = "Beta";
  page.widgets.after.settings.name = "Outside";
  return page;
};
beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn();
  const page = source(); delete page.layout;
  usePageStore.setState({ loadedProjectId: "hierarchy-project", activeLoadId: 1, globalWidgets: {} });
  usePageStore.getState().setPage(initializeWyrmetizerPage(page, compositionAdapters));
  usePageStore.temporal.getState().clear();
  useWidgetStore.setState({ schemas: { image: { ...schema, displayName: "Image" }, text: { type: "text", displayName: "Text" } },
    selectedWidgetId: null, selectedCompositionId: null, selectedBlockId: null, selectedGlobalWidgetId: null,
    selectedThemeGroup: null, compositionContext: "desktop", imageGeometry: {}, widgetClipboard: null,
    compositionMovementLocks: {}, compositionSelection: { scope: null, ids: [] } });
});
afterEach(() => useAutoSave.getState().stopAutoSave());

it("creates and selects an empty area from the menu at the chosen root position, with Undo/Redo and reload", () => {
  render(<Editor />);
  const before = saved();
  fireEvent.click(screen.getAllByRole("button", { name: "pageEditor.actions.addWidget" })[1]);
  fireEvent.click(screen.getByRole("option", { name: "Composition Area" }));
  const page = saved(), id = Object.keys(page.layout.areas)[0];
  expect(page.layout.contentOrder[1]).toEqual({ kind: "area", id });
  expect(page.widgets).toEqual(before.widgets);
  expect(useWidgetStore.getState().selectedCompositionId).toBe(id);
  expect(useWidgetStore.getState().selectedWidgetId).toBeNull();
  expect(within(areaRegion(id)).getByText("Empty Composition Area")).toBeVisible();
  expect(screen.getByRole("button", { name: "Delete Composition Area" })).toBeVisible();
  expect(screen.queryByRole("spinbutton", { name: "Image rotation angle" })).toBeNull();
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  act(() => usePageStore.temporal.getState().undo()); expect(saved()).toEqual(before);
  act(() => usePageStore.temporal.getState().redo()); expect(saved()).toEqual(page);
  fireEvent.click(within(areaRegion(id)).getByRole("button", { name: "Composition Area" }));
  act(() => usePageStore.getState().setPage(JSON.parse(JSON.stringify(page))));
  expect(within(areaRegion(id)).getByRole("button", { name: "Composition Area" })).toHaveAttribute("aria-pressed", "true");
});

it("keeps an empty parent selected when switching arrangements with the preview bridge mounted", () => {
  createEmptyCompositionArea();
  const id = useWidgetStore.getState().selectedCompositionId;
  render(<Editor />);
  fireEvent.click(screen.getByRole("button", { name: "Switch to Flow" }));
  expect(useWidgetStore.getState().selectedCompositionId).toBe(id);
  expect(screen.getByRole("button", { name: "Delete Composition Area" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Switch to Composition" }));
  expect(useWidgetStore.getState().selectedCompositionId).toBe(id);
  expect(useWidgetStore.getState().selectedWidgetId).toBeNull();
  expect(saved().layout.areas[id].members).toEqual([]);
});

it.each(["composition", "flow"])("nests children in %s, selects parent independently and reveals an externally selected child", mode => {
  usePageStore.getState().setPage(createWyrmetizerCopy(source(), compositionAdapters));
  if (mode === "flow") switchPairedCompositionMode("canvas", mode);
  render(<Editor />);
  const before = saved(), area = areaRegion("canvas");
  expect(within(area).getByRole("button", { name: "Alpha" })).toBeVisible();
  expect(within(area).getByRole("button", { name: "Beta" })).toBeVisible();
  expect(within(area).queryByRole("button", { name: "Outside" })).toBeNull();
  fireEvent.click(within(area).getByRole("button", { name: "Alpha" }));
  expect(useWidgetStore.getState().selectedWidgetId).toBe("a");
  fireEvent.click(within(area).getByRole("button", { name: "Composition Area" }));
  expect(useWidgetStore.getState().selectedWidgetId).toBeNull();
  expect(useWidgetStore.getState().selectedCompositionId).toBe("canvas");
  expect(screen.getByRole("button", { name: "Delete Composition Area" })).toBeVisible();
  fireEvent.keyDown(document.body, { key: "Delete" });
  expect(saved()).toEqual(before);
  fireEvent.click(within(area).getByRole("button", { name: "Collapse Composition Area" }));
  expect(within(area).queryByRole("button", { name: "Alpha" })).toBeNull();
  act(() => useWidgetStore.getState().setSelectedWidgetId("b"));
  expect(within(area).getByRole("button", { name: "Beta" })).toBeVisible();
  expect(useWidgetStore.getState().selectedCompositionId).toBeNull();
  expect(saved()).toEqual(before);
});

it("combines hierarchy checkboxes and Ctrl+Click for creation and adding to an empty selected area", () => {
  render(<Editor />);
  fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Include Alpha in Composition" }));
  fireEvent.click(screen.getByRole("button", { name: "Beta" }), { ctrlKey: true });
  expect(useWidgetStore.getState().getCompositionSelection()).toEqual(["a", "b"]);
  fireEvent.click(screen.getByRole("button", { name: "Create Composition Area" }));
  const id = Object.keys(saved().layout.areas)[0];
  expect(within(areaRegion(id)).getByRole("button", { name: "Alpha" })).toBeVisible();
  fireEvent.click(within(areaRegion(id)).getByRole("button", { name: "Remove Alpha from Composition" }));
  fireEvent.click(within(areaRegion(id)).getByRole("button", { name: "Remove Beta from Composition" }));
  fireEvent.click(within(areaRegion(id)).getByRole("button", { name: "Composition Area" }));
  fireEvent.click(screen.getByRole("button", { name: "Alpha" }), { ctrlKey: true });
  expect(useWidgetStore.getState().selectedCompositionId).toBe(id);
  fireEvent.click(screen.getByRole("checkbox", { name: "Include Beta in Composition" }));
  fireEvent.click(screen.getByRole("button", { name: "Add checked images to Composition Area" }));
  expect(saved().layout.areas[id].members).toEqual(["a", "b"]);
  expect(new Set(Object.keys(saved().widgets)).size).toBe(3);
});

it("deletes the container through its explicit action and deletes children separately", () => {
  usePageStore.getState().setPage(createWyrmetizerCopy(source(), compositionAdapters));
  usePageStore.temporal.getState().clear();
  render(<Editor />);
  fireEvent.click(within(areaRegion("canvas")).getByRole("button", { name: "Alpha" }));
  fireEvent.keyDown(document.body, { key: "Delete" });
  expect(saved().widgets.a).toBeUndefined();
  fireEvent.click(within(areaRegion("canvas")).getByRole("button", { name: "Beta" }));
  fireEvent.keyDown(document.body, { key: "Delete" });
  expect(saved().layout.areas.canvas.members).toEqual([]);
  act(() => usePageStore.temporal.getState().undo());
  act(() => usePageStore.temporal.getState().undo());
  const before = saved();
  fireEvent.click(within(areaRegion("canvas")).getByRole("button", { name: "Composition Area" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete Composition Area" }));
  expect(saved().layout.areas).toEqual({});
  expect(saved().widgets.a.settings.name).toBe("Alpha");
  expect(saved().widgets.b.settings.name).toBe("Beta");
  expect(saved().widgetsOrder).toEqual(["a", "b", "after"]);
  act(() => usePageStore.temporal.getState().undo()); expect(saved()).toEqual(before);
});

it("reorders whole areas and each active child order without changing ownership or the inactive arrangement", () => {
  usePageStore.getState().setPage(createWyrmetizerCopy(source(), compositionAdapters));
  render(<Editor />);
  let before = saved();
  act(() => usePageStore.temporal.getState().clear());
  fireEvent.click(screen.getByRole("button", { name: "Move Composition Area canvas down" }));
  expect(saved().layout.contentOrder).toEqual([{ kind: "widget", id: "after" }, { kind: "area", id: "canvas" }]);
  expect(saved().layout.areas.canvas).toEqual(before.layout.areas.canvas);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Move Alpha down" }));
  expect(saved().layout.areas.canvas.composition.geometry.childrenOrder).toEqual(["b", "a"]);
  expect(saved().layout.areas.canvas.flow).toEqual(before.layout.areas.canvas.flow);
  act(() => switchPairedCompositionMode("canvas", "flow"));
  before = saved();
  fireEvent.click(screen.getByRole("button", { name: "Move Alpha down" }));
  expect(saved().layout.areas.canvas.flow.order).toEqual(["b", "a"]);
  expect(saved().layout.areas.canvas.composition).toEqual(before.layout.areas.canvas.composition);
  expect(moveHierarchyItem({ id: "after", areaId: "canvas" }, -1)).toBe(false);
  expect(saved().layout.areas.canvas.members).toEqual(["a", "b"]);
});

it("inserts ordinary Widgets and clipboard copies beside empty areas even when a child is selected", () => {
  usePageStore.getState().setPage(createWyrmetizerCopy(source(), compositionAdapters));
  createEmptyCompositionArea({ index: 1 });
  const empty = useWidgetStore.getState().selectedCompositionId;
  useWidgetStore.getState().setSelectedWidgetId("a");
  render(<Editor />);
  const before = saved();
  fireEvent.click(screen.getAllByRole("button", { name: "pageEditor.actions.addWidget" })[1]);
  fireEvent.click(screen.getByRole("option", { name: "Image" }));
  const id = useWidgetStore.getState().selectedWidgetId;
  expect(saved().layout.contentOrder[1]).toEqual({ kind: "widget", id });
  expect(saved().layout.contentOrder[2]).toEqual({ kind: "area", id: empty });
  expect(saved().layout.areas).toEqual(before.layout.areas);
  act(() => useWidgetStore.getState().copyWidget("a"));
  fireEvent.click(screen.getAllByRole("button", { name: "pageEditor.actions.addWidget" })[3]);
  fireEvent.click(screen.getByRole("button", { name: "pageEditor.actions.pasteWidget" }));
  const copy = useWidgetStore.getState().selectedWidgetId;
  expect(saved().layout.contentOrder[3]).toEqual({ kind: "widget", id: copy });
  expect(saved().layout.areas).toEqual(before.layout.areas);
});

it("keeps legacy pages behind copy-first conversion and mobile membership read-only", () => {
  usePageStore.getState().setPage(source());
  const { unmount } = render(<Editor />);
  fireEvent.click(screen.getAllByRole("button", { name: "pageEditor.actions.addWidget" })[0]);
  expect(screen.queryByRole("option", { name: "Composition Area" })).toBeNull();
  unmount();
  usePageStore.getState().setPage(createWyrmetizerCopy(source(), compositionAdapters));
  useWidgetStore.setState({ compositionContext: "mobile" });
  render(<Editor />);
  fireEvent.click(within(areaRegion("canvas")).getByRole("button", { name: "Composition Area" }));
  expect(screen.getByRole("button", { name: "Delete Composition Area" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove Alpha from Composition" })).toBeDisabled();
});
