import { expect, it } from "vitest";
import { fixture } from "../../../../core/src/runtime/__tests__/compositionFixture.js";
import { isCompositionGeometryOnlyChange, requiresPreviewRegeneration } from "../compositionPreview";
import { createEmptyWyrmetizerComposition, initializeWyrmetizerPage, openWyrmetizerEditorPage, switchWyrmetizerMode } from "@widgetizer/core/wyrmetizerLayouts";
import { compositionAdapters } from "@widgetizer/core/compositionImage";

const state = () => {
  const page = fixture();
  return { page, widgets: page.widgets, globalWidgets: {}, themeSettings: {} };
};
it("renders an empty Area mode switch instead of treating it as a geometry-only update", () => {
  const page = createEmptyWyrmetizerComposition(initializeWyrmetizerPage({ widgets: {} }, compositionAdapters), "empty", compositionAdapters);
  const before = { page: openWyrmetizerEditorPage(page, compositionAdapters) };
  const after = { page: openWyrmetizerEditorPage(switchWyrmetizerMode(page, "empty", "flow", compositionAdapters), compositionAdapters) };
  expect(before.page.layout).toEqual(after.page.layout);
  expect(isCompositionGeometryOnlyChange(before, after)).toBe(false);
});
it.each(["move", "layer", "resize", "alignment", "height", "rotation"])(
  "reconciles %s directly without a morph/reload that could snap geometry",
  (action) => {
    const before = state(),
      after = structuredClone(before);
    after.widgets = after.page.widgets;
    if (action === "move") after.page.layout.compositions.canvas.placements.a.frames.desktop.x = 0.6;
    if (action === "layer") after.page.layout.compositions.canvas.stackOrder.reverse();
    if (action === "resize") after.widgets.a.settings.image_transform.dimensions.width.value = 250;
    if (action === "alignment") after.widgets.a.settings.image_transform.alignment = "right";
    if (action === "height") after.page.layout.compositions.canvas.profiles.desktop.height.valuePx = 900;
    if (action === "rotation") after.page.layout.compositions.canvas.placements.a.frames.desktop.rotation = 30;
    expect(isCompositionGeometryOnlyChange(before, after)).toBe(true);
  },
);
it.each(["source", "overflow", "block order", "theme"])("retains rendering for %s changes", (action) => {
  const before = state(),
    after = structuredClone(before);
  after.widgets = after.page.widgets;
  if (action === "source") after.widgets.a.settings.image = "/uploads/images/other.jpg";
  if (action === "overflow") after.page.layout.compositions.canvas.profiles.desktop.overflow = "visible";
  if (action === "block order") after.page.layout.contentOrder.reverse();
  if (action === "theme") after.themeSettings = { color: "pink" };
  expect(isCompositionGeometryOnlyChange(before, after)).toBe(false);
});

it("keeps v3 Composition geometry updates in the current preview while retaining full renders for content or structure", () => {
  const before = state(), after = structuredClone(before);
  for (const value of [before, after]) value.page.wyrmetizerEditorLayout = { version: 3, areas: { canvas: { activeMode: "composition" } } };
  after.page.layout.compositions.canvas.placements.a.frames.desktop.x = 0.6;
  after.widgets = after.page.widgets;
  expect(isCompositionGeometryOnlyChange(before, after)).toBe(true);
  expect(requiresPreviewRegeneration(after, before, false, true)).toBe(false);

  const content = structuredClone(after);
  content.widgets.a.settings.image = "/uploads/other.png";
  content.page.widgets = content.widgets;
  expect(requiresPreviewRegeneration(content, after, false, true)).toBe(true);

  const structure = structuredClone(after);
  structure.page.layout.contentOrder.reverse();
  expect(requiresPreviewRegeneration(structure, after, true, true)).toBe(true);

  const responsiveChange = structuredClone(after);
  responsiveChange.page.wyrmetizerEditorLayout.areas.canvas.mobile = { independent: true };
  expect(requiresPreviewRegeneration(responsiveChange, after, false, true)).toBe(true);
});
