// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
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
  widgetStore.setState({ schemas: { [type]: currentSchema } });
  render(
    <SettingsPanel
      selectedWidgetId="w1"
      selectedWidget={widget}
      selectedWidgetSchema={currentSchema}
      widgetSchemas={{ [type]: currentSchema }}
    />,
  );
}
it("uses live controls for image dimensions and explains Full Width", () => {
  panel();
  expect(dimensions.map((props) => props.setting.id)).toEqual(["image_width_percent", "image_height_px"]);
  expect(dimensions.map((props) => props.value)).toEqual([45, 350]);
  expect(screen.getByText(/Enabling Full Width resets Width to 100%/)).toBeTruthy();
  expect(settings.some((props) => props.setting.id === "image_width_percent")).toBe(false);
});
it("leaves unrelated widget range inputs on the shared renderer", () => {
  panel("gallery");
  expect(dimensions).toEqual([]);
  expect(settings.some((props) => props.setting.id === "image_width_percent")).toBe(true);
  expect(screen.queryByText(/Enabling Full Width resets/)).toBeNull();
});
it("routes Full Width through one atomic store change and existing dirty tracking", () => {
  panel();
  act(() => settings.find((props) => props.setting.id === "fullwidth").onChange("fullwidth", true));
  expect(pageStore.getState().page.widgets.w1.settings).toEqual({
    fullwidth: true,
    image_width_percent: 100,
    image_height_px: 350,
  });
  expect(pageStore.temporal.getState().pastStates).toHaveLength(1);
  expect(markWidgetModified).toHaveBeenCalledExactlyOnceWith("w1");
});
