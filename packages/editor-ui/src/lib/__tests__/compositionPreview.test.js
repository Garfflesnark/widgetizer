import { expect, it } from "vitest";
import { fixture } from "../../../../core/src/runtime/__tests__/compositionFixture.js";
import { isCompositionGeometryOnlyChange } from "../compositionPreview";

const state = () => {
  const page = fixture();
  return { page, widgets: page.widgets, globalWidgets: {}, themeSettings: {} };
};
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
