import { expect, it } from "vitest";
import { containedRect, minimumCompositionHeight } from "../composition.js";

it.each([[100, 340], [100.01, 341], [100.999999, 341]])("rounds minimum height up for a %s px image", (height, expected) => {
  const item = { rect: { left: 200, top: 240, width: 300, height }, frame: { x: 0.2, y: 0.2, pivot: { x: 0, y: 0 } } };
  expect(minimumCompositionHeight([item], 1200)).toBe(expected);
});
it("rounds rotated bounds up with an off-center pivot without changing geometry", () => {
  const item = { version: 3, rect: { left: 480, top: 240, width: 300.25, height: 200 },
    frame: { x: 0.4, y: 0.2, pivot: { x: 0, y: 0 }, rotation: 90, rotationPivot: { x: 0, y: 0 } } };
  const before = structuredClone(item);
  const height = minimumCompositionHeight([item], 1200);
  expect(height).toBe(541);
  expect(containedRect(item.rect, 1200, height, item.frame.rotation, item.frame.rotationPivot)).toBe(true);
  expect(containedRect(item.rect, 1200, height - 1, item.frame.rotation, item.frame.rotationPivot)).toBe(false);
  expect(item).toEqual(before);
});
it("rounds retained legacy anchors up and retains the one-pixel floor", () => {
  expect(minimumCompositionHeight([], 1200)).toBe(1);
  expect(minimumCompositionHeight([{ rect: { left: 100, top: 100, width: 100, height: 100 },
    frame: { x: 0.1, y: 0.3001, pivot: { x: 0, y: 1 } } }], 1200)).toBe(361);
});
