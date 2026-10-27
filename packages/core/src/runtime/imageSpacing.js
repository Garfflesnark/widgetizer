export const SPACING_FIELDS = { top_spacing_px: "top", bottom_spacing_px: "bottom" };
export const isImageSpacing = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2000;
export const supportsImageSpacing = (widget, schema) => widget?.type === "image" && schema?.imageSpacingVersion === 1;
export function imageSpacing(settings = {}) {
  return Object.fromEntries(["top", "bottom"].map((side) => [side, settings[`${side}_spacing`] === "none" ? 0 :
    settings[`${side}_spacing`] === "px" ? (isImageSpacing(settings[`${side}_spacing_px`]) ? settings[`${side}_spacing_px`] : 0) : null]));
}
