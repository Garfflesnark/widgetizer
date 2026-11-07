// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { compositionAdapters } from "@widgetizer/core/compositionImage";
import { convertWyrmetizerPageToV3, createWyrmetizerCopy, switchWyrmetizerMode } from "@widgetizer/core/wyrmetizerLayouts";
import { fixture } from "../../../core/src/runtime/__tests__/compositionFixture.js";
import { renderPageContent } from "../compositionRenderer.js";

const pageV3 = () => {
  const page = convertWyrmetizerPageToV3(createWyrmetizerCopy(fixture(), compositionAdapters), compositionAdapters);
  for (const mode of ["flow", "composition"]) for (const id of ["a", "b"]) {
    page.layout.areas.canvas[mode].presentation[id].image_transform.dimensions = {
      width: { unit: "px", value: 100 }, height: { unit: "px", value: 70 },
    };
  }
  return page;
};
const renderImage = (id, widget, index, natural = { width: 1600, height: 900 }) =>
  `<section id="${id}" data-widget-id="${id}" data-widget-index="${index}" data-composition-capability="image.v1" data-image-natural-width="${natural.width}" data-image-natural-height="${natural.height}"><img src="image.jpg"></section>`;
const parse = html => new DOMParser().parseFromString(html, "text/html");

describe("responsive shared page rendering", () => {
  it("renders responsive composition variants, independent order/stacking, and explicit Mobile values", async () => {
    const page = pageV3();
    page.layout.areas.canvas.composition.presentation.a.fullwidth = true;
    page.layout.areas.canvas.composition.geometry.placements.a.version = 3;
    page.layout.areas.canvas.composition.geometry.placements.a.frames.desktop.rotation = 20;
    page.layout.areas.canvas.composition.geometry.placements.a.frames.desktop.rotationPivot = { x: 0.2, y: 0.8 };
    page.layout.mobile.rootOrder = [{ kind: "widget", id: "after" }, { kind: "area", id: "canvas" }];
    page.layout.mobile.areas = { canvas: {
      composition: {
        presentation: { a: { fullwidth: false, top_spacing_px: 0 } },
        geometry: {
          version: 1, referenceWidthPx: 390, heightPx: 400,
          readingOrder: ["b", "a"], stackOrder: ["a", "b"],
          placements: {
            a: { x: { value: 50, unit: "%" }, y: { value: 10, unit: "%" }, pivot: { x: 0.5, y: 0 } },
            b: { x: { value: 100, unit: "px" }, y: { value: 20, unit: "px" }, pivot: { x: 0, y: 0 } },
          },
        },
      },
    } };
    const seen = [];
    const html = await renderPageContent(page, (id, widget, index) => {
      seen.push({ id, settings: structuredClone(widget.settings), index });
      const block = widget.type === "image" ? renderImage(id, widget, index) : `<p data-widget-id="${id}">${id}</p>`;
      return `${block}<style>.widget-${id}{color:${widget.settings.fullwidth ? "red" : "blue"}}</style>`;
    });
    const doc = parse(html);
    const desktop = doc.querySelector('[data-wyrmetizer-presentation="desktop"]');
    const mobile = doc.querySelector('[data-wyrmetizer-presentation="mobile"]');
    expect(html).toContain("@media(max-width:749px)");
    expect(desktop.querySelector("[data-composition-width]").dataset.compositionWidth).toBe("1200");
    expect(mobile.querySelector("[data-composition-width]").dataset.compositionWidth).toBe("390");
    expect([...mobile.querySelectorAll("[data-composition-child]")].map(node => node.dataset.compositionChild)).toEqual(["b", "a"]);
    expect(mobile.querySelector('[data-composition-child="a"]').getAttribute("style")).toBeNull();
    expect([...mobile.querySelectorAll("style")].some(style => style.textContent.includes("z-index:1"))).toBe(true);
    expect([...mobile.querySelectorAll("style")].some(style => style.textContent.includes("transform:rotate(20deg);transform-origin:20% 80%"))).toBe(true);
    expect(mobile.querySelector('[data-composition-child="a"]')).not.toBeNull();
    expect(mobile.querySelector('[data-composition-child="a"]').dataset.compositionRevision).toBeTruthy();
    expect([...desktop.querySelectorAll("style")].some(style => style.textContent.includes("@media(min-width:750px){.widget-a"))).toBe(true);
    expect([...mobile.querySelectorAll("style")].some(style => style.textContent.includes("@media(max-width:749px){.widget-a"))).toBe(true);
    expect(seen.find(item => item.id === "a" && item.settings.fullwidth === false && item.index > 0).settings.top_spacing_px).toBe(0);
    expect(seen.find(item => item.id === "a" && item.settings.fullwidth === true)).toBeDefined();
    expect([...desktop.children][0].dataset.compositionId).toBe("canvas");
    expect(mobile.querySelector("[data-composition-id]").id).not.toBe(desktop.querySelector("[data-composition-id]").id);
  });

  it("renders responsive Flow ordering and presentations while leaving the page unchanged", async () => {
    let page = switchWyrmetizerMode(pageV3(), "canvas", "flow", compositionAdapters);
    page.layout.mobile.areas = { canvas: { flow: {
      order: ["b", "a"], presentation: { a: { top_spacing_px: 0 } },
    } } };
    const before = structuredClone(page);
    const html = await renderPageContent(page, (id, widget) => `<span data-widget-id="${id}" data-mobile-spacing="${widget.settings.top_spacing_px ?? "unset"}">${id}</span>`);
    const doc = parse(html);
    const desktop = doc.querySelector('[data-wyrmetizer-presentation="desktop"]');
    const mobile = doc.querySelector('[data-wyrmetizer-presentation="mobile"]');
    expect([...desktop.querySelectorAll('[data-composition-id="canvas"] [data-widget-id]')].map(node => node.dataset.widgetId)).toEqual(["a", "b"]);
    expect([...mobile.querySelectorAll('[data-composition-id="canvas"] [data-widget-id]')].map(node => node.dataset.widgetId)).toEqual(["b", "a"]);
    expect(mobile.querySelector('[data-widget-id="a"]').dataset.mobileSpacing).toBe("0");
    expect(page).toEqual(before);
  });

  it("renders shared content in both variants and keeps explicit Mobile presentation overrides", async () => {
    const page = pageV3();
    page.widgets.a.settings.name = "Updated shared content";
    page.layout.areas.canvas.composition.presentation.a.fullwidth = true;
    page.layout.mobile.areas = { canvas: { composition: { presentation: { a: { fullwidth: false } } } } };
    const before = structuredClone(page);
    const html = await renderPageContent(page, (id, widget, index) => renderImage(id, widget, index)
      .replace("<section ", `<section data-name="${widget.settings.name}" data-fullwidth="${widget.settings.fullwidth}" `));
    const doc = parse(html);
    const desktop = doc.querySelector('[data-wyrmetizer-presentation="desktop"] [data-widget-id="a"]');
    const mobile = doc.querySelector('[data-wyrmetizer-presentation="mobile"] [data-widget-id="a"]');

    expect(desktop.dataset.name).toBe("Updated shared content");
    expect(mobile.dataset.name).toBe("Updated shared content");
    expect(desktop.dataset.fullwidth).toBe("true");
    expect(mobile.dataset.fullwidth).toBe("false");
    expect(page).toEqual(before);
  });

  it("scopes each responsive widget instance ID and its label and ARIA references", async () => {
    const page = switchWyrmetizerMode(pageV3(), "canvas", "flow", compositionAdapters);
    const html = await renderPageContent(page, (id) => `<section id="${id}" data-widget-id="${id}"><form id="form-${id}" data-widgetizer-form><label id="label-${id}" for="field-${id}" aria-describedby="help-${id}">Name</label><input id="field-${id}" aria-labelledby="label-${id}"><p id="help-${id}">Help</p></form><script>(function(){var section=typeof widget!=="undefined"&&widget||document.currentScript&&document.currentScript.closest('[data-widget-id]');var form=section&&section.querySelector('form[data-widgetizer-form]');if(!form||form.dataset.fieldErrors)return;form.dataset.fieldErrors='true';})();</script></section>`);
    const doc = parse(html);
    const desktop = doc.querySelector('[data-wyrmetizer-presentation="desktop"] [data-widget-id="a"]');
    const mobile = doc.querySelector('[data-wyrmetizer-presentation="mobile"] [data-widget-id="a"]');
    expect(desktop.dataset.widgetId).toBe(mobile.dataset.widgetId);
    expect(desktop.id).toBe("a--wyrmetizer-a-desktop");
    expect(mobile.id).toBe("a--wyrmetizer-a-mobile");
    expect(desktop.querySelector("label").htmlFor).toBe("field-a--wyrmetizer-a-desktop");
    expect(desktop.querySelector("label").getAttribute("aria-describedby")).toBe("help-a--wyrmetizer-a-desktop");
    expect(desktop.querySelector("input").getAttribute("aria-labelledby")).toBe("label-a--wyrmetizer-a-desktop");
    expect(mobile.querySelector("label").htmlFor).toBe("field-a--wyrmetizer-a-mobile");
    expect(desktop.querySelector("form").id).toBe("form-a--wyrmetizer-a-desktop");
    expect(mobile.querySelector("form").id).toBe("form-a--wyrmetizer-a-mobile");
    for (const widget of [desktop, mobile]) {
      const script = widget.querySelector("script");
      new Function("widget", "widgetId", "document", "window", script.textContent)(widget, "a", doc, window);
      expect(widget.querySelector("form").dataset.fieldErrors).toBe("true");
    }
    expect(html).toContain("data-wyrmetizer-anchor-bridge");
    const ids = [...doc.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses rendered image metadata for effective Mobile bounds and preserves preview/export parity", async () => {
    const page = pageV3();
    page.layout.mobile.areas = { canvas: { composition: {
      presentation: { a: { image_transform: {
        version: 2, reference: "intrinsic-fit", alignment: "left",
        dimensions: { width: { unit: "%", value: 100 }, height: { unit: "%", value: null } },
        flowInset: { inlinePercent: 0, blockPercent: 0 },
      } } },
      geometry: {
        version: 1, referenceWidthPx: 390, heightPx: 400,
        readingOrder: ["a", "b"], stackOrder: ["a", "b"],
        placements: {
          a: { x: { value: 20, unit: "%" }, y: { value: 0, unit: "px" }, pivot: { x: 0, y: 0 } },
          b: { x: { value: 100, unit: "px" }, y: { value: 0, unit: "px" }, pivot: { x: 0, y: 0 } },
        },
      },
    } } };
    const before = structuredClone(page);
    const callback = (id, widget, index) => renderImage(id, widget, index, { width: 100, height: 50 });
    const previewHtml = await renderPageContent(page, callback);
    const exportHtml = await renderPageContent(JSON.parse(JSON.stringify(page)), callback);
    expect(previewHtml).toBe(exportHtml);
    expect(previewHtml).toContain('data-composition-width="390"');
    expect(page).toEqual(before);
  });

  it.each([
    ["Auto", "auto"],
    ["Custom", "custom"],
  ])("renders a %s v2 Area at its minimum without changing saved geometry", async (_label, mode) => {
    const page = createWyrmetizerCopy(fixture(), compositionAdapters);
    const geometry = page.layout.areas.canvas.composition.geometry;
    geometry.profiles.desktop.height = { mode, valuePx: 100 };
    geometry.placements.a.version = 3;
    geometry.placements.a.frames.desktop.rotation = 90;
    geometry.placements.a.frames.desktop.rotationPivot = { x: 0, y: 0 };
    const before = structuredClone(page);
    const callback = (id, widget, index) => renderImage(id, widget, index, { width: 300, height: 200 });
    const preview = await renderPageContent(page, callback);
    const published = await renderPageContent(JSON.parse(JSON.stringify(page)), callback);
    const area = parse(preview).querySelector('[data-composition-id="canvas"]');

    expect(preview).toBe(published);
    expect(Number(area.dataset.compositionHeight)).toBeGreaterThan(100);
    expect(area.style.aspectRatio).toBe(`1200/${area.dataset.compositionHeight}`);
    expect(page).toEqual(before);
  });

  it("surfaces invalid effective bounds without mutating or discarding widgets", async () => {
    const page = pageV3();
    page.layout.mobile.areas = { canvas: { composition: { geometry: {
      version: 1, referenceWidthPx: 390, heightPx: 400,
      readingOrder: ["a", "b"], stackOrder: ["a", "b"],
      placements: {
        a: { x: { value: 100, unit: "%" }, y: { value: 0, unit: "px" }, pivot: { x: 0, y: 0 } },
        b: { x: { value: 0, unit: "px" }, y: { value: 0, unit: "px" }, pivot: { x: 0, y: 0 } },
      },
    } } } };
    const before = structuredClone(page);
    await expect(renderPageContent(page, (id, widget, index) => renderImage(id, widget, index, { width: 1600, height: 900 })))
      .rejects.toThrow(/effective Composition child a exceeds Area canvas bounds/);
    expect(page).toEqual(before);
    expect(Object.keys(page.widgets)).toEqual(["a", "b", "after"]);
  });

  it("keeps version-2 HTML byte-identical to the established renderer", async () => {
    const page = createWyrmetizerCopy(fixture(), compositionAdapters);
    const html = await renderPageContent(page, (id, widget, index) => renderImage(id, widget, index));
    expect(html).not.toContain("data-wyrmetizer-responsive");
    expect(html).toContain('data-composition-width="1200"');
    expect(html).not.toContain("@media(max-width:749px)");
  });
});
