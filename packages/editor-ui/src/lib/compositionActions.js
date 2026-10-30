import { orderingControls } from "@widgetizer/core/orderingControls";
import { normalizeAngle, rebaseRotationPivot, validRotationPivot, centerRotationPivot } from "@widgetizer/core/rotationGeometry";
import { serializeWyrmetizerEditorPage, switchWyrmetizerMode } from "@widgetizer/core/wyrmetizerLayouts";
import {
  changeStack,
  compositionFor,
  compositionRevision,
  createComposition,
  dissolveComposition,
  validateCompositionLayout,
  frameFromRect,
  containedRect,
  compositionRect,
} from "@widgetizer/core/composition";
import { compositionAdapters, compositionImageRect } from "@widgetizer/core/compositionImage";
import { transformRect, imageReference } from "@widgetizer/core/imageTransform";
import usePageStore from "../stores/pageStore";
import useWidgetStore from "../stores/widgetStore";
import useAutoSave from "../stores/saveStore";
import useToastStore from "../stores/toastStore";

export function compositionInteractionContext() {
  const state = usePageStore.getState();
  return JSON.stringify([state.loadedProjectId, state.page?.id, useWidgetStore.getState().compositionContext]);
}

export function rotateCompositionImage(widgetId, angle) {
  if (typeof angle !== "number" || !Number.isFinite(angle) || Math.abs(angle) > 360000) return false;
  const found = compositionFor(usePageStore.getState().page, widgetId);
  if (!found) return false;
  const frame = found[1].placements[widgetId].frames.desktop;
  const rotation = normalizeAngle(angle);
  if ((frame.rotation || 0) === rotation) return false;
  return applyCompositionGeometry(widgetId, { frame: { ...frame, rotation }, startFrame: frame });
}
export function setCompositionRotationPivot(widgetId, pivot) {
  if (!validRotationPivot(pivot)) return false;
  const page = usePageStore.getState().page, found = compositionFor(page, widgetId);
  const geometry = useWidgetStore.getState().imageGeometry[widgetId];
  if (!found || !geometry) return false;
  const frame = found[1].placements[widgetId].frames.desktop, previous = frame.rotationPivot || centerRotationPivot;
  if (previous.x === pivot.x && previous.y === pivot.y) return false;
  const width = found[1].profiles.desktop.referenceWidthPx;
  const size = transformRect(page.widgets[widgetId].settings.image_transform, geometry);
  const rect = rebaseRotationPivot(compositionRect(frame, size.width, size.height, width), frame.rotation || 0, previous, pivot);
  return applyCompositionGeometry(widgetId, { startFrame: frame, frame: { ...frame,
    x: (rect.left + frame.pivot.x * rect.width) / width,
    y: (rect.top + frame.pivot.y * rect.height) / width, rotationPivot: { ...pivot } } });
}

// Interaction locks survive preview replacement and selection/context changes,
// but never enter page content, history, or export.
function movementLockScope() {
  const state = usePageStore.getState();
  return JSON.stringify([state.loadedProjectId, state.page?.id]);
}
export function getCompositionMovementLocks() {
  const page = usePageStore.getState().page;
  const locks = useWidgetStore.getState().compositionMovementLocks[movementLockScope()] || {};
  return Object.fromEntries(Object.entries(locks).filter(([id, area]) => compositionFor(page, id)?.[0] === area));
}
export function pruneCompositionMovementLocks() {
  const state = useWidgetStore.getState(), key = movementLockScope(), valid = getCompositionMovementLocks();
  if (JSON.stringify(state.compositionMovementLocks[key] || {}) !== JSON.stringify(valid))
    useWidgetStore.setState({ compositionMovementLocks: { ...state.compositionMovementLocks, [key]: valid } });
  return valid;
}
export function handleCompositionLockMessage(event, iframe, origin) {
  if (!iframe || origin === "*" || event.source !== iframe || event.origin !== origin || event.data?.type !== "COMPOSITION_LOCK") return false;
  const p = event.data.payload, state = useWidgetStore.getState();
  const found = compositionFor(usePageStore.getState().page, p?.widgetId);
  if (!p || typeof p.locked !== "boolean" || p.interactionContext !== compositionInteractionContext() ||
      state.compositionContext !== "desktop" || state.selectedWidgetId !== p.widgetId || state.selectedBlockId ||
      !found || found[0] !== p.compositionId) return false;
  const locks = getCompositionMovementLocks();
  if (p.locked) locks[p.widgetId] = found[0]; else delete locks[p.widgetId];
  useWidgetStore.setState({ compositionMovementLocks: { ...state.compositionMovementLocks, [movementLockScope()]: locks } });
  return true;
}

export function commitCompositionPage(next) {
  const store = usePageStore.getState();
  validateCompositionLayout(next, compositionAdapters);
  for (const c of Object.values(next.layout?.compositions || {}))
    for (const id of c.childrenOrder) {
      const ref = useWidgetStore.getState().imageGeometry[id];
      if (!ref) continue;
      const basis = imageReference(c.profiles.desktop.referenceWidthPx, ref.naturalWidth, ref.naturalHeight);
      const size = transformRect(next.widgets[id].settings.image_transform, basis);
      if (
        !containedRect(
          compositionRect(c.placements[id].frames.desktop, size.width, size.height, basis.containerWidth),
          basis.containerWidth,
          c.profiles.desktop.height.valuePx,
          c.placements[id].frames.desktop.rotation, c.placements[id].frames.desktop.rotationPivot,
        )
      )
        throw new Error("Image exceeds the Composition Area. Increase its height or resize the image first.");
    }
  if (JSON.stringify(store.page) === JSON.stringify(next)) return false;
  store.beginHistoryStep();
  store.setPage(next);
  pruneCompositionMovementLocks();
  store.beginHistoryStep();
  useAutoSave.getState().setStructureModified(true);
  return true;
}
export function convertImages(ids, height = 1000) {
  if (useWidgetStore.getState().compositionContext !== "desktop")
    throw new Error("Switch to Desktop to create a Composition Area.");
  const { page } = usePageStore.getState(),
    { schemas } = useWidgetStore.getState();
  if (ids.some((id) => schemas[page.widgets[id]?.type]?.compositionCapability !== "image.v1"))
    throw new Error("Update the project's approved image theme files before conversion.");
  const width = 1200,
    frames = {};
  const c = { profiles: { desktop: { referenceWidthPx: width, height: { valuePx: height } } } };
  for (const [i, id] of ids.entries()) {
    const w = page.widgets[id];
    if (useWidgetStore.getState().imageGeometry[id]?.hasCaption)
      throw new Error("Images with media captions are not supported inside Composition Areas yet.");
    if (!compositionAdapters[w?.type]?.supports(w))
      throw new Error("Only v2 Arch Images without captions are supported in this milestone.");
    const geometry = useWidgetStore.getState().imageGeometry[id];
    const size = compositionImageRect(
      w,
      c,
      { x: 0, y: 0, pivot: { x: 0, y: 0 } },
      geometry?.naturalWidth,
      geometry?.naturalHeight,
    );
    if (size.height > height) throw new Error("Increase the Composition Area height before converting this image.");
    const rect = { ...size, left: Math.min(40 * i, width - size.width), top: Math.min(40 * i, height - size.height) };
    frames[id] = frameFromRect(rect, { x: 0, y: 0 }, width);
  }
  return commitCompositionPage(
    createComposition(page, `composition_${crypto.randomUUID()}`, ids, frames, width, height),
  );
}
export function layerImage(id, direction) {
  return commitCompositionPage(changeStack(usePageStore.getState().page, id, direction));
}
export function returnCompositionToFlow(id) {
  if (usePageStore.getState().page?.wyrmetizerEditorLayout) return switchPairedCompositionMode(id, "flow");
  return commitCompositionPage(dissolveComposition(usePageStore.getState().page, id));
}
export function switchPairedCompositionMode(id, mode) {
  const store = usePageStore.getState();
  const canonical = serializeWyrmetizerEditorPage(store.page, compositionAdapters);
  const next = switchWyrmetizerMode(canonical, id, mode, compositionAdapters);
  if (next === canonical) return false;
  store.beginHistoryStep(); store.setPage(next); store.beginHistoryStep();
  useAutoSave.getState().setStructureModified(true);
  return true;
}
export function reorderContentBlock(widgetId, direction) {
  const { page } = usePageStore.getState();
  if (!page?.layout || !["up", "down"].includes(direction)) return false;
  if (compositionFor(page, widgetId)) return false;
  const id = widgetId;
  const order = page.layout.contentOrder,
    index = order.findIndex((entry) => entry.id === id),
    nextIndex = index + (direction === "up" ? -1 : 1);
  if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return false;
  const next = structuredClone(page);
  [next.layout.contentOrder[index], next.layout.contentOrder[nextIndex]] = [
    next.layout.contentOrder[nextIndex],
    next.layout.contentOrder[index],
  ];
  next.widgetsOrder = next.layout.contentOrder.flatMap((entry) =>
    entry.kind === "widget" ? [entry.id] : next.layout.compositions[entry.id].childrenOrder,
  );
  return commitCompositionPage(next);
}

export function applyCompositionGeometry(widgetId, { frame, startFrame, transform, startTransform, alignment } = {}, additionalSettings = {}) {
  const { page } = usePageStore.getState(),
    store = useWidgetStore.getState();
  const found = compositionFor(page, widgetId);
  if (!found || store.compositionContext !== "desktop") return false;
  const [id, c] = found,
    p = c.placements[widgetId],
    previous = page.widgets[widgetId].settings.image_transform;
  if (startFrame && JSON.stringify(startFrame) !== JSON.stringify(p.frames.desktop)) return false;
  if (startTransform && JSON.stringify(startTransform) !== JSON.stringify(previous)) return false;
  const next = structuredClone(page),
    target = next.layout.compositions[id].placements[widgetId];
  if (transform) next.widgets[widgetId].settings.image_transform = transform;
  if (typeof additionalSettings.fullwidth === "boolean") next.widgets[widgetId].settings.fullwidth = additionalSettings.fullwidth;
  target.frames.desktop = frame || target.frames.desktop;
  if (target.frames.desktop.rotationPivot !== undefined) target.version = 3;
  else if (target.frames.desktop.rotation !== undefined) target.version = 2;
  try {
    validateCompositionLayout(next, compositionAdapters);
  } catch {
    return false;
  }
  const geometry = store.imageGeometry[widgetId];
  if (!geometry) return false;
  const size = transformRect(transform || previous, geometry);
  if (alignment) {
    const pivot = alignment === "left" ? 0 : alignment === "right" ? 1 : 0.5;
    target.frames.desktop = { ...target.frames.desktop, x: pivot, pivot: { ...target.frames.desktop.pivot, x: pivot } };
  }
  const width = c.profiles.desktop.referenceWidthPx,
    height = c.profiles.desktop.height.valuePx;
  let rect = compositionRect(target.frames.desktop, size.width, size.height, width);
  if (!frame) {
    rect = {
      ...rect,
      left: Math.max(0, Math.min(width - rect.width, rect.left)),
      top: Math.max(0, Math.min(height - rect.height, rect.top)),
    };
    target.frames.desktop = { ...target.frames.desktop, ...frameFromRect(rect, target.frames.desktop.pivot, width) };
  }
  if (!containedRect(rect, width, height, target.frames.desktop.rotation, target.frames.desktop.rotationPivot)) {
    useToastStore.getState().showToast("Image exceeds the Composition Area. Increase its height or resize the image first.", "error");
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("widgetizer:composition-reconcile"));
    return false;
  }
  try {
    return commitCompositionPage(next);
  } catch {
    return false;
  }
}
export function handleCompositionMessage(event, iframe, origin) {
  if (
    !iframe ||
    event.source !== iframe ||
    origin === "*" ||
    event.origin !== origin ||
    !["COMPOSITION_MOVE", "COMPOSITION_ROTATE", "COMPOSITION_PIVOT"].includes(event.data?.type)
  )
    return false;
  const p = event.data.payload,
    store = useWidgetStore.getState();
  const found = compositionFor(usePageStore.getState().page, p?.widgetId);
  if (
    !p ||
    p.interactionContext !== compositionInteractionContext() ||
    store.selectedWidgetId !== p.widgetId ||
    store.selectedBlockId ||
    (event.data.type === "COMPOSITION_MOVE" && getCompositionMovementLocks()[p.widgetId]) ||
    !found ||
    found[0] !== p.compositionId
  )
    return false;
  const current = usePageStore.getState().page;
  const original = found[1].placements[p.widgetId].frames.desktop;
  if (event.data.type === "COMPOSITION_PIVOT") {
    if (p.startRevision !== compositionRevision(current.widgets[p.widgetId], original) ||
        JSON.stringify(p.startFrame) !== JSON.stringify(original)) return false;
    return setCompositionRotationPivot(p.widgetId, p.rotationPivot);
  }
  // Each bridge authorizes only its own geometry channel.
  if (event.data.type === "COMPOSITION_ROTATE") {
    if (!p.frame || !Number.isFinite(p.frame.rotation) ||
        JSON.stringify({ ...p.frame, rotation: undefined }) !== JSON.stringify({ ...original, rotation: undefined })) return false;
  } else if ((p.frame?.rotation || 0) !== (original.rotation || 0) ||
      JSON.stringify(p.frame?.rotationPivot) !== JSON.stringify(original.rotationPivot)) return false;
  if (
    p.startRevision !== compositionRevision(current.widgets[p.widgetId], found[1].placements[p.widgetId].frames.desktop)
  )
    return false;
  return applyCompositionGeometry(p.widgetId, { frame: p.frame, startFrame: p.startFrame });
}

export function handleOrderingMessage(event, iframe, origin) {
  if (!iframe || origin === "*" || event.source !== iframe || event.origin !== origin || event.data?.type !== "ORDER_SELECTION") return false;
  const state = useWidgetStore.getState(), pageStore = usePageStore.getState(), p = event.data.payload;
  const control = orderingControls(pageStore.page, { compositionId: state.selectedCompositionId, widgetId: state.selectedWidgetId });
  if (!p || !control || state.selectedBlockId || control.scope !== p.scope || control.id !== p.id || !["up", "down"].includes(p.direction) || !control[p.direction]) return false;
  if (control.scope === "image") return layerImage(control.id, p.direction === "up" ? "forward" : "backward");
  if (pageStore.page.layout) return reorderContentBlock(control.id, p.direction);
  const order = [...pageStore.page.widgetsOrder], i = order.indexOf(control.id), j = i + (p.direction === "up" ? -1 : 1);
  [order[i], order[j]] = [order[j], order[i]];
  pageStore.beginHistoryStep(); state.reorderWidgets(order); pageStore.beginHistoryStep(); return true;
}
