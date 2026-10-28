import { createComposition } from "../composition.js";
import { defaultImageTransform } from "../imageTransform.js";
export function fixture() {
  const transform = defaultImageTransform();
  transform.dimensions = { width: { unit: "px", value: 300 }, height: { unit: "px", value: 200 } };
  const image = () => ({ type: "image", settings: { image: "/uploads/images/photo.jpg", image_transform: structuredClone(transform) } });
  const page = {
    widgets: { a: image(), b: image(), after: { type: "text", settings: {} } },
    widgetsOrder: ["a", "b", "after"],
  };
  return createComposition(page, "canvas", ["a", "b"], {
    a: { x: 0.5, y: 0.15, pivot: { x: 0.5, y: 0 } },
    b: { x: 0.4, y: 0.2, pivot: { x: 0, y: 0 } },
  });
}
