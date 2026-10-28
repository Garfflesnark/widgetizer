import { compositionAdapters, validateImageCompositionBounds } from "@widgetizer/core/compositionImage";
export const compositionImageRenderer = {
  ...compositionAdapters.image,
  render(html, widget, composition, frame) {
    if (!html.includes('data-composition-capability="image.v1"'))
      throw new Error(
        "The effective project image template does not support Composition Areas. Synchronize the approved image theme files first.",
      );
    if (!/<img\b/i.test(html)) throw new Error("Choose an image before converting it to a Composition Area.");
    if (/<figcaption\b/i.test(html))
      throw new Error("Captioned images are not composition-compatible in this milestone.");
    const number = (name) => Number(html.match(new RegExp(`data-image-natural-${name}="([0-9.]+)"`))?.[1]);
    const rect = validateImageCompositionBounds(widget, composition, frame, number("width"), number("height"));
    return { html, rect };
  },
};
