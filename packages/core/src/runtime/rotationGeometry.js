export function normalizeAngle(angle) {
  return Math.round(((((angle + 180) % 360) + 360) % 360 - 180) * 1000) / 1000;
}
export function rotateVector(x, y, angle = 0) {
  const a = angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}
export function rotatedPoint(rect, x, y, angle = 0) {
  const v = rotateVector((x - 0.5) * rect.width, (y - 0.5) * rect.height, angle);
  return { x: rect.left + rect.width / 2 + v.x, y: rect.top + rect.height / 2 + v.y };
}
export function rotatedBounds(rect, angle = 0) {
  const points = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => rotatedPoint(rect, x, y, angle));
  const left = Math.min(...points.map(p => p.x)), top = Math.min(...points.map(p => p.y));
  return { left, top, width: Math.max(...points.map(p => p.x)) - left, height: Math.max(...points.map(p => p.y)) - top };
}
export function hitRotatedRect(rect, point, angle = 0) {
  const p = rotateVector(point.x - rect.left - rect.width / 2, point.y - rect.top - rect.height / 2, -angle);
  return Math.abs(p.x) <= rect.width / 2 && Math.abs(p.y) <= rect.height / 2;
}
// Reposition the resized local rectangle so the solver's stationary nodes remain
// stationary in canvas space, including when several pins lock an axis.
export function rotatedResizeRect(start, local, angle = 0) {
  const shift = rotateVector(local.left + local.width / 2 - start.left - start.width / 2,
    local.top + local.height / 2 - start.top - start.height / 2, angle);
  return { ...local, left: start.left + start.width / 2 + shift.x - local.width / 2,
    top: start.top + start.height / 2 + shift.y - local.height / 2 };
}
