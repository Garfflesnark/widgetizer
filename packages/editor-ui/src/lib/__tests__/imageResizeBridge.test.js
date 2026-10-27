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
const { handleImageGeometryMessage, editedImageTransform } = await import("../imageResizeBridge");
const { changeImageUnit, handleImageAlignmentMessage } = await import("../imageResizeBridge");
const { DEFAULT_IMAGE_TRANSFORM } = await import("@widgetizer/core/imageTransform");
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
  widgetStore.setState({ schemas: { image: { ...schema, imageTransformVersion: undefined } }, selectedWidgetId: "w1", selectedBlockId: null, imageGeometry: {} });
  saveStore.setState({
    modifiedWidgets: new Set(),
    structureModified: false,
    themeSettingsModified: false,
    savingSuspended: false,
  });
});
afterEach(() => saveStore.getState().stopAutoSave());

it("persists independent unit changes, alignment and Default Scale with undo/redo and save/reload", async () => {
  widgetStore.setState({ schemas: { image: schema }, imageGeometry: { w1: { containerWidth: 1000, width: 800, height: 600, imageSource: "" } } });
  widgetStore.getState().resetImageScale("w1");
  const align = (alignment) => ({ source: iframe, origin, data: { type: "IMAGE_ALIGN", payload: { widgetId: "w1", alignment } } });
  expect(handleImageAlignmentMessage({ ...align("right"), origin: "https://evil.example" }, iframe, origin)).toBe(false);
  expect(handleImageAlignmentMessage(align("bad"), iframe, origin)).toBe(false);
  expect(handleImageAlignmentMessage(align("right"), iframe, origin)).toBe(true);
  expect(changeImageUnit("w1", "width", "px")).toBe(true);
  let transform = editedImageTransform("w1", "image_scale_width", 317);
  widgetStore.getState().updateWidgetSettingValues("w1", { image_transform: transform });
  expect(changeImageUnit("w1", "height", "px")).toBe(true);
  transform = editedImageTransform("w1", "image_scale_height", 243);
  widgetStore.getState().updateWidgetSettingValues("w1", { image_transform: transform });
  expect(transform.dimensions).toEqual({ width: { unit: "px", value: 317 }, height: { unit: "px", value: 243 } });
  const count = pageStore.temporal.getState().pastStates.length;
  widgetStore.getState().resetImageScale("w1");
  expect(pageStore.temporal.getState().pastStates).toHaveLength(count + 1);
  expect(pageStore.getState().page.widgets.w1.settings.image_transform.alignment).toBe("right");
  pageStore.temporal.getState().undo();
  expect(pageStore.getState().page.widgets.w1.settings.image_transform).toEqual(transform);
  pageStore.temporal.getState().redo();
  expect(pageStore.getState().page.widgets.w1.settings.image_transform.dimensions.width.value).toBeNull();
  pageStore.temporal.getState().undo();
  expect((await saveStore.getState().save()).status).toBe("success");
  await pageStore.getState().loadPage("index");
  expect(pageStore.getState().page.widgets.w1.settings.image_transform).toEqual(transform);
});

it("validates reference messages and makes both percentages comparable with independent Auto", () => {
  const context = { source: iframe, origin, data: { type: "IMAGE_GEOMETRY_CONTEXT", payload: {
    widgetId: "w1", containerWidth: 1000, width: 800, height: 600, imageSource: "",
  } } };
  expect(handleImageGeometryMessage({ ...context, source: {} }, iframe, origin)).toBe(false);
  expect(handleImageGeometryMessage({ ...context, origin: "https://evil.example" }, iframe, origin)).toBe(false);
  expect(handleImageGeometryMessage(context, iframe, origin)).toBe(true);
  widgetStore.getState().resetImageScale("w1");
  const width = editedImageTransform("w1", "image_scale_width", 50);
  widgetStore.getState().updateWidgetSettingValues("w1", { image_transform: width });
  expect(editedImageTransform("w1", "image_scale_height", 50).scale).toEqual({ width: 50, height: 50 });
  expect(editedImageTransform("w1", "image_scale_height", 80).scale).toEqual({ width: 50, height: 80 });
  expect(editedImageTransform("w1", "image_scale_width", 0).scale.width).toBeNull();
  for (const invalid of [-1, NaN, Infinity, "50", 401, 0.5]) {
    expect(editedImageTransform("w1", "image_scale_width", invalid)).toBeNull();
  }
});

it("resets both axes and insets atomically, leaves legacy fields intact and avoids a duplicate reset", () => {
  const settings = { fullwidth: true, image_width_percent: 73, image_height_px: 350,
    image_transform: { ...structuredClone(DEFAULT_IMAGE_TRANSFORM), scale: { width: 50, height: 80 }, flowInset: { inlinePercent: 12, blockPercent: 25 } } };
  pageStore.setState({ page: { ...pageStore.getState().page, widgets: { w1: { type: "image", settings } } } });
  pageStore.temporal.getState().clear();
  widgetStore.getState().resetImageScale("w1");
  expect(pageStore.temporal.getState().pastStates).toHaveLength(1);
  expect(pageStore.getState().page.widgets.w1.settings).toEqual({ ...settings, fullwidth: false, image_transform: DEFAULT_IMAGE_TRANSFORM });
  widgetStore.getState().resetImageScale("w1");
  expect(pageStore.temporal.getState().pastStates).toHaveLength(1);
  pageStore.temporal.getState().undo();
  expect(pageStore.getState().page.widgets.w1.settings).toEqual(settings);
  pageStore.temporal.getState().redo();
  expect(pageStore.getState().page.widgets.w1.settings.image_transform).toEqual(DEFAULT_IMAGE_TRANSFORM);
});

it("commits one modern geometry change, rejects stale or invalid gestures, and saves/reloads it", async () => {
  const transform = { ...structuredClone(DEFAULT_IMAGE_TRANSFORM), scale: { width: 50, height: 50 }, flowInset: { inlinePercent: 10, blockPercent: 50 } };
  const event = { source: iframe, origin, data: { type: "IMAGE_RESIZE_COMMIT", payload: { widgetId: "w1", startTransform: null, transform } } };
  expect(handleImageResizeMessage({ ...event, data: { ...event.data, payload: { ...event.data.payload, transform: { ...transform, scale: { width: 500, height: 50 } } } } }, iframe, origin)).toBe(false);
  expect(handleImageResizeMessage(event, iframe, origin)).toBe(true);
  expect(handleImageResizeMessage(event, iframe, origin)).toBe(false);
  expect(pageStore.temporal.getState().pastStates).toHaveLength(1);
  expect((await saveStore.getState().save()).status).toBe("success");
  await pageStore.getState().loadPage("index");
  expect(pageStore.getState().page.widgets.w1.settings.image_transform).toEqual(transform);
});

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
