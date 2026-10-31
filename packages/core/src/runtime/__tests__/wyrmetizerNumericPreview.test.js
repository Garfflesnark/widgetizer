// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createWyrmetizerNumericPreview } from "../wyrmetizerNumericPreview.js";
it("previews angle and canvas height locally and restores exact styles on cancellation", () => {
  document.body.innerHTML = `<section data-composition-id="c" data-composition-width="1200" data-composition-height="800" style="aspect-ratio:1200/800"><div data-composition-child="a" data-composition-revision="r" data-composition-frame='{"x":0.2,"y":0.2,"pivot":{"x":0,"y":0}}' style="left:240px;top:240px;width:200px;height:100px"><section data-widget-id="a"></section></div></section>`;
  const area = document.querySelector("[data-composition-id]"), child = document.querySelector("[data-composition-child]");
  area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: Number(area.dataset.compositionHeight) });
  const before = document.body.innerHTML;
  const controller = createWyrmetizerNumericPreview({ document, selected: () => "a", getContext: () => "desktop", onPreview: vi.fn() });
  const payload = { widgetId: "a", context: "desktop", revision: "r" };
  controller.preview({ ...payload, field: "rotation", value: 30 });
  expect(child.style.transform).toBe("rotate(30deg)");
  controller.cancel(); expect(document.body.innerHTML).toBe(before);
  controller.preview({ ...payload, field: "height", value: 1000 });
  expect(area.dataset.compositionHeight).toBe("1000"); expect(child.style.top).toBe("24%"); expect(child.style.height).toBe("10%");
  controller.preview({ ...payload, field: "height", value: 1200 });
  expect(child.style.top).toBe("20%");
  controller.cancel(); expect(document.body.innerHTML).toBe(before);
  controller.preview({ ...payload, revision: "stale", field: "rotation", value: 60 });
  expect(document.body.innerHTML).toBe(before);
  child.dataset.compositionFrame = JSON.stringify({ ...JSON.parse(child.dataset.compositionFrame), rotationPivot: { x: 0.2, y: 0.8 } });
  const withPivot = document.body.innerHTML;
  controller.preview({ ...payload, field: "rotation", value: 30 });
  expect(child.style.transformOrigin).toBe("20% 80%");
  controller.cancel(); expect(document.body.innerHTML).toBe(withPivot);
});

it("clamps the height preview to rotated bounds and retains styles on commit", () => {
  document.body.innerHTML = `<section data-composition-id="c" data-composition-width="1200" data-composition-height="800"><div data-composition-child="a" data-composition-revision="r" data-composition-frame='{"x":0.2,"y":0.2,"pivot":{"x":0,"y":0},"rotation":90,"rotationPivot":{"x":0,"y":0}}' style="left:240px;top:240px;width:200px;height:100px"><section data-widget-id="a"></section></div></section>`;
  const area = document.querySelector("[data-composition-id]"), child = document.querySelector("[data-composition-child]");
  area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: Number(area.dataset.compositionHeight) });
  const controller = createWyrmetizerNumericPreview({ document, selected: () => "a", getContext: () => "desktop", onPreview: vi.fn() });
  const payload = { widgetId: "a", context: "desktop", revision: "r", field: "height", value: 50 };
  controller.preview(payload);
  expect(Number(area.dataset.compositionHeight)).toBeCloseTo(440);
  expect(parseFloat(child.style.top) * 440 / 100).toBeCloseTo(240);
  const committed = document.body.innerHTML;
  controller.preview({ ...payload, phase: "commit" });
  controller.cancel();
  expect(document.body.innerHTML).toBe(committed);
});
