import { expect, it } from "vitest";
import { normalizeAngle, rotateVector, rotatedBounds, rotatedPoint, rotatedResizeRect, hitRotatedRect } from "../rotationGeometry.js";
import { resizePinnedRect, RESIZE_NODES, nodeFraction } from "../anchoredResize.js";
import { containedRect, validateCompositionLayout } from "../composition.js";
import { compositionAdapters, validateImageCompositionBounds } from "../compositionImage.js";
import { fixture } from "./compositionFixture.js";

it("normalizes signed clockwise angles and tests the rotated image rather than its bounding box", () => {
  expect([0, 360, -360, 540, -181, 12.34567].map(normalizeAngle)).toEqual([0, 0, 0, -180, 179, 12.346]);
  const rect = { left: 100, top: 100, width: 300, height: 200 };
  const bounds = rotatedBounds(rect, 45);
  expect(hitRotatedRect(rect, { x: bounds.left, y: bounds.top }, 45)).toBe(false);
  expect(hitRotatedRect(rect, rotatedPoint(rect, 0.5, 0.5, 45), 45)).toBe(true);
  expect(containedRect(rect, 500, 400, 45)).toBe(true);
  expect(containedRect({ ...rect, left: 0 }, 500, 400, 45)).toBe(false);
});
it.each(RESIZE_NODES)("keeps pin %s fixed in canvas space through rotated resizing", pin => {
  const rect = { left: 300, top: 300, width: 200, height: 100 };
  for (const angle of [-135, -90, 0, 33, 90, 179]) for (const proportional of [false, true]) {
    const direction = pin.replace(/[nsew]/g, c => ({ n: "s", s: "n", e: "w", w: "e" })[c]);
    const delta = rotateVector(40, 20, angle), local = rotateVector(delta.x, delta.y, -angle);
    const resized = resizePinnedRect(rect, direction, local.x, local.y,
      { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity }, { pins: [pin], proportional });
    const canvas = rotatedResizeRect(rect, resized, angle), [x, y] = nodeFraction(pin);
    const before = rotatedPoint(rect, x, y, angle), after = rotatedPoint(canvas, x, y, angle);
    expect(after.x).toBeCloseTo(before.x, 8); expect(after.y).toBeCloseTo(before.y, 8);
  }
});
it("validates finite persisted angles, old missing-angle pages, and rotated canvas containment", () => {
  const page = fixture(), c = page.layout.compositions.canvas, f = c.placements.a.frames.desktop;
  expect(() => validateCompositionLayout(page, compositionAdapters)).not.toThrow();
  for (const angle of [NaN, Infinity, "45", 181, null]) {
    f.rotation = angle;
    expect(() => validateCompositionLayout(page, compositionAdapters)).toThrow();
  }
  f.rotation = 45;
  expect(() => validateCompositionLayout(page, compositionAdapters)).toThrow();
  c.placements.a.version = 2;
  expect(() => validateCompositionLayout(page, compositionAdapters)).not.toThrow();
  expect(() => validateImageCompositionBounds(page.widgets.a, c, f, 1600, 900)).not.toThrow();
  f.x = 0.125;
  expect(() => validateImageCompositionBounds(page.widgets.a, c, f, 1600, 900)).toThrow(/bounds/);
});
