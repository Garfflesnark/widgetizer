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
