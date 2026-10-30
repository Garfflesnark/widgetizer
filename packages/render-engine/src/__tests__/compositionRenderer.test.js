import { it, expect } from "vitest";
import { renderPageContent } from "../compositionRenderer.js";
import { fixture } from "../../../core/src/runtime/__tests__/compositionFixture.js";
import { createWyrmetizerCopy, switchWyrmetizerMode, editWyrmetizerWidget } from "@widgetizer/core/wyrmetizerLayouts";
import { compositionAdapters } from "@widgetizer/core/compositionImage";

const render = (id, widget, index) =>
  widget.type === "image"
    ? `<section data-widget-id="${id}" data-widget-index="${index}" data-composition-capability="image.v1" data-image-natural-width="1600" data-image-natural-height="900"><img src="image.jpg"></section>`
    : `<p>${id}</p>`;
it("renders only active paired geometry and preserves preview/export parity in both modes", async () => {
  let page = createWyrmetizerCopy(fixture(), compositionAdapters);
  const composition = await renderPageContent(page, render);
  page = switchWyrmetizerMode(page, "canvas", "flow", compositionAdapters);
  page = editWyrmetizerWidget(page, "a", { top_spacing_px: 72 }, compositionAdapters);
  const seen = [];
  const flow = await renderPageContent(page, (id, widget) => { seen.push(widget); return id; });
  expect(flow).toBe("abafter");
  expect(seen[0].settings.top_spacing_px).toBe(72);
  expect(await renderPageContent(JSON.parse(JSON.stringify(page)), render)).not.toContain("data-composition-id");
  page = switchWyrmetizerMode(page, "canvas", "composition", compositionAdapters);
  expect(await renderPageContent(page, render)).toBe(composition);
});
it("shares deterministic preview/export geometry, reading order, independent stacks and no editor scripts", async () => {
  const p = fixture();
  p.layout.compositions.canvas.stackOrder.reverse();
  const preview = await renderPageContent(p, render),
    published = await renderPageContent(JSON.parse(JSON.stringify(p)), render);
  expect(published).toBe(preview);
  expect(published).toContain("aspect-ratio:1200/800");
  expect(published).toContain("overflow:clip");
  expect(published).toContain("left:37.5%;top:22.5%;width:25%;height:25%;z-index:2");
  expect(published.indexOf('data-widget-id="a"')).toBeLessThan(published.indexOf('data-widget-id="b"'));
  expect(published).not.toMatch(/<script|resize-handle|wz-controls/);
  expect(published.endsWith("<p>after</p>")).toBe(true);
});
it("keeps legacy callback order/index and output unchanged", async () => {
  expect(
    await renderPageContent(
      { widgets: { a: { type: "text" } }, widgetsOrder: ["a"] },
      (id, w, index) => `${id}:${w.type}:${index}`,
    ),
  ).toBe("a:text:1");
});
it("fails visibly for an unsynchronized theme or oversized child", async () => {
  await expect(renderPageContent(fixture(), () => "<img>")).rejects.toThrow(/effective project/);
  const p = fixture();
  p.layout.compositions.canvas.profiles.desktop.height.valuePx = 100;
  await expect(renderPageContent(p, render)).rejects.toThrow();
});

it("identifies an uninitialized Custom policy as Proportional fallback without saving generated frames", async () => {
  const p = fixture();
  p.layout.compositions.canvas.placements.a.responsive.mode = "custom";
  const before = JSON.stringify(p);
  const html = await renderPageContent(p, render);
  expect(html).toContain('data-responsive-fallback="proportional"');
  expect(JSON.stringify(p)).toBe(before);
});

it("renders persisted clockwise rotation identically in preview/export without changing unrotated dimensions", async () => {
  const page = fixture();
  page.layout.compositions.canvas.placements.a.version = 2;
  page.layout.compositions.canvas.placements.a.frames.desktop.rotation = -45;
  const preview = await renderPageContent(page, render);
  expect(preview).toBe(await renderPageContent(JSON.parse(JSON.stringify(page)), render));
  expect(preview).toContain("transform:rotate(-45deg);transform-origin:50% 50%");
  expect(preview).toContain("left:37.5%;top:22.5%;width:25%;height:25%;z-index:1");
  expect(preview).not.toMatch(/composition-rotate|wz-image/);
});
it("shares the saved off-centre pivot with proportional preview/export geometry", async () => {
  const page = fixture(), placement = page.layout.compositions.canvas.placements.a;
  placement.version = 3;
  placement.frames.desktop.rotation = 20;
  placement.frames.desktop.rotationPivot = { x: 0.2, y: 0.8 };
  const html = await renderPageContent(page, render);
  expect(html).toContain("transform:rotate(20deg);transform-origin:20% 80%");
  expect(html).toBe(await renderPageContent(JSON.parse(JSON.stringify(page)), render));
  expect(html).toContain("aspect-ratio:1200/800");
});
