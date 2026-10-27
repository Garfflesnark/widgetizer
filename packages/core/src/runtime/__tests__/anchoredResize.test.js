import { describe, expect, it } from "vitest";
import { resizeAnchoredRect } from "../anchoredResize.js";
import { DEFAULT_IMAGE_TRANSFORM, imageReference, isImageTransform, legacyImageTransform, rectTransform, transformRect } from "../imageTransform.js";

const rect = { left: 40, top: 50, width: 200, height: 100 };
const bounds = { left: 0, top: 0, right: 500, minWidth: 1, minHeight: 1 };
it.each(["n", "s", "e", "w", "nw", "ne", "se", "sw"])("keeps opposite edges anchored for %s", (direction) => {
  const next = resizeAnchoredRect(rect, direction, 20, 15, bounds);
  if (direction.includes("w")) { expect(next.left).toBe(60); expect(next.left + next.width).toBe(240); }
  else expect(next.left).toBe(40);
  if (direction.includes("e")) expect(next.width).toBe(220);
  if (direction.includes("n")) { expect(next.top).toBe(65); expect(next.top + next.height).toBe(150); }
  else expect(next.top).toBe(50);
  if (direction.includes("s")) expect(next.height).toBe(115);
});
it("clamps north/west without moving their opposite edges", () => {
  expect(resizeAnchoredRect(rect, "nw", -1000, -1000, bounds)).toEqual({ left: 0, top: 0, width: 240, height: 150 });
  const smallest = resizeAnchoredRect(rect, "nw", 1000, 1000, bounds);
  expect(smallest).toEqual({ left: 239, top: 149, width: 1, height: 1 });
});
describe("intrinsic-fit percentages", () => {
  it("does not upscale small originals and fits large originals responsively", () => {
    expect(imageReference(1000, 400, 200)).toEqual({ containerWidth: 1000, width: 400, height: 200 });
    expect(imageReference(300, 400, 200)).toEqual({ containerWidth: 300, width: 300, height: 150 });
  });
  it("uses identical reference scaling on both axes, independent stretch, and either Auto", () => {
    const ref = imageReference(1000, 800, 600);
    const transform = structuredClone(DEFAULT_IMAGE_TRANSFORM);
    transform.scale = { width: 50, height: 50 };
    expect(transformRect(transform, ref)).toEqual({ left: 0, top: 0, width: 400, height: 300 });
    transform.scale.height = 75;
    expect(transformRect(transform, ref).height).toBe(450);
    transform.scale.height = null;
    expect(transformRect(transform, ref).height).toBe(300);
    transform.scale = { width: null, height: 50 };
    expect(transformRect(transform, ref)).toEqual({ left: 0, top: 0, width: 400, height: 300 });
  });
  it("round trips a top-edge move with the same bottom and occupied flow height", () => {
    const ref = imageReference(1000, 800, 600);
    const before = transformRect(DEFAULT_IMAGE_TRANSFORM, ref);
    const resized = resizeAnchoredRect(before, "n", 0, 60, { ...bounds, right: 1000 });
    const value = rectTransform(resized, ref);
    expect(isImageTransform(value)).toBe(true);
    const after = transformRect(value, ref);
    expect(after.top).toBe(60);
    expect(after.height).toBe(540);
    expect(after.top + after.height).toBe(before.top + before.height);
  });
  it("derives a legacy display conversion without mutating saved fields", () => {
    const widget = { settings: { image_width_percent: 50, image_height_px: 300, fullwidth: true } };
    const copy = structuredClone(widget);
    expect(legacyImageTransform(widget, imageReference(800, 800, 600))).toMatchObject({ scale: { width: 50, height: 50 }, flowInset: { inlinePercent: 25, blockPercent: 0 } });
    expect(widget).toEqual(copy);
  });
  it("rejects incompatible versions, invalid scales and unbounded spacing", () => {
    for (const invalid of [{ ...DEFAULT_IMAGE_TRANSFORM, version: 2 }, { ...DEFAULT_IMAGE_TRANSFORM, scale: { width: NaN, height: null } },
      { ...DEFAULT_IMAGE_TRANSFORM, flowInset: { inlinePercent: -1, blockPercent: 0 } }]) expect(isImageTransform(invalid)).toBe(false);
  });
});
