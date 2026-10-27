export const SCALE_WIDTH = "image_scale_width";
export const SCALE_HEIGHT = "image_scale_height";
export const DEFAULT_IMAGE_TRANSFORM = { version: 1, reference: "intrinsic-fit", scale: { width: null, height: null }, flowInset: { inlinePercent: 0, blockPercent: 0 } };
const finite = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const scale = (v) => v === null || finite(v, 1, 400);
export function isImageTransform(value) {
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
export function rectTransform(rect, reference) {
  const round = (v) => Math.round(v * 10000) / 10000;
  return { ...structuredClone(DEFAULT_IMAGE_TRANSFORM), scale: { width: Math.max(1, Math.min(400, round(100 * rect.width / reference.width))),
    height: Math.max(1, Math.min(400, round(100 * rect.height / reference.height))) }, flowInset: {
    inlinePercent: Math.max(0, Math.min(100, round(100 * rect.left / reference.containerWidth))), blockPercent: Math.max(0, Math.min(400, round(100 * rect.top / reference.height))) } };
}
