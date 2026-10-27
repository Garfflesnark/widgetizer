// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import schema from "../../../../../../themes/arch/widgets/image/schema.json";

const dimensions = [];
const settings = [];
vi.mock("../ImageDimensionInput", () => ({
  default: (props) => {
    dimensions.push(props);
    return null;
  },
}));
vi.mock("../../settings", () => ({
  SettingsRenderer: (props) => {
    settings.push(props);
    return null;
  },
}));
vi.mock("../../../hooks/useThemeLocale", () => ({ useThemeLocale: () => ({ tTheme: (key) => key }) }));
vi.mock("../../../hooks/useCollections", () => ({ default: () => ({ schemas: [] }) }));
vi.mock("../../../lib/activeProjectId", () => ({ getActiveProjectId: () => "p1" }));
vi.mock("../../../queries/previewManager", () => ({ getProjectWidgets: vi.fn() }));
const markWidgetModified = vi.fn();
vi.mock("../../../stores/saveStore", () => {
  const state = { markWidgetModified: (...args) => markWidgetModified(...args), setThemeSettingsModified: vi.fn() };
  const hook = () => state;
  hook.getState = () => state;
  return { default: hook };
});
const { default: pageStore } = await import("../../../stores/pageStore");
const { default: widgetStore } = await import("../../../stores/widgetStore");
const { default: SettingsPanel } = await import("../SettingsPanel");
beforeEach(() => {
  dimensions.length = 0;
  settings.length = 0;
  markWidgetModified.mockClear();
});
function panel(type = "image") {
  const widget = { type, settings: { image_width_percent: 45, image_height_px: 350, fullwidth: false } };
  const currentSchema = { ...schema, type };
  pageStore.setState({ page: { id: "index", widgets: { w1: widget }, widgetsOrder: ["w1"] } });
  pageStore.temporal.getState().clear();
  widgetStore.setState({ schemas: { [type]: currentSchema }, imageGeometry: { w1: { imageSource: "", containerWidth: 800, width: 800, height: 600 } } });
  render(
    <SettingsPanel
      selectedWidgetId="w1"
      selectedWidget={widget}
      selectedWidgetSchema={currentSchema}
      widgetSchemas={{ [type]: currentSchema }}
    />,
  );
}
it("uses percentage controls for both axes and replaces Full Width with Default Scale", () => {
  panel();
  expect(dimensions.map((props) => props.setting.id)).toEqual(["image_scale_width", "image_scale_height"]);
  expect(dimensions.map((props) => props.value)).toEqual([45, 58.33]);
  expect(screen.getByRole("switch", { name: "Default Scale" })).toBeTruthy();
  expect(settings.some((props) => props.setting.id === "image_width_percent")).toBe(false);
});
it("leaves unrelated widget range inputs on the shared renderer", () => {
  panel("gallery");
  expect(dimensions).toEqual([]);
  expect(settings.some((props) => props.setting.id === "image_width_percent")).toBe(true);
  expect(screen.queryByText(/Enabling Full Width resets/)).toBeNull();
});
it("resets both axes and flow spacing in one atomic Default Scale operation", () => {
  panel();
  act(() => fireEvent.click(screen.getByRole("switch", { name: "Default Scale" })));
  expect(pageStore.getState().page.widgets.w1.settings).toEqual({
    fullwidth: false,
    image_transform: { version: 2, reference: "intrinsic-fit", alignment: "center", dimensions: { width: { unit: "%", value: null }, height: { unit: "%", value: null } }, flowInset: { inlinePercent: 0, blockPercent: 0 } },
    image_width_percent: 45,
    image_height_px: 350,
  });
  expect(pageStore.temporal.getState().pastStates).toHaveLength(1);
  expect(markWidgetModified).toHaveBeenCalledExactlyOnceWith("w1");
});
