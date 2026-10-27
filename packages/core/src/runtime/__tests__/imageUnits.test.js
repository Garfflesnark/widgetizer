import { expect, it } from "vitest";
import { defaultImageTransform, imageTransformV2, transformRect, rectTransform, switchImageUnit, isImageTransform, isDefaultImageScale } from "../imageTransform.js";
import { resizeAnchoredRect } from "../anchoredResize.js";
const ref = { containerWidth: 1000, width: 800, height: 600 };
const mixed = (w, h) => ({ ...defaultImageTransform("right"), dimensions: { width: { unit: w, value: w === "%" ? 50 : 400 }, height: { unit: h, value: h === "%" ? 50 : 300 } } });
it.each([["%", "%"], ["%", "px"], ["px", "%"], ["px", "px"]])("renders and preserves %s/%s modes through anchored drags", (w, h) => {
  const before = mixed(w, h);
  expect(transformRect(before, ref)).toEqual({ left: 600, top: 0, width: 400, height: 300 });
  for (const direction of ["n", "ne", "e", "se", "s", "sw", "w", "nw"]) {
    const rect = transformRect(before, ref);
    const resized = resizeAnchoredRect(rect, direction, 20, 20, { left: 0, top: 0, right: 1000, minWidth: 8, minHeight: 6 });
    const after = rectTransform(resized, ref, before, direction);
    expect(isImageTransform(after)).toBe(true);
    expect(after.dimensions.width.unit).toBe(w);
    expect(after.dimensions.height.unit).toBe(h);
    const result = transformRect(after, ref);
    expect(result.left).toBeCloseTo(resized.left, 2);
    expect(result.top).toBeCloseTo(resized.top, 2);
    expect(result.width).toBeCloseTo(resized.width, 2);
    expect(result.height).toBeCloseTo(resized.height, 2);
  }
});
it("switches only one axis using visible size and documented rounding", () => {
  const t = mixed("%", "px"); t.dimensions.width.value = 33.33;
  const next = switchImageUnit(t, "width", "px", ref);
  expect(next.dimensions).toEqual({ width: { unit: "px", value: 267 }, height: { unit: "px", value: 300 } });
  expect(switchImageUnit(next, "width", "%", ref).dimensions.width.value).toBe(33.38);
  expect(switchImageUnit(next, "height", "em", ref)).toBeNull();
});
it("clamps responsive visible width without rewriting exact saved pixels", () => {
  const t = mixed("px", "px");
  expect(transformRect(t, { containerWidth: 200, width: 200, height: 150 })).toEqual({ left: 0, top: 0, width: 200, height: 300 });
  expect(t.dimensions.width.value).toBe(400);
});
it("derives Default Scale from dimensions, independent of alignment and click history", () => {
  for (const alignment of ["left", "center", "right"]) {
    const t = defaultImageTransform(alignment);
    expect(isDefaultImageScale({ settings: { image_transform: t } }, ref)).toBe(true);
    t.dimensions = { width: { unit: "px", value: 800 }, height: { unit: "px", value: 600 } };
    expect(isDefaultImageScale({ settings: { image_transform: t } }, ref)).toBe(true);
    t.dimensions.height.value = 599;
    expect(isDefaultImageScale({ settings: { image_transform: t } }, ref)).toBe(false);
  }
});
it("keeps internal Auto and converts legacy/v1 without mutation or changing visible bounds", () => {
  for (const settings of [{ image_width_percent: 50, image_height_px: 300 }, { image_transform: { version: 1, reference: "intrinsic-fit", scale: { width: 50, height: 50 }, flowInset: { inlinePercent: 15, blockPercent: 25 } } }]) {
    const copy = structuredClone(settings);
    const converted = imageTransformV2({ settings }, ref);
    expect(isImageTransform(converted)).toBe(true);
    expect(settings).toEqual(copy);
    if (settings.image_transform) expect(transformRect(converted, ref)).toEqual(transformRect(settings.image_transform, ref));
  }
  const auto = defaultImageTransform(); auto.dimensions.height = { unit: "px", value: 300 };
  expect(transformRect(auto, ref)).toMatchObject({ width: 400, height: 300 });
});
it.each([NaN, Infinity, -1, 0, 10001, "300"])("rejects invalid px %s", (value) => {
  const t = mixed("px", "px"); t.dimensions.width.value = value;
  expect(isImageTransform(t)).toBe(false);
});
