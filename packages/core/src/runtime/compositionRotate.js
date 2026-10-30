import { compositionContext, unrotatedCompositionRect } from "./compositionDOM.js";
import { containedRect } from "./composition.js";
import { normalizeAngle, rotatedPoint } from "./rotationGeometry.js";
import { wyrmetizerHandlePlacement } from "./wyrmetizerHandlePlacement.js";

export function createCompositionRotateController({ document, selected, getContext, onStart, onPreview, onCommit }) {
  const view = document.defaultView;
  let gesture = null, releaseClick = false, releaseTimer;
  const finish = (commit) => {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    if (!commit || g.angle === (g.context.frame.rotation || 0)) {
      if (g.style === null) g.context.child.removeAttribute("style");
      else g.context.child.setAttribute("style", g.style);
    } else onCommit({ widgetId: g.id, compositionId: g.context.area.dataset.compositionId,
      interactionContext: g.interactionContext, startRevision: g.revision, startFrame: g.context.frame,
      frame: { ...g.context.frame, rotation: g.angle } });
    releaseClick = true;
    view.clearTimeout(releaseTimer);
    releaseTimer = view.setTimeout(() => { releaseClick = false; }, 500);
    if (g.capture.hasPointerCapture?.(g.pointerId)) g.capture.releasePointerCapture(g.pointerId);
    onPreview();
  };
  const move = (e) => {
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const g = gesture, box = g.context.area.getBoundingClientRect();
    if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 3) return;
    g.moved = true;
    const cx = box.left + (g.rect.left + g.rect.width * (g.context.frame.rotationPivot?.x ?? 0.5)) * g.context.scale;
    const cy = box.top + (g.rect.top + g.rect.height * (g.context.frame.rotationPivot?.y ?? 0.5)) * g.context.scale;
    const raw = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    let angle = normalizeAngle((g.context.frame.rotation || 0) + normalizeAngle(raw - g.startPointerAngle));
    if (e.shiftKey) angle = normalizeAngle(Math.round(angle / 15) * 15);
    g.lastEvent = e;
    if (containedRect(g.rect, g.context.width, g.context.height, angle, g.context.frame.rotationPivot)) {
      g.angle = angle;
      g.context.child.style.transform = `rotate(${angle}deg)`;
      g.context.child.style.transformOrigin = `${100 * (g.context.frame.rotationPivot?.x ?? 0.5)}% ${100 * (g.context.frame.rotationPivot?.y ?? 0.5)}%`;
      onPreview();
    }
    e.preventDefault();
  };
  const down = (e) => {
    releaseClick = false;
    if (e.target.closest(".wz-image-resize-handle")) { finish(false); return; }
    const button = e.target.closest("[data-composition-rotate]");
    if (!button || e.button !== 0 || gesture || button.dataset.compositionRotate !== selected()) return;
    const widget = Array.from(document.querySelectorAll("[data-widget-id]")).find(el => el.dataset.widgetId === selected());
    const context = compositionContext(widget);
    if (!context?.editable || !getContext() || !(context.scale > 0)) return;
    onStart();
    const rect = unrotatedCompositionRect(context), box = context.area.getBoundingClientRect();
    const cx = box.left + (rect.left + rect.width * (context.frame.rotationPivot?.x ?? 0.5)) * context.scale;
    const cy = box.top + (rect.top + rect.height * (context.frame.rotationPivot?.y ?? 0.5)) * context.scale;
    const capture = document.getElementById("wz-selection-overlay");
    gesture = { context, rect, id: selected(), interactionContext: getContext(),
      revision: context.child.dataset.compositionRevision, pointerId: e.pointerId, capture,
      style: context.child.getAttribute("style"), angle: context.frame.rotation || 0,
      startX: e.clientX, startY: e.clientY, moved: false,
      startPointerAngle: Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI };
    capture.setPointerCapture?.(e.pointerId);
    e.preventDefault(); e.stopImmediatePropagation();
  };
  const up = e => { if (gesture?.pointerId === e.pointerId) { move(e); finish(true); } };
  const cancel = () => finish(false);
  const key = e => {
    if (!gesture) return;
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
    else if (e.key === "Shift" && gesture.lastEvent) move({ pointerId: gesture.pointerId,
      clientX: gesture.lastEvent.clientX, clientY: gesture.lastEvent.clientY, shiftKey: e.type === "keydown", preventDefault() {} });
  };
  const click = e => { if (releaseClick && e.detail !== 0) { releaseClick = false; e.preventDefault(); e.stopImmediatePropagation(); } };
  const listeners = [["pointerdown", down, true], ["pointermove", move], ["pointerup", up],
    ["pointercancel", cancel], ["lostpointercapture", cancel], ["keydown", key], ["keyup", key], ["click", click, true]];
  listeners.forEach(args => document.addEventListener(...args));
  view.addEventListener("blur", cancel);
  return {
    cancel,
    get active() { return !!gesture; },
    angle(widget) { return gesture?.id === widget?.dataset.widgetId ? gesture.angle : compositionContext(widget)?.frame.rotation || 0; },
    reconcile(context, revisions, force) {
      if (gesture && (force || context !== gesture.interactionContext || revisions?.[gesture.id] !== gesture.revision)) cancel();
    },
    render(overlay, widget, blockId) {
      const context = compositionContext(widget);
      if (!context || blockId) return;
      const rect = gesture?.id === widget.dataset.widgetId ? gesture.rect : unrotatedCompositionRect(context);
      const angle = this.angle(widget), box = context.area.getBoundingClientRect();
      const screen = (x, y) => { const p = rotatedPoint(rect, x, y, angle, context.frame.rotationPivot); return { x: box.left + p.x * context.scale, y: box.top + p.y * context.scale }; };
      const points = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => screen(x, y));
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none");
      const polygon = document.createElementNS(svg.namespaceURI, "polygon");
      polygon.setAttribute("points", points.map(p => `${p.x},${p.y}`).join(" "));
      polygon.setAttribute("fill", "none"); polygon.setAttribute("stroke", "#e0006d"); polygon.setAttribute("stroke-dasharray", "5 3");
      svg.append(polygon); overlay.append(svg);
      if (!context.editable) return;
      const zoom = Number(view.getComputedStyle(document.documentElement).getPropertyValue("--wz-editor-inverse-zoom")) || 1;
      const radians = angle * Math.PI / 180;
      const targets = Array.from(overlay.querySelectorAll(".wz-image-controls, .wz-image-resize-handle"))
        .map(element => element.getBoundingClientRect());
      const p = wyrmetizerHandlePlacement(screen(0.5, -30 * zoom / (rect.height * context.scale)),
        { x: Math.sin(radians), y: -Math.cos(radians) }, 10 * zoom, targets, 8 * zoom);
      const button = document.createElement("button");
      button.type = "button"; button.dataset.compositionRotate = widget.dataset.widgetId;
      button.textContent = "↻"; button.setAttribute("aria-label", "Rotate image");
      button.title = `Rotate image: ${angle}°. Shift snaps to 15°; Escape cancels. Pins rebase after rotation.`;
      Object.assign(button.style, { position: "absolute", left: `${p.x - 10 * zoom}px`, top: `${p.y - 10 * zoom}px`,
        width: `${20 * zoom}px`, height: `${20 * zoom}px`, borderRadius: "50%", background: "#e0006d", color: "white",
        pointerEvents: "auto", touchAction: "none", cursor: "grab" });
      overlay.append(button);
    },
    destroy() { cancel(); view.clearTimeout(releaseTimer); listeners.forEach(args => document.removeEventListener(...args)); view.removeEventListener("blur", cancel); },
  };
}
