import { expect, it } from "vitest";
import { createComposition } from "../composition.js";
import { compositionAdapters } from "../compositionImage.js";
import { defaultImageTransform } from "../imageTransform.js";
import { createWyrmetizerCopy, resolveWyrmetizerPage, switchWyrmetizerMode,
  editWyrmetizerWidget, duplicateWyrmetizerWidget, deleteWyrmetizerWidget, validateWyrmetizerPage,
  addWyrmetizerWidget, reorderWyrmetizerFlow } from "../wyrmetizerLayouts.js";
const adapters = compositionAdapters;
function fixture() {
  const transform = defaultImageTransform();
  transform.dimensions = { width: { unit: "px", value: 100 }, height: { unit: "px", value: 80 } };
  return createComposition({ widgets: { a: { type: "image", settings: { image: "/photo.png", link: "/one", image_transform: transform, top_spacing_px: 17 } } }, widgetsOrder: ["a"] },
    "area", ["a"], { a: { x: 0.2, y: 0.2, pivot: { x: 0, y: 0 } } });
}
it("creates an independent copy with canonical content and no input mutation", () => {
  const original = fixture(), before = JSON.stringify(original), copy = createWyrmetizerCopy(original, adapters);
  expect(JSON.stringify(original)).toBe(before);
  expect(copy.widgets.a.settings).toEqual({ image: "/photo.png", link: "/one" });
  expect(resolveWyrmetizerPage(copy)).toEqual(original);
});
it("preserves exact independent geometry across repeated switching and JSON reload", () => {
  let page = createWyrmetizerCopy(fixture(), adapters);
  const composition = structuredClone(page.layout.areas.area.composition);
  page = switchWyrmetizerMode(page, "area", "flow", adapters);
  const transform = structuredClone(page.layout.areas.area.flow.presentation.a.image_transform);
  transform.dimensions.width.value = 257;
  page = editWyrmetizerWidget(page, "a", { image_transform: transform, top_spacing_px: 93 }, adapters);
  const flow = structuredClone(page.layout.areas.area.flow);
  for (let i = 0; i < 30; i++) {
    page = switchWyrmetizerMode(JSON.parse(JSON.stringify(page)), "area", "composition", adapters);
    expect(page.layout.areas.area.composition).toEqual(composition);
    expect(resolveWyrmetizerPage(page).widgets.a.settings.image_transform.dimensions.width.value).toBe(100);
    page = switchWyrmetizerMode(page, "area", "flow", adapters);
    expect(page.layout.areas.area.flow).toEqual(flow);
    expect(resolveWyrmetizerPage(page).layout.compositions).toEqual({});
  }
});
it("shares content edits across both modes without copying layout settings into content", () => {
  let page = createWyrmetizerCopy(fixture(), adapters);
  page = editWyrmetizerWidget(page, "a", { link: "/changed", image: "/new.png" }, adapters);
  page = switchWyrmetizerMode(page, "area", "flow", adapters);
  expect(resolveWyrmetizerPage(page).widgets.a.settings.link).toBe("/changed");
  expect(page.widgets.a.settings.image_transform).toBeUndefined();
});
it("duplicates both arrangements independently and deletes all references without resurrection", () => {
  let page = createWyrmetizerCopy(fixture(), adapters);
  page = duplicateWyrmetizerWidget(page, "a", "b", adapters);
  expect(page.layout.areas.area.flow.order).toEqual(["a", "b"]);
  expect(page.layout.areas.area.composition.geometry.stackOrder).toEqual(["a", "b"]);
  page = deleteWyrmetizerWidget(page, "a", adapters);
  page = switchWyrmetizerMode(page, "area", "flow", adapters);
  expect(page.widgetsOrder).toEqual(["b"]);
  expect(page.widgets.a).toBeUndefined();
  page = deleteWyrmetizerWidget(page, "b", adapters);
  expect(page.layout.areas).toEqual({});
});
it("no-op mode switches and edits preserve identity for history suppression", () => {
  const page = createWyrmetizerCopy(fixture(), adapters);
  expect(switchWyrmetizerMode(page, "area", "composition", adapters)).toBe(page);
  expect(editWyrmetizerWidget(page, "a", { link: "/one" }, adapters)).toBe(page);
});
it("adds without repacking and keeps Flow order independent of Composition order", () => {
  let page = createWyrmetizerCopy(fixture(), adapters);
  const original = structuredClone(page.layout.areas.area.composition.geometry.placements.a);
  page = addWyrmetizerWidget(page, "area", "b", fixture().widgets.a, adapters);
  expect(page.layout.areas.area.composition.geometry.placements.a).toEqual(original);
  page = switchWyrmetizerMode(page, "area", "flow", adapters);
  page = reorderWyrmetizerFlow(page, "area", ["b", "a"], adapters);
  expect(page.widgetsOrder).toEqual(["b", "a"]);
  page = switchWyrmetizerMode(page, "area", "composition", adapters);
  expect(page.widgetsOrder).toEqual(["a", "b"]);
  expect(page.layout.areas.area.flow.order).toEqual(["b", "a"]);
});
it.each(["version", "membership", "content", "ownership"])("fails closed for invalid %s", issue => {
  const page = createWyrmetizerCopy(fixture(), adapters);
  if (issue === "version") page.layout.version = 99;
  if (issue === "membership") page.layout.areas.area.flow.order.push("missing");
  if (issue === "content") page.layout.areas.area.flow.presentation.a.link = "/bad";
  if (issue === "ownership") page.widgets.a.settings.image_transform = defaultImageTransform();
  expect(() => validateWyrmetizerPage(page, adapters)).toThrow();
});
