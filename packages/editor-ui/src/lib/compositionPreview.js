import { compositionFor } from "@widgetizer/core/composition";

// Geometry/paint changes are already reconciled directly by the iframe bridge.
// Morphing them would replace the manipulated DOM and restore an old frame.
export function isCompositionGeometryOnlyChange(before, after) {
  if (!before?.page?.layout || !after?.page?.layout) return false;
  const normalize = (state) => {
    const page = structuredClone(state.page);
    delete page.wyrmetizerEditorLayout;
    for (const c of Object.values(page.layout.compositions)) {
      for (const p of Object.values(c.placements))
        if (p.frames?.desktop) {
          delete p.version;
          delete p.frames.desktop.x;
          delete p.frames.desktop.y;
          delete p.frames.desktop.pivot;
          delete p.frames.desktop.rotation;
        }
      delete c.stackOrder;
    }
    const widgets = structuredClone(state.widgets || page.widgets);
    for (const id of Object.keys(widgets))
      if (compositionFor(state.page, id)) {
        for (const key of ["image_transform", "fullwidth", "image_width_percent", "image_height_px"])
          delete widgets[id].settings[key];
      }
    page.widgets = widgets;
    return { page, globalWidgets: state.globalWidgets, themeSettings: state.themeSettings };
  };
  return JSON.stringify(normalize(before)) === JSON.stringify(normalize(after));
}
