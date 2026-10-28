// Move along the image's outward normal past measured pointer targets.
export function wyrmetizerHandlePlacement(point, normal, radius, targets, gap) {
  let distance = 0;
  for (let pass = 0; pass <= targets.length; pass++) {
    let next = distance;
    for (const box of targets) {
      const padding = radius + gap;
      const lo = { x: box.left - padding, y: box.top - padding };
      const hi = { x: box.right + padding, y: box.bottom + padding };
      let enter = -Infinity, leave = Infinity;
      for (const axis of ["x", "y"]) {
        if (Math.abs(normal[axis]) < 1e-9) {
          if (point[axis] < lo[axis] || point[axis] > hi[axis]) { leave = -Infinity; break; }
        } else {
          const a = (lo[axis] - point[axis]) / normal[axis];
          const b = (hi[axis] - point[axis]) / normal[axis];
          enter = Math.max(enter, Math.min(a, b));
          leave = Math.min(leave, Math.max(a, b));
        }
      }
      if (enter <= distance && leave >= distance) next = Math.max(next, leave + 0.01);
    }
    if (next === distance) break;
    distance = next;
  }
  return { x: point.x + normal.x * distance, y: point.y + normal.y * distance };
}
