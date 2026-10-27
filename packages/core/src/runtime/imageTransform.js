export const SCALE_WIDTH = "image_scale_width";
export const SCALE_HEIGHT = "image_scale_height";
export const DEFAULT_IMAGE_TRANSFORM = { version: 1, reference: "intrinsic-fit", scale: { width: null, height: null }, flowInset: { inlinePercent: 0, blockPercent: 0 } };
const finite = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const scale = (v) => v === null || finite(v, 1, 400);
export function isImageTransform(value) {
  if (value?.version === 2) return value.reference === "intrinsic-fit" &&
    ["width", "height"].every((axis) => {
      const d = value.dimensions?.[axis];
      return ["%", "px"].includes(d?.unit) && (d.value === null || (finite(d.value, 1, d.unit === "px" ? 10000 : 400) && (d.unit !== "px" || Number.isInteger(d.value))));
    }) && ["left", "center", "right"].includes(value.alignment) &&
    finite(value.flowInset?.inlinePercent, -100, 100) && finite(value.flowInset?.blockPercent, 0, 400);
  return value?.version === 1 && value.reference === "intrinsic-fit" && scale(value.scale?.width) && scale(value.scale?.height) &&
    finite(value.flowInset?.inlinePercent, 0, 100) && finite(value.flowInset?.blockPercent, 0, 400);
}
export function supportsImageTransform(widget, schema) {
  return widget?.type === "image" && schema?.type === "image" && [SCALE_WIDTH, SCALE_HEIGHT].every((id) =>
    schema.settings?.some((s) => s.id === id && s.type === "range" && s.min === 0 && s.max === 400 && s.default === 0));
}
export function imageReference(containerWidth, naturalWidth = 1600, naturalHeight = 900) {
  if (!(naturalWidth > 0 && naturalHeight > 0)) { naturalWidth = 1600; naturalHeight = 900; }
  const width = Math.min(containerWidth, naturalWidth);
  return { containerWidth, width, height: width * naturalHeight / naturalWidth };
}
export function transformRect(transform, reference) {
  if (transform.version === 2) {
    const { width: w, height: h } = transform.dimensions;
    const px = (d, basis) => d.value === null ? null : d.unit === "px" ? d.value : basis * d.value / 100;
    const requestedWidth = px(w, reference.width), requestedHeight = px(h, reference.height);
    const width = Math.max(1, Math.min(reference.containerWidth, requestedWidth ??
      (requestedHeight === null ? reference.width : requestedHeight * reference.width / reference.height)));
    const height = w.value === null || h.value === null ? width * reference.height / reference.width : requestedHeight;
    const left = Math.max(0, Math.min(reference.containerWidth - width,
      alignmentFactor(transform.alignment) * (reference.containerWidth - width) + reference.containerWidth * transform.flowInset.inlinePercent / 100));
    return { left, top: reference.height * transform.flowInset.blockPercent / 100, width, height };
  }
  const sx = (transform.scale.width ?? transform.scale.height ?? 100) / 100;
  const sy = (transform.scale.height ?? transform.scale.width ?? 100) / 100;
  const left = reference.containerWidth * transform.flowInset.inlinePercent / 100;
  const width = Math.max(1, Math.min(reference.width * sx, reference.containerWidth - left));
  const proportional = transform.scale.width === null || transform.scale.height === null;
  const height = proportional ? width * reference.height / reference.width : reference.height * sy;
  return { left, top: reference.height * transform.flowInset.blockPercent / 100, width, height };
}
export function legacyImageTransform(widget, reference) {
  if (isImageTransform(widget.settings?.image_transform)) return structuredClone(widget.settings.image_transform);
  const width = reference.containerWidth * (widget.settings?.image_width_percent ?? 100) / 100;
  const height = widget.settings?.image_height_px || 0;
  return { ...structuredClone(DEFAULT_IMAGE_TRANSFORM), scale: { width: 100 * width / reference.width,
    height: height ? 100 * height / reference.height : null },
    flowInset: { inlinePercent: 100 * (reference.containerWidth - width) / 2 / reference.containerWidth, blockPercent: 0 } };
}
export function rectTransform(rect, reference, previous, direction = "nsew") {
  const round = (v) => Math.round(v * 10000) / 10000;
  if (previous?.version === 2) {
    const next = structuredClone(previous);
    for (const [axis, basis, manipulated] of [["width", reference.width, /[ew]/.test(direction)], ["height", reference.height, /[ns]/.test(direction)]]) {
      const d = next.dimensions[axis];
      if (manipulated || d.value === null) d.value = d.unit === "px" ? Math.max(1, Math.min(10000, Math.round(rect[axis]))) : Math.max(1, Math.min(400, round(100 * rect[axis] / basis)));
    }
    // Convert only at the image/layout boundary; the geometry helper has no alignment assumptions.
    const resolved = transformRect({ ...next, flowInset: { inlinePercent: 0, blockPercent: 0 } }, reference);
    next.flowInset = { inlinePercent: Math.max(-100, Math.min(100, round(100 * (rect.left - resolved.left) / reference.containerWidth))),
      blockPercent: Math.max(0, Math.min(400, round(100 * rect.top / reference.height))) };
    return next;
  }
  return { ...structuredClone(DEFAULT_IMAGE_TRANSFORM), scale: { width: Math.max(1, Math.min(400, round(100 * rect.width / reference.width))),
    height: Math.max(1, Math.min(400, round(100 * rect.height / reference.height))) }, flowInset: {
    inlinePercent: Math.max(0, Math.min(100, round(100 * rect.left / reference.containerWidth))), blockPercent: Math.max(0, Math.min(400, round(100 * rect.top / reference.height))) } };
}

export const alignmentFactor = (alignment) => alignment === "center" ? 0.5 : alignment === "right" ? 1 : 0;
export function defaultImageTransform(alignment = "center") {
  return { version: 2, reference: "intrinsic-fit", dimensions: { width: { unit: "%", value: null }, height: { unit: "%", value: null } },
    alignment, flowInset: { inlinePercent: 0, blockPercent: 0 } };
}
export function supportsImageUnits(widget, schema) {
  return supportsImageTransform(widget, schema) && schema.imageTransformVersion === 2;
}
export function imageTransformV2(widget, reference) {
  const saved = isImageTransform(widget.settings?.image_transform) ? widget.settings.image_transform : null;
  if (isImageTransform(saved) && saved.version === 2) return structuredClone(saved);
  const old = legacyImageTransform(widget, reference);
  const next = defaultImageTransform(saved?.version === 1 ? "left" : "center");
  next.dimensions = { width: { unit: "%", value: old.scale.width }, height: { unit: "%", value: old.scale.height } };
  next.flowInset = structuredClone(old.flowInset);
  if (!saved) next.flowInset.inlinePercent = 0;
  return next;
}
export function imageDimensionValue(transform, axis, reference) {
  const d = transform.dimensions[axis];
  return d.value !== null ? Math.round(d.value * 100) / 100 : (d.unit === "px" ? Math.round(transformRect(transform, reference)[axis]) :
    Math.round(transformRect(transform, reference)[axis] / reference[axis] * 10000) / 100);
}
export function switchImageUnit(transform, axis, unit, reference) {
  if (!["%", "px"].includes(unit) || !["width", "height"].includes(axis)) return null;
  const next = structuredClone(transform);
  if (next.dimensions[axis].unit === unit) return next;
  const visible = transformRect(transform, reference)[axis];
  const value = unit === "px" ? Math.round(visible) : Math.round(visible / reference[axis] * 10000) / 100;
  if (value < 1 || value > (unit === "px" ? 10000 : 400)) return null;
  next.dimensions[axis] = { unit, value };
  return next;
}
export function isDefaultImageScale(widget, reference) {
  const t = widget?.settings?.image_transform;
  if (reference) {
    if (widget?.settings?.fullwidth) return false;
    const rect = transformRect(legacyImageTransform(widget, reference), reference);
    return Math.abs(rect.width - reference.width) < 0.01 && Math.abs(rect.height - reference.height) < 0.01;
  }
  if (isImageTransform(t) && t.version === 2) {
    return false;
  }
  if (isImageTransform(t)) return !widget.settings.fullwidth && [t.scale.width, t.scale.height].every((v) => v === null || v === 100) &&
    t.flowInset.blockPercent === 0;
  return false;
}
