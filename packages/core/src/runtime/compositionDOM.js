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
    transform: `rotate(${context.frame.rotation || 0}deg)`,
    transformOrigin: "50% 50%",
  });
}
export function resolvedCompositionRect(context, size) {
  return compositionRect(context.frame, size.width, size.height, context.width);
}
export function compositionFrame(context, rect) {
  return { ...context.frame, ...frameFromRect(rect, context.frame.pivot, context.width) };
}

export function unrotatedCompositionRect(context) {
  const css = context.child.ownerDocument.defaultView.getComputedStyle(context.child);
  const units = (value, basis) => value.endsWith("%") ? parseFloat(value) * basis / 100 : parseFloat(value) / context.scale;
  const rect = { left: units(css.left, context.width), top: units(css.top, context.height),
    width: units(css.width, context.width), height: units(css.height, context.height) };
  if (Object.values(rect).every(Number.isFinite) && rect.width > 0 && rect.height > 0) return rect;
  const box = context.child.getBoundingClientRect(), area = context.area.getBoundingClientRect();
  return { left: (box.left - area.left) / context.scale, top: (box.top - area.top) / context.scale,
    width: box.width / context.scale, height: box.height / context.scale };
}
