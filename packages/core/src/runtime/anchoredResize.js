const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Pure geometry: no DOM, image assumptions, storage or implicit centering.
export function resizeAnchoredRect(rect, direction, dx, dy, bounds) {
  let left = rect.left, right = rect.left + rect.width, top = rect.top, bottom = rect.top + rect.height;
  const minWidth = bounds.minWidth ?? 1, minHeight = bounds.minHeight ?? 1;
  if (direction.includes("w")) left = clamp(left + dx, Math.max(bounds.left, right - (bounds.maxWidth ?? Infinity)), right - minWidth);
  if (direction.includes("e")) right = clamp(right + dx, left + minWidth, Math.min(bounds.right, left + (bounds.maxWidth ?? Infinity)));
  if (direction.includes("n")) top = clamp(top + dy, Math.max(bounds.top, bottom - (bounds.maxHeight ?? Infinity)), Math.min(bottom - minHeight, bounds.maxTop ?? Infinity));
  if (direction.includes("s")) bottom = clamp(bottom + dy, top + minHeight, Math.min(bounds.bottom ?? Infinity, top + (bounds.maxHeight ?? Infinity)));
  return { left, top, width: right - left, height: bottom - top };
}

export const RESIZE_NODES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export const nodeFraction = (node) => [node.includes("w") ? 0 : node.includes("e") ? 1 : 0.5,
  node.includes("n") ? 0 : node.includes("s") ? 1 : 0.5];

// Pinned points impose linear constraints on the rectangle, never freeform positions.
export function resizePinnedRect(rect, direction, dx, dy, bounds, { proportional = false, pins = [] } = {}) {
  const handle = nodeFraction(direction);
  const opposite = nodeFraction(direction.replace(/[nsew]/g, (c) => ({ n: "s", s: "n", e: "w", w: "e" })[c]));
  const initial = [rect.width, rect.height], starts = [rect.left, rect.top];
  const deltas = [dx, dy];
  const axes = [/[ew]/.test(direction), /[ns]/.test(direction)];
  const constraints = initial.map((size, axis) => {
    const fractions = [...new Set(pins.map((p) => nodeFraction(p)[axis]))];
    const pivot = fractions.length === 1 ? fractions[0] : opposite[axis];
    const fixed = starts[axis] + pivot * size;
    const locked = fractions.length > 1 || (fractions.length && pivot === handle[axis]) || (!axes[axis] && !proportional);
    const low = axis === 0 ? bounds.left : bounds.top;
    const high = axis === 0 ? bounds.right : (bounds.bottom ?? Infinity);
    let min = axis === 0 ? (bounds.minWidth ?? 1) : (bounds.minHeight ?? 1);
    let max = axis === 0 ? (bounds.maxWidth ?? Infinity) : (bounds.maxHeight ?? Infinity);
    if (pivot > 0) max = Math.min(max, (fixed - low) / pivot);
    if (pivot < 1) max = Math.min(max, (high - fixed) / (1 - pivot));
    if (axis === 1 && pivot > 0 && bounds.maxTop !== undefined) min = Math.max(min, (fixed - bounds.maxTop) / pivot);
    return { pivot, fixed, min: locked ? size : min, max: locked ? size : max, locked };
  });
  let sizes;
  if (proportional) {
    let numerator = 0, denominator = 0;
    for (let axis = 0; axis < 2; axis++) if (axes[axis]) {
      const arm = (handle[axis] - constraints[axis].pivot) * initial[axis];
      numerator += arm * deltas[axis]; denominator += arm * arm;
    }
    const min = Math.max(...constraints.map((c, i) => c.min / initial[i]));
    const max = Math.min(...constraints.map((c, i) => c.max / initial[i]));
    if (min > max || !denominator) return { ...rect };
    const factor = clamp(1 + numerator / denominator, min, max);
    sizes = initial.map((s) => s * factor);
  } else sizes = constraints.map((c, axis) => {
    if (c.min > c.max) return initial[axis];
    const arm = handle[axis] - c.pivot;
    return c.locked || !arm ? initial[axis] : clamp(initial[axis] + deltas[axis] / arm, c.min, c.max);
  });
  return { left: constraints[0].fixed - constraints[0].pivot * sizes[0],
    top: constraints[1].fixed - constraints[1].pivot * sizes[1], width: sizes[0], height: sizes[1] };
}
