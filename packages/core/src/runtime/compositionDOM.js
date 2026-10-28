import { compositionRect, frameFromRect } from "./composition.js";

export function compositionContext(widget) {
  const child = widget?.closest("[data-composition-child]"),
    area = child?.closest("[data-composition-id]");
  if (!area) return null;
  const width = Number(area.dataset.compositionWidth),
    height = Number(area.dataset.compositionHeight);
  const scale = area.getBoundingClientRect().width / width;
  return {
    child,
    area,
    width,
    height,
    scale,
    frame: JSON.parse(child.dataset.compositionFrame),
    editable: widget.ownerDocument.defaultView.innerWidth >= 990,
  };
}
export function applyCompositionRect(context, rect) {
  const { child, width, height } = context;
  Object.assign(child.style, {
    left: `${(100 * rect.left) / width}%`,
    top: `${(100 * rect.top) / height}%`,
    width: `${(100 * rect.width) / width}%`,
    height: `${(100 * rect.height) / height}%`,
  });
}
export function resolvedCompositionRect(context, size) {
  return compositionRect(context.frame, size.width, size.height, context.width);
}
export function compositionFrame(context, rect) {
  return frameFromRect(rect, context.frame.pivot, context.width);
}
