import { expect, it } from "vitest";
import { wyrmetizerHandlePlacement } from "../wyrmetizerHandlePlacement.js";

it.each([0, 30, 90, 135, 180, -60])("clears measured toolbar targets at %s degrees", angle => {
  const normal = { x: Math.sin(angle * Math.PI / 180), y: -Math.cos(angle * Math.PI / 180) };
  for (const zoom of [0.5, 1, 2]) {
    const target = { left: -50 * zoom, right: 50 * zoom, top: -20 * zoom, bottom: 20 * zoom };
    const p = wyrmetizerHandlePlacement({ x: 0, y: 0 }, normal, 10 * zoom, [target], 8 * zoom);
    expect(p.x < target.left - 18 * zoom || p.x > target.right + 18 * zoom ||
      p.y < target.top - 18 * zoom || p.y > target.bottom + 18 * zoom).toBe(true);
    expect(p.x * normal.y - p.y * normal.x).toBeCloseTo(0);
  }
});
it("preserves a clear handle and follows scrolling without viewport clamping", () => {
  const point = { x: 45, y: -300 };
  expect(wyrmetizerHandlePlacement(point, { x: 0, y: -1 }, 10,
    [{ left: 0, right: 100, top: 10, bottom: 30 }], 8)).toEqual(point);
});
