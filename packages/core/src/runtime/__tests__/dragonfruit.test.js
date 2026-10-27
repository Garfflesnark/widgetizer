import { expect, it } from "vitest";
import { resizePinnedRect, nodeFraction, RESIZE_NODES } from "../anchoredResize.js";
import { defaultImageTransform, isImageTransform, rectTransform, transformRect } from "../imageTransform.js";
import { imageSpacing, isImageSpacing } from "../imageSpacing.js";
const rect = { left: 200, top: 200, width: 400, height: 300 };
const bounds = { left: 0, top: 0, right: 1200, minWidth: 1, minHeight: 1, maxWidth: 1200, maxHeight: 2000, maxTop: 1000 };
const point = (r, node) => { const [x, y] = nodeFraction(node); return [r.left + x * r.width, r.top + y * r.height]; };

it.each(RESIZE_NODES)("Shift %s scales proportionally about its opposite node", (direction) => {
  const next = resizePinnedRect(rect, direction, direction.includes("w") ? -40 : 40, direction.includes("n") ? -30 : 30, bounds, { proportional: true });
  expect(next.width / next.height).toBeCloseTo(rect.width / rect.height, 8);
  const opposite = direction.replace(/[nsew]/g, (c) => ({ n: "s", s: "n", e: "w", w: "e" })[c]);
  expect(point(next, opposite)).toEqual(point(rect, opposite));
});
it.each(RESIZE_NODES)("preserves pin %s for every manipulated node, including Shift", (pin) => {
  for (const direction of RESIZE_NODES) for (const proportional of [false, true]) {
    const next = resizePinnedRect(rect, direction, 31, 27, bounds, { proportional, pins: [pin] });
    expect(point(next, pin)[0]).toBeCloseTo(point(rect, pin)[0], 7);
    expect(point(next, pin)[1]).toBeCloseTo(point(rect, pin)[1], 7);
    expect(next.left).toBeGreaterThanOrEqual(0); expect(next.top).toBeGreaterThanOrEqual(0);
    expect(next.left + next.width).toBeLessThanOrEqual(1200);
  }
});
it("locks incompatible pin axes instead of moving anchors", () => {
  expect(resizePinnedRect(rect, "se", 200, 200, bounds, { pins: ["nw", "se"] })).toEqual(rect);
  const next = resizePinnedRect(rect, "s", 0, 100, bounds, { pins: ["nw", "ne"] });
  expect(next).toEqual({ ...rect, height: 400 });
  expect(resizePinnedRect(rect, "s", 0, 100, bounds, { pins: ["nw", "ne"], proportional: true })).toEqual(rect);
});
it("clamps Shift scaling as a whole without breaking ratio or the pivot", () => {
  const next = resizePinnedRect(rect, "nw", -9999, -9999, bounds, { proportional: true });
  expect(next.left).toBeCloseTo(0); expect(next.top).toBeGreaterThanOrEqual(0);
  expect(point(next, "se")).toEqual(point(rect, "se"));
  expect(next.width / next.height).toBeCloseTo(4 / 3);
});
it.each([["%", "%"], ["%", "px"], ["px", "%"], ["px", "px"]])("retains %s/%s units and pins after proportional conversion", (w, h) => {
  const ref = { containerWidth: 1200, width: 800, height: 600 };
  const model = { ...defaultImageTransform("left"), anchors: ["nw"], dimensions: { width: { unit: w, value: w === "px" ? 400 : 50 }, height: { unit: h, value: h === "px" ? 300 : 50 } }, flowInset: { inlinePercent: 0, blockPercent: 0 } };
  const r = transformRect(model, ref);
  const next = resizePinnedRect(r, "se", 40, 30, bounds, { proportional: true, pins: model.anchors });
  const saved = rectTransform(next, ref, model, "nsew");
  expect(saved.dimensions.width.unit).toBe(w); expect(saved.dimensions.height.unit).toBe(h);
  expect(saved.anchors).toEqual(["nw"]); expect(isImageTransform(saved)).toBe(true);
  expect(transformRect(saved, ref).width / transformRect(saved, ref).height).toBeCloseTo(4 / 3, 2);
});
it("validates only bounded unique anchor identities and spacing values", () => {
  for (const anchors of [["bad"], ["n", "n"], null, "n", [...RESIZE_NODES, "n"]]) expect(isImageTransform({ ...defaultImageTransform(), anchors })).toBe(false);
  expect(isImageTransform({ ...defaultImageTransform(), anchors: [...RESIZE_NODES] })).toBe(true);
  for (const n of [0, 23, 2000]) expect(isImageSpacing(n)).toBe(true);
  for (const n of [-1, NaN, Infinity, "12", 2001, 1.5]) expect(isImageSpacing(n)).toBe(false);
  expect(imageSpacing({ top_spacing: "none", bottom_spacing: "px", bottom_spacing_px: 27 })).toEqual({ top: 0, bottom: 27 });
  expect(imageSpacing()).toEqual({ top: null, bottom: null });
});
