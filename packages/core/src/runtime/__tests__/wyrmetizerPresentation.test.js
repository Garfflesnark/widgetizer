import { describe, expect, it } from "vitest";
import { compositionAdapters } from "../compositionImage.js";
import { convertWyrmetizerPageToV3, createWyrmetizerCopy, switchWyrmetizerMode } from "../wyrmetizerLayouts.js";
import { resolveWyrmetizerPresentation } from "@widgetizer/core/wyrmetizerPresentation";
import { fixture } from "./compositionFixture.js";

const adapters = compositionAdapters;
const v2 = () => createWyrmetizerCopy(fixture(), adapters);
const v3 = () => {
  const page = convertWyrmetizerPageToV3(v2(), adapters);
  for (const mode of ["flow", "composition"]) for (const id of ["a", "b"]) {
    page.layout.areas.canvas[mode].presentation[id].image_transform.dimensions = {
      width: { unit: "px", value: 100 }, height: { unit: "px", value: 70 },
    };
  }
  return page;
};

describe("Wyrmetizer presentation resolver", () => {
  it("selects Mobile through 749px and Desktop from 750px without upgrading v2 pages", () => {
    const legacy = v2();
    const saved = structuredClone(legacy);
    expect(resolveWyrmetizerPresentation(legacy, 320).presentation).toBe("desktop");
    expect(resolveWyrmetizerPresentation(legacy, 749).presentation).toBe("desktop");
    expect(resolveWyrmetizerPresentation(legacy, 750).presentation).toBe("desktop");
    expect(legacy).toEqual(saved);

    const responsive = v3();
    expect(resolveWyrmetizerPresentation(responsive, 320).presentation).toBe("mobile");
    expect(resolveWyrmetizerPresentation(responsive, 390).presentation).toBe("mobile");
    expect(resolveWyrmetizerPresentation(responsive, 749).presentation).toBe("mobile");
    expect(resolveWyrmetizerPresentation(responsive, 750).presentation).toBe("desktop");
  });

  it("inherits Desktop values property-by-property and keeps explicit zero and false", () => {
    let page = v3();
    page.layout.areas.canvas.composition.presentation.a.fullwidth = true;
    page.layout.areas.canvas.composition.presentation.a.top_spacing_px = 44;
    page.layout.mobile.areas = { canvas: { composition: { presentation: {
      a: { fullwidth: false, top_spacing_px: 0 },
    } } } };
    const mobile = resolveWyrmetizerPresentation(page, 390);
    const desktop = resolveWyrmetizerPresentation(page, 750);
    expect(mobile.widgets.a.settings).toMatchObject({ fullwidth: false, top_spacing_px: 0 });
    expect(desktop.widgets.a.settings).toMatchObject({ fullwidth: true, top_spacing_px: 44 });
    expect(mobile.widgets.b.settings.image_transform).toEqual(page.layout.areas.canvas.composition.presentation.b.image_transform);
  });

  it("keeps root, Area Flow and Composition reading and visual orders distinct", () => {
    let page = switchWyrmetizerMode(v3(), "canvas", "flow", adapters);
    page.layout.mobile.rootOrder = [{ kind: "area", id: "canvas" }, { kind: "widget", id: "after" }];
    page.layout.mobile.areas = { canvas: { flow: { order: ["b", "a"] } } };
    const mobile = resolveWyrmetizerPresentation(page, 390);
    expect(mobile.rootOrder).toEqual(page.layout.mobile.rootOrder);
    expect(mobile.areas.canvas.order).toEqual(["b", "a"]);

    page = switchWyrmetizerMode(page, "canvas", "composition", adapters);
    page.layout.mobile.areas.canvas = { composition: { geometry: {
      version: 1, referenceWidthPx: 390, heightPx: 400,
      readingOrder: ["b", "a"], stackOrder: ["a", "b"],
      placements: {
        a: { x: { value: 50, unit: "%" }, y: { value: 10, unit: "%" }, pivot: { x: 0.5, y: 0 } },
        b: { x: { value: 100, unit: "px" }, y: { value: 20, unit: "px" }, pivot: { x: 0, y: 0 } },
      },
    } } };
    const composition = resolveWyrmetizerPresentation(page, 390, { imageDimensions: {
      a: { width: 1600, height: 900 }, b: { width: 1600, height: 900 },
    } });
    expect(composition.areas.canvas.readingOrder).toEqual(["b", "a"]);
    expect(composition.areas.canvas.stackOrder).toEqual(["a", "b"]);
    expect(composition.areas.canvas.geometry.widthPx).toBe(390);
    expect(composition.areas.canvas.geometry.heightPx).toBe(400);
    expect(composition.areas.canvas.geometry.placements.a.rect.left).toBe(145);
  });

  it("resolves the parent canvas before inherited child positions and checks effective child bounds", () => {
    const page = v3();
    const mobile = resolveWyrmetizerPresentation(page, 390, { imageDimensions: {
      a: { width: 1600, height: 900 }, b: { width: 1600, height: 900 },
    } });
    expect(mobile.areas.canvas.geometry).toMatchObject({ widthPx: 390, heightPx: 260 });
    expect(mobile.areas.canvas.geometry.placements.a).toMatchObject({ xPx: 195, yPx: 58.5 });

    const invalid = structuredClone(page);
    invalid.layout.mobile.areas = { canvas: { composition: { geometry: {
      version: 1, referenceWidthPx: 390, heightPx: 400,
      readingOrder: ["a", "b"], stackOrder: ["a", "b"],
      placements: {
        a: { x: { value: 100, unit: "%" }, y: { value: 0, unit: "px" }, pivot: { x: 0, y: 0 } },
        b: { x: { value: 0, unit: "px" }, y: { value: 0, unit: "px" }, pivot: { x: 0, y: 0 } },
      },
    } } } };
    expect(() => resolveWyrmetizerPresentation(invalid, 390)).toThrow(/exceeds Area canvas bounds/);
  });

  it("does not mutate or serialize derived values back to canonical settings", () => {
    const page = v3();
    page.layout.mobile.areas = { canvas: { composition: { presentation: { a: { fullwidth: false } } } } };
    const before = structuredClone(page);
    const first = resolveWyrmetizerPresentation(page, 390);
    first.widgets.a.settings.fullwidth = true;
    first.rootOrder.reverse();
    const second = resolveWyrmetizerPresentation(page, 390);
    expect(page).toEqual(before);
    expect(second.widgets.a.settings.fullwidth).toBe(false);
    expect(second.widgets.a.settings).not.toHaveProperty("staleDerivedField");
  });

  it("rejects unsupported viewport widths and effective Desktop overflow", () => {
    const page = v2();
    expect(() => resolveWyrmetizerPresentation(page, 0)).toThrow(/positive CSS-pixel/);
    const invalid = structuredClone(page);
    invalid.layout.areas.canvas.composition.geometry.placements.a.frames.desktop.x = 0.99;
    expect(() => resolveWyrmetizerPresentation(invalid, 750)).toThrow(/exceeds Area canvas bounds/);
  });
});
