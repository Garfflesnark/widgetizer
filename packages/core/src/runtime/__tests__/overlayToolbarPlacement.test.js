import { it, expect } from "vitest";
import { overlayToolbarPlacement } from "../overlayToolbarPlacement.js";
it.each([
  { left: 0, top: 0, width: 10 },
  { left: 350, top: 20, width: 40 },
  { left: 100, top: 100, width: 200 },
])("fits the entire measured row independently of image width at narrow boundaries: %j", (image) => {
  const toolbar = { width: 250, height: 24 },
    viewport = 390;
  const result = overlayToolbarPlacement(image, toolbar, viewport);
  const left = image.left + (image.width - toolbar.width) / 2 + result.shift;
  expect(left).toBeGreaterThanOrEqual(4);
  expect(left + toolbar.width).toBeLessThanOrEqual(viewport - 4);
  expect(image.top + result.top).toBeGreaterThanOrEqual(2);
});
