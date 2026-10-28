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
  expect(result.top).toBe(-toolbar.height - 6);
});

it("never pins the toolbar vertically while the image scrolls out of view", () => {
  for (const top of [500, 10, -50, -500]) {
    const result = overlayToolbarPlacement({ left: 100, top, width: 200 }, { width: 250, height: 48 }, 390);
    expect(result.top).toBe(-54);
  }
});
