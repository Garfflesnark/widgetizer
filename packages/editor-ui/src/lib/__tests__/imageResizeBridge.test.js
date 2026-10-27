import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../../../../../themes/arch/widgets/image/schema.json";

let savedPage;
vi.mock("../../queries/pageManager", () => ({
  savePageContent: vi.fn(async (_id, page) => {
    savedPage = JSON.parse(JSON.stringify(page));
    return { success: true };
  }),
  getPage: vi.fn(async () => JSON.parse(JSON.stringify(savedPage))),
}));
vi.mock("../../queries/previewManager", () => ({
  getGlobalWidgets: vi.fn(async () => ({})),
  getProjectWidgets: vi.fn(),
}));
vi.mock("../../queries/mediaManager", () => ({ invalidateMediaCache: vi.fn() }));
vi.mock("../../lib/activeProjectId", () => ({ getActiveProjectId: () => "p1" }));
vi.mock("../../stores/projectStore", () => ({ default: { getState: () => ({ activeProject: { id: "p1" } }) } }));
vi.mock("../../stores/themeStore", () => ({
  default: {
    getState: () => ({
      settings: {},
      loadedProjectId: "p1",
      hasUnsavedThemeChanges: () => false,
    }),
  },
}));

const { default: pageStore } = await import("../../stores/pageStore");
const { default: widgetStore } = await import("../../stores/widgetStore");
const { default: saveStore } = await import("../../stores/saveStore");
const { savePageContent } = await import("../../queries/pageManager");
const { handleImageResizeMessage, supportedImageWidgetIds } = await import("../imageResizeBridge");
const iframe = {};
const origin = "https://preview.example";
const message = (width = 60, startWidth = 100) => ({
  source: iframe,
  origin,
  data: { type: "IMAGE_RESIZE_COMMIT", payload: { widgetId: "w1", width, startWidth } },
});
beforeEach(() => {
  vi.clearAllMocks();
  const page = {
    id: "index",
    slug: "index",
    name: "Home",
    widgets: { w1: { type: "image", settings: {} } },
    widgetsOrder: ["w1"],
  };
  pageStore.setState({
    page,
    originalPage: structuredClone(page),
    loadedProjectId: "p1",
    globalWidgets: {},
    originalGlobalWidgets: {},
  });
  pageStore.temporal.getState().clear();
  widgetStore.setState({ schemas: { image: schema }, selectedWidgetId: "w1", selectedBlockId: null });
  saveStore.setState({
    modifiedWidgets: new Set(),
    structureModified: false,
    themeSettingsModified: false,
    savingSuspended: false,
  });
});
afterEach(() => saveStore.getState().stopAutoSave());

it("commits once, marks dirty, and gives consecutive gestures independent undo steps", () => {
  expect(handleImageResizeMessage(message(), iframe, origin)).toBe(true);
  expect(pageStore.getState().page.widgets.w1.settings.image_width_percent).toBe(60);
  expect(saveStore.getState().modifiedWidgets.has("w1")).toBe(true);
  expect(handleImageResizeMessage(message(), iframe, origin)).toBe(false);
  expect(handleImageResizeMessage(message(40, 60), iframe, origin)).toBe(true);
  expect(pageStore.temporal.getState().pastStates).toHaveLength(2);
  pageStore.temporal.getState().undo();
  expect(pageStore.getState().page.widgets.w1.settings.image_width_percent).toBe(60);
  pageStore.temporal.getState().undo();
  expect(pageStore.getState().page.widgets.w1.settings.image_width_percent).toBeUndefined();
  pageStore.temporal.getState().redo();
  expect(pageStore.getState().page.widgets.w1.settings.image_width_percent).toBe(60);
});
it("uses the existing save and load paths", async () => {
  handleImageResizeMessage(message(), iframe, origin);
  expect((await saveStore.getState().save()).status).toBe("success");
  expect(savePageContent).toHaveBeenCalledTimes(1);
  expect(savedPage.widgets.w1.settings.image_width_percent).toBe(60);
  await pageStore.getState().loadPage("index");
  expect(pageStore.getState().page.widgets.w1.settings.image_width_percent).toBe(60);
  expect(saveStore.getState().hasUnsavedChanges()).toBe(false);
});
it.each([NaN, Infinity, "50", null, 9, 101, 50.5])("rejects invalid message and sidebar width %s", (width) => {
  expect(handleImageResizeMessage(message(width), iframe, origin)).toBe(false);
  widgetStore.getState().updateWidgetSettingValues("w1", { image_width_percent: width });
  expect(pageStore.getState().page.widgets.w1.settings.image_width_percent).toBeUndefined();
});
it.each(["source", "origin", "wildcard", "selection", "block", "capability", "type", "stale", "global", "payload"])(
  "rejects %s",
  (kind) => {
    const event = message();
    if (kind === "source") event.source = {};
    if (kind === "origin") event.origin = "https://evil.example";
    if (kind === "selection") widgetStore.setState({ selectedWidgetId: null });
    if (kind === "block") widgetStore.setState({ selectedBlockId: "b1" });
    if (kind === "capability") widgetStore.setState({ schemas: { image: { ...schema, settings: [] } } });
    if (kind === "type") pageStore.getState().page.widgets.w1.type = "gallery";
    if (kind === "stale") event.data.payload.startWidth = 50;
    if (kind === "global") event.data.payload.widgetId = "header";
    if (kind === "payload") event.data.payload = null;
    expect(handleImageResizeMessage(event, iframe, kind === "wildcard" ? "*" : origin)).toBe(false);
    expect(pageStore.temporal.getState().pastStates).toHaveLength(0);
  },
);
it("advertises only schema-supported page images", () => {
  const page = { widgets: { supported: { type: "image" }, other: { type: "gallery" }, header: { type: "image" } } };
  expect(supportedImageWidgetIds(page, { image: schema })).toEqual(["supported"]);
  expect(supportedImageWidgetIds(page, { image: { ...schema, settings: [] } })).toEqual([]);
});

it("commits width and height atomically with one undo step and persistence", async () => {
  const event = message(60);
  Object.assign(event.data.payload, { height: 350, startHeight: 0 });
  expect(handleImageResizeMessage(event, iframe, origin)).toBe(true);
  expect(pageStore.temporal.getState().pastStates).toHaveLength(1);
  expect(pageStore.getState().page.widgets.w1.settings).toEqual({ image_width_percent: 60, image_height_px: 350 });
  pageStore.temporal.getState().undo();
  expect(pageStore.getState().page.widgets.w1.settings).toEqual({});
  pageStore.temporal.getState().redo();
  await saveStore.getState().save();
  await pageStore.getState().loadPage("index");
  expect(pageStore.getState().page.widgets.w1.settings).toEqual({ image_width_percent: 60, image_height_px: 350 });
});
it.each([NaN, Infinity, "300", null, -1, 2001, 300.5])("rejects invalid height %s from mouse and sidebar", (height) => {
  const event = message();
  Object.assign(event.data.payload, { height, startHeight: 0 });
  expect(handleImageResizeMessage(event, iframe, origin)).toBe(false);
  widgetStore.getState().updateWidgetSettingValues("w1", { image_height_px: height });
  expect(pageStore.temporal.getState().pastStates).toHaveLength(0);
});
it("rejects stale height and height changes for a width-only schema", () => {
  const event = message();
  Object.assign(event.data.payload, { height: 300, startHeight: 200 });
  expect(handleImageResizeMessage(event, iframe, origin)).toBe(false);
  event.data.payload.startHeight = 0;
  widgetStore.setState({
    schemas: { image: { ...schema, settings: schema.settings.filter((s) => s.id !== "image_height_px") } },
  });
  expect(handleImageResizeMessage(event, iframe, origin)).toBe(false);
});
it("enabling Full Width resets width once without changing height; undo restores both settings", () => {
  const initial = { image_width_percent: 45, image_height_px: 350, fullwidth: false };
  pageStore.getState().page.widgets.w1.settings = initial;
  pageStore.temporal.getState().clear();
  widgetStore.getState().updateWidgetSettingValues("w1", { fullwidth: true });
  expect(pageStore.getState().page.widgets.w1.settings).toEqual({
    ...initial,
    fullwidth: true,
    image_width_percent: 100,
  });
  expect(pageStore.temporal.getState().pastStates).toHaveLength(1);
  pageStore.temporal.getState().undo();
  expect(pageStore.getState().page.widgets.w1.settings).toEqual(initial);
});
it("preserves already-saved full-width percentages and allows resizing after enabling Full Width", () => {
  pageStore.getState().page.widgets.w1.settings = { fullwidth: true, image_width_percent: 45 };
  widgetStore.getState().updateWidgetSettingValues("w1", { fullwidth: true });
  expect(pageStore.getState().page.widgets.w1.settings.image_width_percent).toBe(45);
  widgetStore.getState().updateWidgetSettingValues("w1", { image_width_percent: 65 });
  expect(pageStore.getState().page.widgets.w1.settings).toEqual({ fullwidth: true, image_width_percent: 65 });
  widgetStore.getState().updateWidgetSettingValues("w1", { fullwidth: false });
  expect(pageStore.getState().page.widgets.w1.settings.image_width_percent).toBe(65);
  expect(schema.settings.find((s) => s.id === "fullwidth").default).toBe(false);
});
