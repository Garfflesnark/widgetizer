import { compositionContext, unrotatedCompositionRect } from "./compositionDOM.js";
import { containedRect, minimumCompositionHeight } from "./composition.js";
import { normalizeAngle } from "./rotationGeometry.js";

export function createWyrmetizerNumericPreview({ document, selected, selectedComposition = () => null, getContext, onPreview }) {
  let draft = null;
  const cancel = () => {
    if (!draft) return;
    const previous = draft; draft = null;
    for (const [element, style] of previous.styles) {
      if (style === null) element.removeAttribute("style"); else element.setAttribute("style", style);
    }
    previous.context.area.dataset.compositionHeight = String(previous.context.height);
    previous.context.child.dataset.compositionFrame = JSON.stringify(previous.context.frame);
    onPreview();
  };
  return { cancel,
    preview(payload) {
      if (payload?.phase === "cancel") { cancel(); return; }
      if (!payload || payload.context !== getContext()) return;
      const widget = Array.from(document.querySelectorAll("[data-widget-id]")).find(el => el.dataset.widgetId === payload.widgetId);
      const area = widget?.closest("[data-composition-id]");
      // Area selection clears the selected image. Height still belongs to that
      // area, whereas rotation continues to require the selected image itself.
      if (payload.widgetId !== selected() && !(payload.field === "height" && area &&
          area.dataset.compositionId === selectedComposition())) return;
      // Retain the final styles until the canonical sync arrives; cancellation
      // here would paint the original geometry between preview and commit.
      if (payload.phase === "commit") { if (draft?.revision === payload.revision) draft = null; return; }
      if (!draft) {
        const context = compositionContext(widget);
        if (!context?.editable || context.child.dataset.compositionRevision !== payload.revision) return;
        const children = Array.from(context.area.querySelectorAll("[data-composition-child]"));
        draft = { context, revision: payload.revision, styles: [context.area, ...children].map(el => [el, el.getAttribute("style")]),
          rects: children.map(child => { const c = compositionContext(child.querySelector("[data-widget-id]")); return { child, frame: c.frame, rect: unrotatedCompositionRect(c) }; }) };
      }
      if (payload.revision !== draft.revision || !Number.isFinite(payload.value)) { cancel(); return; }
      const { context, rects } = draft;
      if (payload.field === "rotation" && Math.abs(payload.value) <= 360000) {
        const angle = normalizeAngle(payload.value), rect = rects.find(item => item.child === context.child).rect;
        if (!containedRect(rect, context.width, context.height, angle, context.frame.rotationPivot)) return;
        context.child.style.transform = `rotate(${angle}deg)`;
        context.child.style.transformOrigin = `${100 * (context.frame.rotationPivot?.x ?? 0.5)}% ${100 * (context.frame.rotationPivot?.y ?? 0.5)}%`;
        context.child.dataset.compositionFrame = JSON.stringify({ ...context.frame, rotation: angle });
      } else if (payload.field === "height" && payload.value >= 1 && payload.value <= 10000) {
        const height = Math.max(payload.value, minimumCompositionHeight(rects, context.width));
        if (height > 10000 || rects.some(({ rect, frame }) => !containedRect(rect, context.width, height, frame.rotation, frame.rotationPivot))) return;
        context.area.style.aspectRatio = `${context.width}/${height}`;
        context.area.dataset.compositionHeight = String(height);
        for (const { child, rect } of rects) {
          child.style.top = `${100 * rect.top / height}%`;
          child.style.height = `${100 * rect.height / height}%`;
        }
      } else return;
      onPreview();
    },
  };
}
