import { compositionContext, unrotatedCompositionRect, applyCompositionRect } from "./compositionDOM.js";
import { centerRotationPivot, rebaseRotationPivot, rotatedPoint, rotateVector } from "./rotationGeometry.js";

export function createWyrmetizerPivotController({ document, selected, getContext, onStart, onPreview, onCommit }) {
  const view = document.defaultView;
  let session = null;
  const current = () => compositionContext(Array.from(document.querySelectorAll("[data-widget-id]")).find(el => el.dataset.widgetId === selected()));
  const payload = (context, pivot) => ({ widgetId: selected(), compositionId: context.area.dataset.compositionId,
    startRevision: context.child.dataset.compositionRevision, interactionContext: getContext(), startFrame: context.frame, rotationPivot: pivot });
  const finish = commit => {
    if (!session) return;
    const s = session; session = null;
    s.context.child.dataset.compositionFrame = JSON.stringify(s.context.frame);
    if (s.style === null) s.context.child.removeAttribute("style"); else s.context.child.setAttribute("style", s.style);
    if (s.drag != null && s.capture.hasPointerCapture?.(s.drag)) s.capture.releasePointerCapture(s.drag);
    if (commit) onCommit({ ...s.payload, rotationPivot: s.pivot });
    onPreview();
  };
  const update = pivot => {
    const s = session;
    s.pivot = { x: Math.max(0, Math.min(1, pivot.x)), y: Math.max(0, Math.min(1, pivot.y)) };
    const rect = rebaseRotationPivot(s.rect, s.context.frame.rotation || 0,
      s.context.frame.rotationPivot || centerRotationPivot, s.pivot);
    const frame = { ...s.context.frame, x: (rect.left + s.context.frame.pivot.x * rect.width) / s.context.width,
      y: (rect.top + s.context.frame.pivot.y * rect.height) / s.context.width, rotationPivot: s.pivot };
    s.context.child.dataset.compositionFrame = JSON.stringify(frame);
    applyCompositionRect({ ...s.context, frame }, rect);
    onPreview();
  };
  const begin = () => {
    const context = current();
    if (!context?.editable || !getContext()) return;
    onStart();
    session = { context, rect: unrotatedCompositionRect(context), payload: payload(context, context.frame.rotationPivot || centerRotationPivot),
      pivot: { ...(context.frame.rotationPivot || centerRotationPivot) }, style: context.child.getAttribute("style"),
      capture: document.getElementById("wz-selection-overlay"), drag: null };
    onPreview();
  };
  const owns = event => event.target.closest?.("[data-rotation-pivot], [data-reset-rotation-pivot]");
  const down = event => {
    if (session && !owns(event)) finish(false);
    if (!owns(event) || event.button !== 0) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!session || !event.target.closest("[data-rotation-pivot]")) return;
    session.drag = event.pointerId;
    try {
      if (!session.capture.setPointerCapture) { finish(false); return; }
      session.capture.setPointerCapture(event.pointerId);
    } catch { finish(false); }
  };
  const move = event => {
    const s = session;
    if (!s || s.drag !== event.pointerId) return;
    const box = s.context.area.getBoundingClientRect(), pivot = s.context.frame.rotationPivot || centerRotationPivot;
    const local = rotateVector((event.clientX - box.left) / s.context.scale - s.rect.left - pivot.x * s.rect.width,
      (event.clientY - box.top) / s.context.scale - s.rect.top - pivot.y * s.rect.height, -(s.context.frame.rotation || 0));
    update({ x: pivot.x + local.x / s.rect.width, y: pivot.y + local.y / s.rect.height });
    event.preventDefault(); event.stopImmediatePropagation();
  };
  const up = event => {
    if (session?.drag !== event.pointerId) return;
    move(event);
    const s = session; s.drag = null;
    if (s.capture.hasPointerCapture?.(event.pointerId)) s.capture.releasePointerCapture(event.pointerId);
  };
  const double = event => {
    if (!event.target.closest?.("[data-rotation-pivot]")) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (session) finish(true); else begin();
  };
  const click = event => {
    if (!owns(event)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.target.closest("[data-reset-rotation-pivot]")) {
      finish(false);
      const context = current();
      if (context?.editable) onCommit(payload(context, { ...centerRotationPivot }));
    }
  };
  const key = event => {
    if (event.key === "Escape" && session) { event.preventDefault(); finish(false); return; }
    if (!event.target.closest?.("[data-rotation-pivot]")) return;
    if (event.key === "Enter") { event.preventDefault(); event.stopImmediatePropagation(); if (session) finish(true); else begin(); document.querySelector("[data-rotation-pivot]")?.focus(); }
    if (session && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
      const step = event.shiftKey ? 0.1 : 0.01;
      update({ x: session.pivot.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
        y: session.pivot.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0) });
      document.querySelector("[data-rotation-pivot]")?.focus();
    }
  };
  const cancel = () => finish(false);
  const lost = () => { if (session?.drag != null) cancel(); };
  const listeners = [["pointerdown", down, true], ["pointermove", move, true], ["pointerup", up, true],
    ["dblclick", double, true], ["click", click, true], ["keydown", key, true], ["pointercancel", cancel], ["lostpointercapture", lost]];
  listeners.forEach(args => document.addEventListener(...args)); view.addEventListener("blur", cancel);
  return { cancel, get active() { return !!session; },
    reconcile(context, revisions, force) {
      if (session && (force || context !== session.payload.interactionContext || revisions?.[session.payload.widgetId] !== session.payload.startRevision)) cancel();
    },
    render(overlay, widget, blockId) {
      const context = compositionContext(widget);
      if (!context?.editable || blockId) return;
      const rect = unrotatedCompositionRect(context), pivot = context.frame.rotationPivot || centerRotationPivot;
      const point = rotatedPoint(rect, pivot.x, pivot.y, context.frame.rotation || 0, pivot), box = context.area.getBoundingClientRect();
      const zoom = Number(view.getComputedStyle(document.documentElement).getPropertyValue("--wz-editor-inverse-zoom")) || 1;
      const button = document.createElement("button"); button.type = "button";
      button.dataset.rotationPivot = widget.dataset.widgetId; button.textContent = session ? "+" : "⊙";
      button.setAttribute("aria-label", session ? "Editing rotation pivot: arrows adjust; Enter confirms; Escape cancels" : "Rotation pivot: double-click or Enter to edit");
      button.setAttribute("aria-pressed", String(!!session));
      button.title = session ? "Pivot editing — double-click to confirm; Escape cancels" : "Double-click to edit rotation pivot";
      Object.assign(button.style, { position: "absolute", left: `${box.left + point.x * context.scale - 10 * zoom}px`,
        top: `${box.top + point.y * context.scale - 10 * zoom}px`, width: `${20 * zoom}px`, height: `${20 * zoom}px`,
        borderRadius: "50%", background: session ? "#00e676" : "#e0006d", color: "#111", pointerEvents: "auto", touchAction: "none", cursor: "crosshair" });
      overlay.append(button);
    },
    destroy() { cancel(); listeners.forEach(args => document.removeEventListener(...args)); view.removeEventListener("blur", cancel); },
  };
}
