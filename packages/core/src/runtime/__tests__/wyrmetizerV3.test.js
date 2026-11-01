import { describe, expect, it } from "vitest";
import { compositionAdapters } from "../compositionImage.js";
import { validateCompositionLayout } from "../composition.js";
import {
  convertWyrmetizerPageToV3, createWyrmetizerCopy, openWyrmetizerEditorPage,
  serializeWyrmetizerEditorPage, validateWyrmetizerPage, WYRMTIZER_MOBILE_REFERENCE_WIDTH_PX,
} from "../wyrmetizerLayouts.js";
import { fixture } from "./compositionFixture.js";

const adapters = compositionAdapters;
const v2 = () => createWyrmetizerCopy(fixture(), adapters);
const v3 = () => convertWyrmetizerPageToV3(v2(), adapters);

describe("Wyrmetizer version 3 schema", () => {
  it("keeps v2 valid and converts it losslessly without authoring Mobile overrides", () => {
    const source = v2();
    const converted = convertWyrmetizerPageToV3(source, adapters);
    expect(source.layout.version).toBe(2);
    expect(converted.layout).toEqual({ ...source.layout, version: 3,
      mobile: { referenceWidthPx: WYRMTIZER_MOBILE_REFERENCE_WIDTH_PX } });
    expect(validateWyrmetizerPage(source, adapters)).toBeUndefined();
    expect(validateCompositionLayout(converted, adapters)).toBeUndefined();
    expect(JSON.parse(JSON.stringify(converted))).toEqual(converted);
    expect(serializeWyrmetizerEditorPage(openWyrmetizerEditorPage(converted, adapters), adapters)).toEqual(converted);
  });

  it("owns sparse Mobile values by presentation with explicit false and zero retained", () => {
    const page = v3();
    page.layout.mobile.rootOrder = [{ kind: "area", id: "canvas" }, { kind: "widget", id: "after" }];
    page.layout.mobile.areas = { canvas: {
      flow: { order: ["b", "a"], presentation: { a: { fullwidth: false, top_spacing_px: 0 } } },
      composition: { presentation: { b: { image_height_px: 0 } } },
    } };
    expect(validateWyrmetizerPage(page, adapters)).toBeUndefined();
    const roundTripped = serializeWyrmetizerEditorPage(openWyrmetizerEditorPage(page, adapters), adapters);
    expect(roundTripped.layout.mobile.areas.canvas.flow.presentation.a).toEqual({ fullwidth: false, top_spacing_px: 0 });
  });

  it("validates independent Mobile Composition reading order, stack order and parent-relative geometry", () => {
    const page = v3();
    page.layout.mobile.areas = { canvas: { composition: { geometry: {
      version: 1, referenceWidthPx: 390, heightPx: 700,
      readingOrder: ["b", "a"], stackOrder: ["a", "b"],
      placements: {
        a: { x: { value: 50, unit: "%" }, y: { value: 12, unit: "px" }, pivot: { x: 0, y: 0 } },
        b: { x: { value: 300, unit: "px" }, y: { value: 100, unit: "%" }, pivot: { x: 1, y: 1 } },
      },
    } } } };
    expect(validateWyrmetizerPage(page, adapters)).toBeUndefined();
    const invalid = structuredClone(page);
    invalid.layout.mobile.areas.canvas.composition.geometry.stackOrder = ["a", "a"];
    expect(() => validateWyrmetizerPage(invalid, adapters)).toThrow(/geometry or order/);
  });

  it("rejects malformed patches, content ownership, stale references and invalid units or bounds", () => {
    const cases = [
      page => { page.layout.mobile.areas = { canvas: { flow: { presentation: { a: { image: "/other.jpg" } } } } }; },
      page => { page.layout.mobile.areas = { canvas: { flow: { presentation: { stale: { fullwidth: false } } } } }; },
      page => { page.layout.mobile.presentation = { after: { fullwidth: false } }; },
      page => { page.layout.mobile.rootOrder = [{ kind: "widget", id: "after" }]; },
      page => { page.layout.mobile.areas = { canvas: { composition: { order: ["a", "b"] } } }; },
      page => { page.layout.mobile.areas = { canvas: { composition: { geometry: {
        version: 1, referenceWidthPx: 390, heightPx: 600, readingOrder: ["a", "b"], stackOrder: ["a", "b"],
        placements: { a: { x: { value: 391, unit: "px" }, y: { value: 0, unit: "%" }, pivot: { x: 0, y: 0 } },
          b: { x: { value: 0, unit: "em" }, y: { value: 0, unit: "%" }, pivot: { x: 0, y: 0 } } },
      } } } }; },
    ];
    for (const mutate of cases) {
      const page = v3(); mutate(page);
      expect(() => validateWyrmetizerPage(page, adapters)).toThrow();
    }
  });

  it("rejects unknown schema versions and prevents a v2 envelope from carrying Mobile data", () => {
    const page = v3();
    page.layout.version = 4;
    expect(() => validateWyrmetizerPage(page, adapters)).toThrow(/unsupported envelope/);
    const legacy = v2();
    legacy.layout.mobile = { referenceWidthPx: 390 };
    expect(() => validateWyrmetizerPage(legacy, adapters)).toThrow(/version 2/);
    const altered = v3(); altered.layout.mobile.referenceWidthPx = 400;
    expect(() => validateWyrmetizerPage(altered, adapters)).toThrow(/reference width/);
  });
});
