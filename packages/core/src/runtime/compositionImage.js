import { isImageTransform, imageReference, transformRect } from "./imageTransform.js";
import { compositionRect, containedRect } from "./composition.js";

export function compositionImageRect(widget, composition, frame, naturalWidth = 1600, naturalHeight = 900) {
  const width = composition.profiles.desktop.referenceWidthPx;
  const basis = imageReference(width, naturalWidth, naturalHeight);
  const size = transformRect(widget.settings.image_transform, basis);
  return compositionRect(frame, size.width, size.height, width);
}
// New widget adapters register a capability and supply their own measurement,
// dimensions and rendering; membership/stacking never inspect image fields.
export const compositionImageAdapter = {
  capability: "image.v1",
  mediaPath: (widget) => widget.settings.image,
  validateMedia(widget, composition, frame, media) {
    if (!media) throw new Error("Composition Images require uploaded image metadata in this milestone.");
    if (media?.metadata?.caption || Object.values(media?.translations || {}).some((value) => value.caption))
      throw new Error("Captioned images are not composition-compatible in this milestone.");
    return validateImageCompositionBounds(widget, composition, frame, media?.width, media?.height);
  },
  measure: (widget) => widget.querySelector("[data-image-resize-target] img")?.getBoundingClientRect(),
  supports: (widget) =>
    widget?.type === "image" &&
    typeof widget.settings?.image === "string" && !!widget.settings.image.trim() &&
    widget.settings?.image_transform?.version === 2 &&
    isImageTransform(widget.settings.image_transform) &&
    !widget.settings?.caption,
};
export const compositionAdapters = { image: compositionImageAdapter };
export function validateImageCompositionBounds(widget, composition, frame, naturalWidth, naturalHeight) {
  const rect = compositionImageRect(widget, composition, frame, naturalWidth, naturalHeight);
  if (!containedRect(rect, composition.profiles.desktop.referenceWidthPx, composition.profiles.desktop.height.valuePx, frame.rotation))
    throw new Error("Composition image exceeds canvas bounds. Enlarge the Composition Area or resize the image.");
  return rect;
}
