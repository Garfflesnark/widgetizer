// Keep the measured control row usable even when the object is narrower than
// its controls or touches a clipped composition edge.
export function overlayToolbarPlacement(image, toolbar, viewportWidth) {
  const idealLeft = image.left + (image.width - toolbar.width) / 2;
  const left = Math.max(4, Math.min(viewportWidth - toolbar.width - 4, idealLeft));
  return { shift: left - idealLeft, top: -toolbar.height - 6 };
}
