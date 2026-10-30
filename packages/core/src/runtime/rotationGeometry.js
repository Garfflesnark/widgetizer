export function normalizeAngle(angle) {
  return Math.round(((((angle + 180) % 360) + 360) % 360 - 180) * 1000) / 1000;
}
export function rotateVector(x, y, angle = 0) {
  const a = angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}
export const centerRotationPivot = Object.freeze({ x: 0.5, y: 0.5 });
export function validRotationPivot(pivot) {
  return pivot && [pivot.x, pivot.y].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
}
export function rotatedPoint(rect, x, y, angle = 0, pivot = centerRotationPivot) {
  const v = rotateVector((x - pivot.x) * rect.width, (y - pivot.y) * rect.height, angle);
  return { x: rect.left + rect.width * pivot.x + v.x, y: rect.top + rect.height * pivot.y + v.y };
}
export function rebaseRotationPivot(rect, angle, previous = centerRotationPivot, next = centerRotationPivot) {
  const dx = (previous.x - next.x) * rect.width, dy = (previous.y - next.y) * rect.height;
  const rotated = rotateVector(dx, dy, angle);
  return { ...rect, left: rect.left + dx - rotated.x, top: rect.top + dy - rotated.y };
}
export function rotatedBounds(rect, angle = 0, pivot = centerRotationPivot) {
  const points = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => rotatedPoint(rect, x, y, angle, pivot));
  const left = Math.min(...points.map(p => p.x)), top = Math.min(...points.map(p => p.y));
  return { left, top, width: Math.max(...points.map(p => p.x)) - left, height: Math.max(...points.map(p => p.y)) - top };
}
export function hitRotatedRect(rect, point, angle = 0, pivot = centerRotationPivot) {
  const p = rotateVector(point.x - rect.left - rect.width * pivot.x, point.y - rect.top - rect.height * pivot.y, -angle);
  return p.x >= -rect.width * pivot.x && p.x <= rect.width * (1 - pivot.x) &&
    p.y >= -rect.height * pivot.y && p.y <= rect.height * (1 - pivot.y);
}
// Reposition the resized local rectangle so the solver's stationary nodes remain
// stationary in canvas space, including when several pins lock an axis.
export function rotatedResizeRect(start, local, angle = 0, pivot = centerRotationPivot) {
  const origin = rotatedPoint(start, (local.left - start.left + pivot.x * local.width) / start.width,
    (local.top - start.top + pivot.y * local.height) / start.height, angle, pivot);
  return { ...local, left: origin.x - pivot.x * local.width, top: origin.y - pivot.y * local.height };
}
