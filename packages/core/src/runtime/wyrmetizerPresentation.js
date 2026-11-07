import { compositionAdapters } from "./compositionImage.js";
import { containedRect, minimumCompositionHeight } from "./composition.js";
import { imageReference, transformRect } from "./imageTransform.js";
import { rotatedBounds } from "./rotationGeometry.js";
import { WYRMTIZER_MOBILE_REFERENCE_WIDTH_PX, validateWyrmetizerPage } from "./wyrmetizerLayouts.js";

export const WYRMTIZER_MOBILE_MAX_WIDTH_PX = 749;
export const WYRMTIZER_DESKTOP_MIN_WIDTH_PX = 750;

const clone = value => structuredClone(value);
const record = value => value && typeof value === "object" && !Array.isArray(value);
const fail = message => { throw new Error(`Wyrmetizer presentation: ${message}`); };

/**
 * Resolve a canonical version-2 or version-3 page for a viewport width.
 * The returned object is a disposable view model; the input page is never changed.
 */
export function resolveWyrmetizerPresentation(page, viewportWidthPx, {
  adapters = compositionAdapters,
  imageDimensions = {},
  deferBoundsValidation = false,
} = {}) {
  if (typeof viewportWidthPx !== "number" || !Number.isFinite(viewportWidthPx) || viewportWidthPx <= 0)
    fail("viewport width must be a positive CSS-pixel value");
  validateWyrmetizerPage(page, adapters);
  if (!record(imageDimensions)) fail("image dimensions must be keyed by Widget ID");

  const mobile = page.layout.version === 3 && viewportWidthPx <= WYRMTIZER_MOBILE_MAX_WIDTH_PX;
  const mobileData = mobile ? page.layout.mobile : {};
  const rootOrder = clone((mobileData.rootOrder ?? page.layout.contentOrder));
  const widgets = {};
  const areas = {};
  const areaMembers = new Set(Object.values(page.layout.areas).flatMap(area => area.members));

  for (const [id, widget] of Object.entries(page.widgets)) {
    if (areaMembers.has(id)) continue;
    const patch = mobileData.presentation?.[id] ?? {};
    widgets[id] = present(widget, patch);
  }

  for (const entry of rootOrder) {
    if (entry.kind !== "area") continue;
    const source = page.layout.areas[entry.id];
    const mode = source.activeMode;
    const modeMobile = mobileData.areas?.[entry.id]?.[mode] ?? {};
    const desktopPresentation = source[mode].presentation;
    const patches = modeMobile.presentation ?? {};
    for (const id of source.members) widgets[id] = present(page.widgets[id], patches[id] ?? {} , desktopPresentation[id]);

    if (mode === "flow") {
      areas[entry.id] = { mode, order: clone(modeMobile.order ?? source.flow.order) };
      continue;
    }
    const desktopGeometry = source.composition.geometry;
    const composition = resolveCompositionGeometry({
      areaId: entry.id,
      desktopGeometry,
      mobileGeometry: modeMobile.geometry,
      mobileHeightPolicy: modeMobile.height,
      widgets,
      imageDimensions,
      mobile,
      deferBoundsValidation,
    });
    areas[entry.id] = { mode, ...composition };
  }

  return {
    schemaVersion: page.layout.version,
    viewportWidthPx,
    presentation: mobile ? "mobile" : "desktop",
    referenceWidthPx: mobile ? WYRMTIZER_MOBILE_REFERENCE_WIDTH_PX : null,
    rootOrder,
    widgets,
    areas,
  };
}

function present(widget, patch, desktopPresentation = {}) {
  // Object spread preserves explicit false and zero overrides.
  return { ...clone(widget), settings: { ...clone(widget.settings ?? {}), ...clone(desktopPresentation), ...clone(patch) } };
}

function resolveCompositionGeometry({ areaId, desktopGeometry, mobileGeometry, mobileHeightPolicy, widgets, imageDimensions, mobile, deferBoundsValidation }) {
  const desktopProfile = desktopGeometry.profiles.desktop;
  const widthPx = mobile ? WYRMTIZER_MOBILE_REFERENCE_WIDTH_PX : desktopProfile.referenceWidthPx;
  const desktopHeightPolicy = desktopProfile.height;
  let heightPolicy = mobile
    ? (mobileHeightPolicy ?? (mobileGeometry
      ? { mode: "custom", valuePx: mobileGeometry.heightPx }
      : { mode: desktopHeightPolicy.mode === "auto" ? "auto" : "custom",
        valuePx: desktopHeightPolicy.valuePx * widthPx / desktopProfile.referenceWidthPx }))
    : desktopHeightPolicy;
  if (mobile && mobileHeightPolicy?.mode === "auto" && mobileGeometry)
    heightPolicy = { ...mobileHeightPolicy, valuePx: Math.max(mobileHeightPolicy.valuePx, mobileGeometry.heightPx) };
  const coordinateHeightPx = mobileGeometry?.heightPx ?? heightPolicy.valuePx;
  const readingOrder = mobile
    ? (mobileGeometry?.readingOrder ?? desktopGeometry.childrenOrder)
    : desktopGeometry.childrenOrder;
  const stackOrder = mobile
    ? (mobileGeometry?.stackOrder ?? desktopGeometry.stackOrder)
    : desktopGeometry.stackOrder;
  const placements = {};
  const heightItems = [];

  for (const id of readingOrder) {
    const desktopPlacement = desktopGeometry.placements[id];
    const desktopFrame = desktopPlacement.frames.desktop;
    const mobilePlacement = mobileGeometry?.placements?.[id];
    const anchor = mobile && mobilePlacement
      ? {
        x: coordinatePx(mobilePlacement.x, widthPx),
        y: coordinatePx(mobilePlacement.y, coordinateHeightPx),
        pivot: clone(mobilePlacement.pivot),
      }
      : mobile
        ? {
          x: desktopFrame.x * widthPx,
          y: desktopFrame.y * widthPx,
          pivot: clone(desktopFrame.pivot),
        }
        : {
          x: desktopFrame.x * widthPx,
          y: desktopFrame.y * widthPx,
          pivot: clone(desktopFrame.pivot),
        };
    const rotation = desktopFrame.rotation ?? 0;
    const rotationPivot = desktopFrame.rotationPivot;
    const widget = widgets[id];
    const dimensions = imageDimensions[id] ?? { width: 1600, height: 900 };
    if (!record(dimensions) || !positive(dimensions.width) || !positive(dimensions.height))
      fail(`invalid image dimensions for Widget ${id}`);
    const reference = imageReference(widthPx, dimensions.width, dimensions.height);
    const size = transformRect(widget.settings.image_transform, reference);
    const rect = {
      left: anchor.x - anchor.pivot.x * size.width,
      top: anchor.y - anchor.pivot.y * size.height,
      width: size.width,
      height: size.height,
    };
    const frame = { x: anchor.x / widthPx, y: anchor.y / widthPx, pivot: anchor.pivot, rotation,
      ...(rotationPivot ? { rotationPivot } : {}) };
    heightItems.push({ rect, frame, version: mobile ? 3 : desktopPlacement.version });
    placements[id] = { xPx: anchor.x, yPx: anchor.y, pivot: anchor.pivot, rotation, rotationPivot: rotationPivot ? clone(rotationPivot) : null, rect };
  }

  const minimumHeightPx = minimumCompositionHeight(heightItems, widthPx);
  const heightPx = Math.max(heightPolicy.valuePx, minimumHeightPx);
  if (!deferBoundsValidation) {
    if (heightPx > 10000) fail(`effective Composition Area ${areaId} exceeds maximum height`);
    for (const [id, placement] of Object.entries(placements)) {
      const bounds = rotatedBounds(placement.rect, placement.rotation, placement.rotationPivot ?? undefined);
      if (bounds.left < -0.02 || bounds.top < -0.02 || bounds.left + bounds.width > widthPx + 0.02 ||
          !containedRect(placement.rect, widthPx, heightPx, placement.rotation, placement.rotationPivot ?? undefined))
        fail(`effective Composition child ${id} exceeds Area ${areaId} bounds`);
    }
  }
  return { readingOrder: clone(readingOrder), stackOrder: clone(stackOrder), geometry: { widthPx, heightPx, placements } };
}

function coordinatePx(coordinate, parentExtent) {
  return coordinate.unit === "%" ? coordinate.value * parentExtent / 100 : coordinate.value;
}

function positive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
