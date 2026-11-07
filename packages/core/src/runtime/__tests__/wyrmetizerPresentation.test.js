import { describe, expect, it } from "vitest";
import { compositionAdapters } from "../compositionImage.js";
import { convertWyrmetizerPageToV3, createWyrmetizerCopy, switchWyrmetizerMode } from "../wyrmetizerLayouts.js";
import { resolveWyrmetizerPresentation } from "@widgetizer/core/wyrmetizerPresentation";
import {
  beginWyrmetizerMobileTransaction,
  cancelWyrmetizerMobileTransaction,
  commitWyrmetizerMobileTransaction,
  resetWyrmetizerMobileMode,
  resetWyrmetizerMobileWidget,
  setWyrmetizerMobileTransactionValue,
} from "@widgetizer/core/wyrmetizerMobileTransactions";
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
    page.layout.areas.canvas.composition.presentation.a.bottom_spacing_px = 37;
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

  it("propagates shared content and inherited Desktop presentation changes without replacing Mobile overrides", () => {
    const page = v3();
    page.layout.areas.canvas.composition.presentation.a.fullwidth = true;
    page.layout.mobile.areas = { canvas: { composition: { presentation: { a: { fullwidth: false } } } } };
    const before = structuredClone(page);

    page.widgets.a.settings.name = "Updated shared name";
    page.layout.areas.canvas.composition.presentation.a.top_spacing_px = 36;
    const desktop = resolveWyrmetizerPresentation(page, 750);
    const mobile = resolveWyrmetizerPresentation(page, 390);

    expect(desktop.widgets.a.settings).toMatchObject({ name: "Updated shared name", fullwidth: true, top_spacing_px: 36 });
    expect(mobile.widgets.a.settings).toMatchObject({ name: "Updated shared name", fullwidth: false, top_spacing_px: 36 });
    expect(page.layout.mobile.areas.canvas.composition.presentation.a).toEqual(before.layout.mobile.areas.canvas.composition.presentation.a);
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

  it("expands Auto and undersized Custom heights from actual image dimensions without mutating the page", () => {
    const page = v2();
    const geometry = page.layout.areas.canvas.composition.geometry;
    geometry.profiles.desktop.height = { mode: "auto", valuePx: 400 };
    geometry.placements.b.frames.desktop.y = 0.65;
    const before = structuredClone(page);
    const auto = resolveWyrmetizerPresentation(page, 1200, { imageDimensions: {
      a: { width: 300, height: 200 }, b: { width: 300, height: 200 },
    } });
    expect(auto.areas.canvas.geometry.heightPx).toBe(980);
    expect(page).toEqual(before);

    geometry.profiles.desktop.height = { mode: "custom", valuePx: 500 };
    const custom = resolveWyrmetizerPresentation(page, 1200, { imageDimensions: {
      a: { width: 300, height: 200 }, b: { width: 300, height: 200 },
    } });
    expect(custom.areas.canvas.geometry.heightPx).toBe(980);
    expect(geometry.profiles.desktop.height.valuePx).toBe(500);

    geometry.profiles.desktop.height = { mode: "explicit", valuePx: 500 };
    const legacy = resolveWyrmetizerPresentation(page, 1200, { imageDimensions: {
      a: { width: 300, height: 200 }, b: { width: 300, height: 200 },
    } });
    expect(legacy.areas.canvas.geometry.heightPx).toBe(980);
    expect(geometry.profiles.desktop.height).toEqual({ mode: "explicit", valuePx: 500 });
  });

  it("resolves Desktop and sparse Mobile Auto heights independently on stable inherited positions", () => {
    const page = v3();
    const desktop = page.layout.areas.canvas.composition.geometry;
    desktop.profiles.desktop.height = { mode: "auto", valuePx: 2000 };
    page.layout.mobile.areas = { canvas: { composition: { height: { mode: "auto", valuePx: 100 } } } };
    const before = structuredClone(page);
    const dimensions = { a: { width: 300, height: 200 }, b: { width: 300, height: 200 } };
    const mobile = resolveWyrmetizerPresentation(page, 390, { imageDimensions: dimensions });
    const desktopView = resolveWyrmetizerPresentation(page, 1200, { imageDimensions: dimensions });
    expect(mobile.areas.canvas.geometry.heightPx).toBe(148);
    expect(mobile.areas.canvas.geometry.placements.b.yPx).toBe(78);
    expect(desktopView.areas.canvas.geometry.heightPx).toBe(2000);
    expect(page).toEqual(before);

    const withLegacyMobileGeometry = structuredClone(page);
    withLegacyMobileGeometry.layout.mobile.areas.canvas.composition.geometry = {
      version: 1, referenceWidthPx: 390, heightPx: 300,
      readingOrder: ["a", "b"], stackOrder: ["a", "b"],
      placements: {
        a: { x: { unit: "px", value: 0 }, y: { unit: "px", value: 0 }, pivot: { x: 0, y: 0 } },
        b: { x: { unit: "px", value: 0 }, y: { unit: "px", value: 0 }, pivot: { x: 0, y: 0 } },
      },
    };
    expect(resolveWyrmetizerPresentation(withLegacyMobileGeometry, 390, { imageDimensions: dimensions })
      .areas.canvas.geometry.heightPx).toBe(300);
  });

  it("keeps inherited Mobile placement proportional to width and rejects negative rotated top bounds", () => {
    const page = v3();
    const mobile = resolveWyrmetizerPresentation(page, 390);
    expect(mobile.areas.canvas.geometry.placements.a.yPx).toBe(58.5);

    const invalid = structuredClone(page);
    invalid.layout.areas.canvas.composition.geometry.placements.a.frames.desktop.y = 0.05;
    invalid.layout.areas.canvas.composition.geometry.placements.a.frames.desktop.pivot.y = 1;
    expect(() => resolveWyrmetizerPresentation(invalid, 1200, { imageDimensions: {
      a: { width: 300, height: 200 }, b: { width: 300, height: 200 },
    } })).toThrow(/exceeds Area canvas bounds/);
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

  it("stages changes from resolved Mobile values and commits only changed properties", () => {
    const page = v3();
    page.layout.areas.canvas.composition.presentation.a.fullwidth = true;
    page.layout.areas.canvas.composition.presentation.a.bottom_spacing_px = 37;
    page.layout.mobile.areas = { canvas: { composition: { presentation: { a: { fullwidth: false, top_spacing_px: 0 } } } } };
    const before = structuredClone(page);
    const transaction = beginWyrmetizerMobileTransaction(page, { areaId: "canvas", mode: "composition", widgetId: "a" }, adapters);
    expect(transaction.initialValues).toMatchObject({ fullwidth: false, top_spacing_px: 0 });
    const staged = setWyrmetizerMobileTransactionValue(transaction, "top_spacing_px", 18);
    const result = commitWyrmetizerMobileTransaction(staged, adapters);

    expect(result).toMatchObject({ changed: true, upgraded: false });
    expect(result.page.layout.areas.canvas.composition.presentation.a.fullwidth).toBe(true);
    expect(result.page.layout.mobile.areas.canvas.composition.presentation.a).toEqual({ fullwidth: false, top_spacing_px: 18 });
    expect(resolveWyrmetizerPresentation(result.page, 390).widgets.a.settings).toMatchObject({ fullwidth: false, top_spacing_px: 18, bottom_spacing_px: 37 });
    expect(page).toEqual(before);
  });

  it("upgrades v2 only for a committed change and round trips the sparse override", () => {
    const page = v2();
    const before = structuredClone(page);
    const target = { areaId: "canvas", mode: "composition", widgetId: "a" };
    const transaction = beginWyrmetizerMobileTransaction(page, target, adapters);
    const unchanged = setWyrmetizerMobileTransactionValue(transaction, "image_transform", transaction.initialValues.image_transform);
    expect(commitWyrmetizerMobileTransaction(unchanged, adapters)).toMatchObject({ changed: false, upgraded: false, page: before });
    expect(cancelWyrmetizerMobileTransaction(transaction)).toEqual(before);

    const nextTransform = structuredClone(transaction.initialValues.image_transform);
    nextTransform.dimensions.width.value = 250;
    const committed = commitWyrmetizerMobileTransaction(
      setWyrmetizerMobileTransactionValue(transaction, "image_transform", nextTransform), adapters,
    );
    expect(committed).toMatchObject({ changed: true, upgraded: true });
    expect(committed.page.layout.version).toBe(3);
    expect(committed.page.layout.areas.canvas.composition.presentation.a.image_transform).toEqual(before.layout.areas.canvas.composition.presentation.a.image_transform);
    expect(committed.page.layout.mobile.areas.canvas.composition.presentation.a).toEqual({ image_transform: nextTransform });
    const reloaded = JSON.parse(JSON.stringify(committed.page));
    expect(resolveWyrmetizerPresentation(reloaded, 390, { deferBoundsValidation: true }).widgets.a.settings.image_transform).toEqual(nextTransform);
  });

  it("resets one property, one Widget, or the Mobile Flow mode without disturbing other ownership", () => {
    const page = v3();
    page.layout.mobile.rootOrder = [...page.layout.contentOrder].reverse();
    page.widgets.after = { type: "image", settings: {
      image: "/uploads/images/photo.jpg",
      image_transform: structuredClone(page.layout.areas.canvas.flow.presentation.a.image_transform),
    } };
    page.layout.mobile.presentation = { after: { fullwidth: false } };
    page.layout.mobile.areas = {
      canvas: {
        flow: { presentation: { a: { top_spacing_px: 0 } } },
        composition: { presentation: { a: { fullwidth: false }, b: { top_spacing_px: 12 } }, geometry: {
          version: 1, referenceWidthPx: 390, heightPx: 400, readingOrder: ["a", "b"], stackOrder: ["a", "b"],
          placements: {
            a: { x: { value: 20, unit: "px" }, y: { value: 0, unit: "px" }, pivot: { x: 0, y: 0 } },
            b: { x: { value: 120, unit: "px" }, y: { value: 0, unit: "px" }, pivot: { x: 0, y: 0 } },
          },
        } },
      },
    };
    const property = resetWyrmetizerMobileWidget(page, { areaId: "canvas", mode: "flow", widgetId: "a" }, adapters, "top_spacing_px");
    expect(property.changed).toBe(true);
    expect(property.page.layout.mobile.areas.canvas.flow).toBeUndefined();
    expect(property.page.layout.mobile.presentation.after.fullwidth).toBe(false);
    expect(property.page.layout.mobile.areas.canvas.composition.presentation.a.fullwidth).toBe(false);

    const widget = resetWyrmetizerMobileWidget(property.page, { areaId: "canvas", mode: "composition", widgetId: "a" }, adapters);
    expect(widget.page.layout.mobile.areas.canvas.composition.presentation.a).toBeUndefined();
    expect(widget.page.layout.mobile.areas.canvas.composition.presentation.b.top_spacing_px).toBe(12);

    const mode = resetWyrmetizerMobileMode(widget.page, "flow", adapters);
    expect(mode.page.layout.mobile.rootOrder).toBeUndefined();
    expect(mode.page.layout.mobile.presentation).toBeUndefined();
    expect(mode.page.layout.mobile.areas.canvas.flow).toBeUndefined();
    expect(mode.page.layout.mobile.areas.canvas.composition.geometry.heightPx).toBe(400);
    expect(mode.page.layout.mobile.areas.canvas.composition.presentation.b.top_spacing_px).toBe(12);
  });

  it("rejects bad paths, values and unsupported versions atomically", () => {
    const page = v3();
    const before = structuredClone(page);
    expect(() => beginWyrmetizerMobileTransaction(page, { areaId: "missing", mode: "flow", widgetId: "a" }, adapters)).toThrow(/invalid Area Widget mode/);
    expect(() => beginWyrmetizerMobileTransaction(page, { widgetId: "a" }, adapters)).toThrow(/standalone Flow Widget/);
    const transaction = beginWyrmetizerMobileTransaction(page, { areaId: "canvas", mode: "composition", widgetId: "a" }, adapters);
    expect(() => setWyrmetizerMobileTransactionValue(transaction, "rotation", 12)).toThrow(/unsupported Mobile presentation property/);
    const withFullwidth = setWyrmetizerMobileTransactionValue(transaction, "fullwidth", false);
    const invalid = setWyrmetizerMobileTransactionValue(withFullwidth, "image_transform", { version: 999 });
    expect(() => commitWyrmetizerMobileTransaction(invalid, adapters)).toThrow();
    expect(page).toEqual(before);
    const unsupported = structuredClone(page); unsupported.layout.version = 4;
    expect(() => beginWyrmetizerMobileTransaction(unsupported, { areaId: "canvas", widgetId: "a" }, adapters)).toThrow(/unsupported envelope/);
    expect(unsupported).toEqual({ ...page, layout: { ...page.layout, version: 4 } });
  });

  it("rejects unsupported viewport widths and horizontal Desktop overflow", () => {
    const page = v2();
    expect(() => resolveWyrmetizerPresentation(page, 0)).toThrow(/positive CSS-pixel/);
    const invalid = structuredClone(page);
    invalid.layout.areas.canvas.composition.geometry.placements.a.frames.desktop.x = 0.99;
    expect(() => resolveWyrmetizerPresentation(invalid, 750)).toThrow(/exceeds Area canvas bounds/);
  });
});
