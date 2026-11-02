// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../../../../../../themes/arch/widgets/image/schema.json";
import { fixture } from "../../../../../core/src/runtime/__tests__/compositionFixture.js";
import { createWyrmetizerCopy, serializeWyrmetizerEditorPage, switchWyrmetizerMode, initializeWyrmetizerPage, convertWyrmetizerPageToV3 } from "@widgetizer/core/wyrmetizerLayouts";
import { compositionAdapters } from "@widgetizer/core/compositionImage";
import { mobilePresentationControlState } from "../../../lib/mobilePresentationControls";

vi.mock("../../../hooks/useThemeLocale", () => ({ useThemeLocale: () => ({ tTheme: key => key }) }));
vi.mock("../../../hooks/useCollections", () => ({ default: () => ({ schemas: [] }) }));
vi.mock("../../../lib/activeProjectId", () => ({ getActiveProjectId: () => "p1" }));
vi.mock("../../../queries/previewManager", () => ({ getProjectWidgets: vi.fn() }));
import pageStore from "../../../stores/pageStore";
import widgetStore from "../../../stores/widgetStore";
import saveStore from "../../../stores/saveStore";
import SettingsPanel from "../SettingsPanel";

function Panel() {
  const page = pageStore(s => s.page);
  return <SettingsPanel selectedWidgetId="a" selectedWidget={page.widgets.a} selectedWidgetSchema={schema} widgetSchemas={{ image: schema }} />;
}
const saved = () => serializeWyrmetizerEditorPage(pageStore.getState().page, compositionAdapters);
beforeEach(() => {
  const source = fixture();
  source.id = "mobile-controls";
  source.widgets.a.settings.top_spacing = "px";
  source.widgets.a.settings.top_spacing_px = 12;
  source.widgets.a.settings.fullwidth = true;
  pageStore.getState().setPage(createWyrmetizerCopy(source, compositionAdapters));
  pageStore.temporal.getState().clear();
  widgetStore.setState({ compositionContext: "mobile", schemas: { image: schema }, selectedWidgetId: "a", selectedCompositionId: null,
    selectedBlockId: null, compositionSelection: [], imageGeometry: { a: {
      imageSource: "/uploads/images/photo.jpg", containerWidth: 390, width: 390, height: 219.375,
    } } });
});
afterEach(() => { cleanup(); saveStore.getState().stopAutoSave(); });

it.each(["flow", "composition"])("edits resolved %s Mobile presentation, resets each scope, and persists one-step history", mode => {
  if (mode === "flow") pageStore.getState().setPage(switchWyrmetizerMode(saved(), "canvas", mode, compositionAdapters));
  pageStore.temporal.getState().clear();
  const before = saved();
  render(<Panel />);
  const input = screen.getByRole("spinbutton", { name: "Top Spacing (px)" });
  expect(input.value).toBe("12");
  expect(screen.getByRole("button", { name: "Reset Property top_spacing_px" }).disabled).toBe(true);
  fireEvent.change(input, { target: { value: "0" } });
  expect(saved()).toEqual(before);
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.blur(input);
  expect(saved()).toEqual(before);
  expect(pageStore.temporal.getState().pastStates).toHaveLength(0);
  fireEvent.change(input, { target: { value: "0" } });
  fireEvent.keyDown(input, { key: "Enter" });
  const committed = saved();
  expect(committed.layout.version).toBe(3);
  expect(committed.layout.mobile.areas.canvas[mode].presentation.a).toEqual({ top_spacing_px: 0 });
  expect(committed.layout.areas).toEqual(before.layout.areas);
  expect(committed.widgets).toEqual(before.widgets);
  expect(pageStore.temporal.getState().pastStates).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Reset Property top_spacing_px" }).disabled).toBe(false);
  act(() => pageStore.temporal.getState().undo());
  expect(saved()).toEqual(before);
  act(() => pageStore.temporal.getState().redo());
  expect(saved()).toEqual(committed);
  act(() => pageStore.getState().setPage(JSON.parse(JSON.stringify(committed))));
  expect(screen.getByRole("spinbutton", { name: "Top Spacing (px)" }).value).toBe("0");
  fireEvent.click(screen.getByRole("button", { name: "Reset Property top_spacing_px" }));
  expect(screen.getByRole("spinbutton", { name: "Top Spacing (px)" }).value).toBe("12");
  fireEvent.click(screen.getByRole("switch", { name: "Default Scale" }));
  expect(saved().layout.mobile.areas.canvas[mode].presentation.a.fullwidth).toBe(false);
  expect(saved().layout.areas).toEqual(before.layout.areas);
  fireEvent.click(screen.getByRole("button", { name: "Reset Widget" }));
  expect(saved().layout.mobile.areas).toBeUndefined();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Top Spacing (px)" }), { target: { value: "21" } });
  fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Top Spacing (px)" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "Reset Current Mobile Mode" }));
  expect(saved().layout.mobile.areas).toBeUndefined();
});

it("edits transform dimensions and units from the resolved Mobile value without touching Desktop", () => {
  render(<Panel />);
  const before = saved();
  let input = screen.getByRole("spinbutton", { name: "Width" });
  expect(input.value).toBe("300");
  fireEvent.change(input, { target: { value: "240" } });
  fireEvent.keyDown(input, { key: "Enter" });
  const patch = () => saved().layout.mobile.areas.canvas.composition.presentation.a.image_transform;
  expect(patch().dimensions.width).toEqual({ unit: "px", value: 240 });
  input = screen.getByRole("spinbutton", { name: "Height" });
  fireEvent.change(input, { target: { value: "150" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(patch().dimensions.width.value).toBe(240);
  expect(patch().dimensions.height.value).toBe(150);
  fireEvent.change(screen.getByRole("combobox", { name: "Width unit" }), { target: { value: "%" } });
  expect(patch().dimensions.width).toEqual({ unit: "%", value: 61.54 });
  expect(saved().layout.areas).toEqual(before.layout.areas);
  expect(pageStore.temporal.getState().pastStates).toHaveLength(3);
});

it("uses the 390px Mobile canvas for first-edit unit conversion even with a retained Desktop measurement", () => {
  widgetStore.setState({ imageGeometry: { a: { imageSource: "/uploads/images/photo.jpg", containerWidth: 1200,
    width: 1200, height: 675, naturalWidth: 1600, naturalHeight: 900 } } });
  render(<Panel />);
  const before = saved();
  fireEvent.change(screen.getByRole("combobox", { name: "Width unit" }), { target: { value: "%" } });
  expect(saved().layout.mobile.areas.canvas.composition.presentation.a.image_transform.dimensions.width).toEqual({ unit: "%", value: 76.92 });
  expect(saved().layout.areas).toEqual(before.layout.areas);
});

it("keeps shared content editable on Mobile and Desktop settings on Desktop", () => {
  render(<Panel />);
  fireEvent.change(screen.getByRole("textbox", { name: "pageEditor.widgetName.label" }), { target: { value: "Shared name" } });
  fireEvent.blur(screen.getByRole("textbox", { name: "pageEditor.widgetName.label" }));
  expect(saved().widgets.a.settings.name).toBe("Shared name");
  expect(saved().layout.version).toBe(2);
  act(() => widgetStore.setState({ compositionContext: "desktop" }));
  expect(screen.queryByRole("button", { name: "Reset Widget" })).toBeNull();
  const input = screen.getByRole("spinbutton", { name: "Top Spacing (px)" });
  fireEvent.change(input, { target: { value: "33" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(saved().layout.areas.canvas.composition.presentation.a.top_spacing_px).toBe(33);
  expect(saved().layout.version).toBe(2);
});

it("keeps Flow and Composition overrides independent and reports inherited values after a mode switch", () => {
  render(<Panel />);
  const input = screen.getByRole("spinbutton", { name: "Top Spacing (px)" });
  fireEvent.change(input, { target: { value: "29" } });
  fireEvent.keyDown(input, { key: "Enter" });
  act(() => pageStore.getState().setPage(switchWyrmetizerMode(saved(), "canvas", "flow", compositionAdapters)));
  expect(screen.getByRole("spinbutton", { name: "Top Spacing (px)" }).value).toBe("12");
  expect(screen.getByRole("button", { name: "Reset Property top_spacing_px" }).disabled).toBe(true);
  expect(mobilePresentationControlState(pageStore.getState().page, "a").patch).toEqual({});
  expect(saved().layout.mobile.areas.canvas.composition.presentation.a.top_spacing_px).toBe(29);
});

it("edits standalone Flow Images through the same controls and leaves no-op drafts on v2", () => {
  const widget = structuredClone(pageStore.getState().page.widgets.a);
  pageStore.getState().setPage(initializeWyrmetizerPage({ id: "standalone", widgets: { a: widget }, widgetsOrder: ["a"] }, compositionAdapters));
  pageStore.temporal.getState().clear();
  const before = saved();
  render(<Panel />);
  const input = screen.getByRole("spinbutton", { name: "Top Spacing (px)" });
  fireEvent.change(input, { target: { value: "12" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "Reset Widget" }));
  fireEvent.click(screen.getByRole("button", { name: "Reset Current Mobile Mode" }));
  expect(saved()).toEqual(before);
  expect(pageStore.temporal.getState().pastStates).toHaveLength(0);
  fireEvent.change(input, { target: { value: "4" } });
  fireEvent.blur(input);
  expect(saved().layout.mobile.presentation.a).toEqual({ top_spacing_px: 4 });
  expect(saved().widgets).toEqual(before.widgets);
  expect(screen.getAllByText("Overridden").length).toBeGreaterThan(0);
});

it("shows resolved Mobile Area height while leaving geometry controls disabled", () => {
  pageStore.getState().setPage(convertWyrmetizerPageToV3(saved(), compositionAdapters));
  const canonical = saved();
  const expected = canonical.layout.areas.canvas.composition.geometry.profiles.desktop.height.valuePx * 390 /
    canonical.layout.areas.canvas.composition.geometry.profiles.desktop.referenceWidthPx;
  render(<Panel />);
  expect(Number(screen.getByRole("textbox", { name: "Canvas height" }).value)).toBe(expected);
  expect(screen.getByRole("textbox", { name: "Canvas height" }).disabled).toBe(true);
  expect(screen.getByRole("textbox", { name: "Image rotation angle" }).disabled).toBe(true);
});
