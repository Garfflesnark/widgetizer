import { serializeWyrmetizerEditorPage, WYRMTIZER_MOBILE_REFERENCE_WIDTH_PX } from "@widgetizer/core/wyrmetizerLayouts";
import { resolveWyrmetizerPresentation } from "@widgetizer/core/wyrmetizerPresentation";
import { compositionAdapters } from "@widgetizer/core/compositionImage";
import { imageReference } from "@widgetizer/core/imageTransform";

// This view is disposable. Only C1 transactions may write Mobile presentation.
export function mobilePresentationControlState(page, widgetId) {
  if (!page?.wyrmetizerEditorLayout || page.widgets?.[widgetId]?.type !== "image") return null;
  const canonical = serializeWyrmetizerEditorPage(page, compositionAdapters);
  const entry = Object.entries(canonical.layout.areas).find(([, area]) => area.members.includes(widgetId));
  const target = entry ? { areaId: entry[0], mode: entry[1].activeMode, widgetId } : { widgetId };
  const mode = target.mode || "flow";
  const patch = entry ? canonical.layout.mobile?.areas?.[target.areaId]?.[mode]?.presentation?.[widgetId]
    : canonical.layout.mobile?.presentation?.[widgetId];
  const view = resolveWyrmetizerPresentation(canonical, WYRMTIZER_MOBILE_REFERENCE_WIDTH_PX, { deferBoundsValidation: true });
  return { target, mode, patch: patch || {}, widget: view.widgets[widgetId],
    customizedCompositionGeometry: !!(entry && canonical.layout.mobile?.areas?.[target.areaId]?.composition?.geometry) };
}

export function mobileImageControlGeometry(mobile, geometry) {
  if (!geometry || mobile?.target.mode !== "composition") return geometry;
  return { ...geometry, ...imageReference(WYRMTIZER_MOBILE_REFERENCE_WIDTH_PX,
    geometry.naturalWidth ?? geometry.width, geometry.naturalHeight ?? geometry.height) };
}
