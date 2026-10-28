import { compositionContext, applyCompositionRect, compositionFrame } from "./compositionDOM.js";

export function createCompositionMoveController({
  document,
  selected,
  onPreview,
  onCommit,
  measure = (widget) => widget.getBoundingClientRect(),
  onStart,
  getContext,
}) {
  let gesture = null,
    raf = null,
    suppressClick = false;
  const view = document.defaultView;
  const draw = () => {
    raf = null;
    if (gesture) applyCompositionRect(gesture.context, gesture.rect);
    onPreview();
  };
  const finish = (commit) => {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    if (raf !== null) {
      view.cancelAnimationFrame(raf);
      raf = null;
    }
    const changed = Math.abs(g.rect.left - g.start.left) + Math.abs(g.rect.top - g.start.top) > 0.01;
    if (commit && changed) {
      applyCompositionRect(g.context, g.rect);
      suppressClick = true;
      onCommit({
        widgetId: g.widgetId,
        compositionId: g.context.area.dataset.compositionId,
        interactionContext: g.interactionContext,
        startRevision: g.revision,
        startFrame: g.context.frame,
        frame: compositionFrame(g.context, g.rect),
      });
    } else if (g.style === null) g.context.child.removeAttribute("style");
    else g.context.child.setAttribute("style", g.style);
    if (g.capture.hasPointerCapture?.(g.pointerId)) g.capture.releasePointerCapture(g.pointerId);
    onPreview();
  };
  const down = (e) => {
    if (e.target.closest(".wz-image-resize-handle")) {
      finish(false);
      return;
    }
    if (
      e.button !== 0 ||
      gesture ||
      e.target.closest(
        ".wz-image-resize-handle,[data-image-align-menu],.wz-image-menu,[data-widget-reorder],input,textarea,select",
      )
    )
      return;
    const grip = e.target.closest("[data-composition-move]");
    const widget = grip
      ? Array.from(document.querySelectorAll("[data-widget-id]")).find(
          (el) => el.dataset.widgetId === grip.dataset.compositionMove,
        )
      : e.target.closest("[data-widget-id]");
    const context = compositionContext(widget);
    if (!context?.editable || selected() !== widget?.dataset.widgetId || (e.target.closest("button,a") && !grip))
      return;
    if (getContext && !getContext()) return;
    const r = measure(widget);
    if (!r) return;
    onStart?.();
    const box = context.area.getBoundingClientRect(),
      start = {
        left: (r.left - box.left) / context.scale,
        top: (r.top - box.top) / context.scale,
        width: r.width / context.scale,
        height: r.height / context.scale,
      };
    const capture = grip ? document.getElementById("wz-selection-overlay") : context.area;
    gesture = {
      context,
      interactionContext: getContext?.(),
      revision: context.child.dataset.compositionRevision,
      widgetId: widget.dataset.widgetId,
      pointerId: e.pointerId,
      capture,
      x: e.clientX,
      y: e.clientY,
      start,
      rect: { ...start },
      style: context.child.getAttribute("style"),
    };
    capture.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  };
  const move = (e) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const g = gesture;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) <= 3 && !g.moved) return;
    g.moved = true;
    g.rect.left = Math.max(
      0,
      Math.min(g.context.width - g.start.width, g.start.left + (e.clientX - g.x) / g.context.scale),
    );
    g.rect.top = Math.max(
      0,
      Math.min(g.context.height - g.start.height, g.start.top + (e.clientY - g.y) / g.context.scale),
    );
    if (raf === null) raf = view.requestAnimationFrame(draw);
    e.preventDefault();
  };
  const up = (e) => {
    if (gesture?.pointerId === e.pointerId) {
      move(e);
      finish(true);
    }
  };
  const cancel = () => finish(false);
  const key = (e) => {
    if (e.key === "Escape" && gesture) {
      e.preventDefault();
      cancel();
    }
  };
  const click = (e) => {
    if (suppressClick) {
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    }
  };
  document.addEventListener("pointerdown", down, true);
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", cancel);
  document.addEventListener("lostpointercapture", cancel);
  document.addEventListener("keydown", key);
  document.addEventListener("click", click, true);
  view.addEventListener("blur", cancel);
  return {
    cancel,
    destroy() {
      cancel();
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("lostpointercapture", cancel);
      document.removeEventListener("keydown", key);
      document.removeEventListener("click", click, true);
      view.removeEventListener("blur", cancel);
    },
  };
}
