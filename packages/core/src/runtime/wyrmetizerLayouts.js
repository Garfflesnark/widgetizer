import { createComposition, validateCompositionLayout } from "./composition.js";

export const imagePresentationKeys = Object.freeze([
  "image_transform", "fullwidth", "image_width_percent", "image_height_px",
  "top_spacing", "top_spacing_px", "bottom_spacing", "bottom_spacing_px",
]);
const clone = value => structuredClone(value);
const fail = message => { throw new Error(`Composition layout (Wyrmetizer): ${message}`); };
const record = value => value && typeof value === "object" && !Array.isArray(value);
const sameMembers = (a, b) => Array.isArray(a) && new Set(a).size === a.length &&
  a.length === b.length && a.every(id => b.includes(id));
function splitWidget(widget) {
  const content = clone(widget), presentation = {};
  for (const key of imagePresentationKeys) {
    if (Object.hasOwn(content.settings || {}, key)) {
      presentation[key] = content.settings[key];
      delete content.settings[key];
    }
  }
  return { content, presentation };
}
function presented(widget, presentation) {
  return { ...clone(widget), settings: { ...clone(widget.settings || {}), ...clone(presentation) } };
}

// Only creation entry points call this; opening an existing page never upgrades it.
export function initializeWyrmetizerPage(page, adapters) {
  if (page.layout?.version === 1 && Object.keys(page.layout.compositions).length)
    return createWyrmetizerCopy(page, adapters);
  if (page.layout != null && page.layout.version !== 1) {
    validateWyrmetizerPage(page, adapters);
    return page;
  }
  const next = clone(page);
  next.widgetsOrder ??= Object.keys(next.widgets || {});
  next.layout = { version: 2, areas: {}, contentOrder: next.widgetsOrder.map(id => ({ kind: "widget", id })) };
  validateWyrmetizerPage(next, adapters);
  return next;
}

export function createWyrmetizerComposition(page, areaId, ids, frames, width, height, adapters) {
  validateWyrmetizerPage(page, adapters);
  if (Object.hasOwn(page.layout.areas, areaId)) fail("Area already exists");
  if (ids.some(id => Object.values(page.layout.areas).some(area => area.members.includes(id))))
    fail("member already has a paired arrangement");
  const projected = createComposition(resolveWyrmetizerPage(page), areaId, ids, frames, width, height);
  const next = clone(page), presentation = {};
  for (const id of ids) {
    const split = splitWidget(page.widgets[id]);
    next.widgets[id] = split.content;
    presentation[id] = split.presentation;
    for (const area of Object.values(next.layout.areas)) if (area.detached) delete area.detached[id];
  }
  const order = next.layout.contentOrder;
  const first = order.findIndex(entry => entry.kind === "widget" && ids.includes(entry.id));
  next.layout.contentOrder = order.filter(entry => entry.kind !== "widget" || !ids.includes(entry.id));
  next.layout.contentOrder.splice(first, 0, { kind: "area", id: areaId });
  next.layout.areas[areaId] = { version: 1, activeMode: "composition", members: [...ids],
    flow: { order: page.widgetsOrder.filter(id => ids.includes(id)), presentation: clone(presentation) },
    composition: { geometry: clone(projected.layout.compositions[areaId]), presentation: clone(presentation) } };
  next.widgetsOrder = resolveWyrmetizerPage(next).widgetsOrder;
  validateWyrmetizerPage(next, adapters);
  return next;
}

export function createEmptyWyrmetizerComposition(page, areaId, adapters, {
  index = page.layout?.contentOrder?.length, width = 1200, height = 800,
} = {}) {
  validateWyrmetizerPage(page, adapters);
  if (Object.hasOwn(page.layout.areas, areaId)) fail("Area already exists");
  if (!Number.isSafeInteger(index) || index < 0 || index > page.layout.contentOrder.length)
    fail("invalid Area position");
  const next = clone(page);
  next.layout.areas[areaId] = { version: 1, activeMode: "composition", members: [],
    flow: { order: [], presentation: {} },
    composition: { presentation: {}, geometry: {
      version: 1, type: "composition-area", childrenOrder: [], stackOrder: [],
      responsive: { defaultMode: "proportional" },
      profiles: { desktop: { referenceWidthPx: width, height: { mode: "explicit", valuePx: height }, overflow: "clip" } },
      placements: {},
    } } };
  next.layout.contentOrder.splice(index, 0, { kind: "area", id: areaId });
  next.widgetsOrder = resolveWyrmetizerPage(next).widgetsOrder;
  validateWyrmetizerPage(next, adapters);
  return next;
}

export function deleteWyrmetizerComposition(page, areaId, adapters) {
  validateWyrmetizerPage(page, adapters);
  if (!Object.hasOwn(page.layout.areas, areaId)) return page;
  const next = clone(page), area = next.layout.areas[areaId];
  for (const id of area.members) next.widgets[id] = presented(page.widgets[id], area.flow.presentation[id]);
  next.layout.contentOrder = next.layout.contentOrder.flatMap(entry =>
    entry.kind === "area" && entry.id === areaId ? area.flow.order.map(id => ({ kind: "widget", id })) : [entry]);
  delete next.layout.areas[areaId];
  next.widgetsOrder = resolveWyrmetizerPage(next).widgetsOrder;
  validateWyrmetizerPage(next, adapters);
  return next;
}

// The resolver is a disposable adapter for existing renderers, never persisted.
// Canonical member Widgets contain content; each arrangement owns presentation.
export function resolveWyrmetizerPage(page) {
  if (page.layout?.version !== 2) return page;
  const next = clone(page), contentOrder = [], compositions = {};
  for (const entry of page.layout.contentOrder) {
    if (entry.kind === "widget") { contentOrder.push(clone(entry)); continue; }
    const area = page.layout.areas[entry.id], mode = area.activeMode;
    for (const id of area.members) next.widgets[id] = presented(page.widgets[id], area[mode].presentation[id]);
    if (mode === "flow" && area.members.length) contentOrder.push(...area.flow.order.map(id => ({ kind: "widget", id })));
    else {
      contentOrder.push({ kind: "composition", id: entry.id });
      compositions[entry.id] = clone(area.composition.geometry);
    }
  }
  next.layout = { version: 1, contentOrder, compositions };
  next.widgetsOrder = contentOrder.flatMap(entry => entry.kind === "widget" ? [entry.id] : compositions[entry.id].childrenOrder);
  return next;
}

// This editor-only projection lets established controls keep their view model.
// Serialization removes it and routes presentation back to its single owner.
export function openWyrmetizerEditorPage(page, adapters) {
  if (page.layout?.version !== 2) return page;
  validateWyrmetizerPage(page, adapters);
  return { ...resolveWyrmetizerPage(page), wyrmetizerEditorLayout: clone(page.layout) };
}

export function serializeWyrmetizerEditorPage(page, adapters) {
  if (!page?.wyrmetizerEditorLayout) return page;
  const next = clone(page), layout = next.wyrmetizerEditorLayout;
  delete next.wyrmetizerEditorLayout;
  for (const [areaId, area] of Object.entries(layout.areas)) {
    for (const id of area.members) {
      if (!page.widgets[id]) fail("membership changes require an atomic Area operation");
      const split = splitWidget(page.widgets[id]);
      next.widgets[id] = split.content;
      area[area.activeMode].presentation[id] = split.presentation;
    }
    if (area.activeMode === "composition") {
      const geometry = page.layout?.compositions?.[areaId];
      if (!geometry) fail("use mode switching to preserve the paired arrangement");
      area.composition.geometry = clone(geometry);
    } else {
      area.flow.order = page.widgetsOrder.filter(id => area.members.includes(id));
    }
  }
  next.layout = layout;
  const members = new Set(Object.values(layout.areas).flatMap(area => area.members));
  const listed = new Set(layout.contentOrder.filter(entry => entry.kind === "widget").map(entry => entry.id));
  for (const id of page.widgetsOrder) if (!members.has(id) && !listed.has(id)) layout.contentOrder.push({ kind: "widget", id });
  const rank = entry => entry.kind === "widget" ? page.widgetsOrder.indexOf(entry.id) :
    Math.min(...layout.areas[entry.id].members.map(id => page.widgetsOrder.indexOf(id)));
  const emptyArea = entry => entry.kind === "area" && !layout.areas[entry.id].members.length;
  const ordered = layout.contentOrder.filter(entry => !emptyArea(entry)).sort((a, b) => rank(a) - rank(b));
  layout.contentOrder = layout.contentOrder.map(entry => emptyArea(entry) ? entry : ordered.shift());
  next.widgetsOrder = resolveWyrmetizerPage(next).widgetsOrder;
  validateWyrmetizerPage(next, adapters);
  return next;
}

export function validateWyrmetizerPage(page, adapters) {
  const layout = page.layout;
  if (layout?.version !== 2 || !record(layout.areas) || !Array.isArray(layout.contentOrder)) fail("unsupported envelope");
  if (Object.keys(layout.areas).length > 20) fail("too many Areas");
  const owners = new Set(), areaIds = [];
  for (const entry of layout.contentOrder) {
    if (entry.kind === "widget") {
      if (!page.widgets?.[entry.id] || owners.has(entry.id)) fail("invalid Widget ownership");
      owners.add(entry.id); continue;
    }
    if (entry.kind !== "area" || areaIds.includes(entry.id)) fail("invalid Area order");
    areaIds.push(entry.id);
    const area = layout.areas[entry.id];
    if (area?.version !== 1 || !["flow", "composition"].includes(area.activeMode) ||
        !Array.isArray(area.members) || !sameMembers(area.members, area.members)) fail("invalid Area");
    if (!sameMembers(area.flow?.order, area.members) ||
        !sameMembers(area.composition?.geometry?.childrenOrder, area.members)) fail("inconsistent membership");
    for (const mode of ["flow", "composition"]) {
      const values = area[mode]?.presentation;
      if (!record(values) || !sameMembers(Object.keys(values), area.members)) fail("invalid presentation membership");
      for (const id of area.members) {
        if (!record(values[id]) || Object.keys(values[id]).some(key => !imagePresentationKeys.includes(key))) fail("content in presentation");
      }
    }
    for (const id of area.members) {
      const widget = page.widgets?.[id];
      if (!widget || owners.has(id)) fail("duplicate or missing Widget");
      if (imagePresentationKeys.some(key => Object.hasOwn(widget.settings || {}, key))) fail("competing presentation ownership");
      owners.add(id);
      for (const mode of ["flow", "composition"])
        if (!adapters[widget.type]?.supports(presented(widget, area[mode].presentation[id]))) fail("unsupported member");
    }
    if (area.detached !== undefined) {
      if (!record(area.detached)) fail("invalid restoration records");
      for (const [id, saved] of Object.entries(area.detached)) {
        if (!page.widgets[id] || !layout.contentOrder.some(entry => entry.kind === "widget" && entry.id === id) ||
            !record(saved) || typeof saved.source !== "string" || !record(saved.presentation) ||
            Object.keys(saved.presentation).some(key => !imagePresentationKeys.includes(key)) ||
            [saved.flowIndex, saved.readingIndex, saved.stackIndex].some(index => !Number.isSafeInteger(index) || index < 0)) fail("invalid restoration record");
        validateCompositionLayout({ widgets: { [id]: presented({ type: "image", settings: { image: saved.source } }, saved.presentation) }, widgetsOrder: [id],
          layout: { version: 1, contentOrder: [{ kind: "composition", id: entry.id }], compositions: { [entry.id]: saved.geometry } } }, adapters);
      }
    }
  }
  if (!sameMembers(areaIds, Object.keys(layout.areas)) || owners.size !== Object.keys(page.widgets || {}).length) fail("orphan ownership");
  // Validate inactive composition geometry too, without including it in active rendering.
  const allComposition = clone(page);
  for (const area of Object.values(allComposition.layout.areas)) area.activeMode = "composition";
  validateCompositionLayout(resolveWyrmetizerPage(allComposition), adapters, { allowEmptyAreas: true });
  const active = resolveWyrmetizerPage(page);
  validateCompositionLayout(active, adapters, { allowEmptyAreas: true });
  if (JSON.stringify(active.widgetsOrder) !== JSON.stringify(page.widgetsOrder)) fail("order projection differs");
}

export function createWyrmetizerCopy(page, adapters) {
  validateCompositionLayout(page, adapters);
  if (page.layout == null || (page.layout.version === 1 && !Object.keys(page.layout.compositions).length))
    return initializeWyrmetizerPage(page, adapters);
  if (page.layout.version !== 1) fail("no supported Composition to initialize");
  const next = clone(page), areas = {};
  for (const [id, geometry] of Object.entries(page.layout.compositions)) {
    const presentation = {};
    for (const child of geometry.childrenOrder) {
      const split = splitWidget(page.widgets[child]);
      next.widgets[child] = split.content;
      presentation[child] = split.presentation;
    }
    areas[id] = { version: 1, activeMode: "composition", members: [...geometry.childrenOrder],
      flow: { order: [...geometry.childrenOrder], presentation: clone(presentation) },
      composition: { geometry: clone(geometry), presentation: clone(presentation) } };
  }
  next.layout = { version: 2, areas, contentOrder: page.layout.contentOrder.map(entry =>
    entry.kind === "composition" ? { kind: "area", id: entry.id } : clone(entry)) };
  validateWyrmetizerPage(next, adapters);
  return next;
}

export function switchWyrmetizerMode(page, areaId, mode, adapters) {
  validateWyrmetizerPage(page, adapters);
  const area = page.layout.areas[areaId];
  if (!area || !["flow", "composition"].includes(mode)) fail("unknown mode or Area");
  if (area.activeMode === mode) return page;
  const next = clone(page);
  next.layout.areas[areaId].activeMode = mode;
  next.widgetsOrder = resolveWyrmetizerPage(next).widgetsOrder;
  validateWyrmetizerPage(next, adapters);
  return next;
}

export function includeWyrmetizerWidgets(page, areaId, ids, frames, adapters, canRestore = (_id, saved, geometry) =>
  geometry.profiles.desktop.referenceWidthPx === saved.geometry.profiles.desktop.referenceWidthPx &&
  geometry.profiles.desktop.height.valuePx >= saved.geometry.profiles.desktop.height.valuePx) {
  validateWyrmetizerPage(page, adapters);
  if (!page.layout.areas[areaId] || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length ||
      ids.some(id => !page.widgets[id] || Object.values(page.layout.areas).some(area => area.members.includes(id))))
    fail("invalid existing Widget membership");
  const next = clone(page), area = next.layout.areas[areaId], geometry = area.composition.geometry;
  const insertIndex = (saved, key, order) => Math.max(0, Math.min(order.length, saved[key] -
    Object.values(area.detached || {}).filter(value => value[key] < saved[key]).length));
  for (const id of ids) {
    const split = splitWidget(page.widgets[id]);
    const saved = area.detached?.[id];
    const restore = saved && saved.source === page.widgets[id].settings.image &&
      adapters[page.widgets[id].type]?.supports(presented(page.widgets[id], saved.presentation)) && canRestore(id, saved, geometry);
    next.widgets[id] = split.content;
    area.members.push(id);
    area.flow.order.splice(restore ? insertIndex(saved, "flowIndex", area.flow.order) : area.flow.order.length, 0, id);
    area.flow.presentation[id] = clone(split.presentation);
    area.composition.presentation[id] = clone(restore ? saved.presentation : split.presentation);
    geometry.childrenOrder.splice(restore ? insertIndex(saved, "readingIndex", geometry.childrenOrder) : geometry.childrenOrder.length, 0, id);
    geometry.stackOrder.splice(restore ? insertIndex(saved, "stackIndex", geometry.stackOrder) : geometry.stackOrder.length, 0, id);
    geometry.placements[id] = restore ? clone(saved.geometry.placements[id]) :
      { version: 1, responsive: { mode: "inherit" }, frames: { desktop: clone(frames[id]) } };
    for (const other of Object.values(next.layout.areas)) if (other.detached) delete other.detached[id];
  }
  next.layout.contentOrder = next.layout.contentOrder.filter(entry => entry.kind !== "widget" || !ids.includes(entry.id));
  next.widgetsOrder = resolveWyrmetizerPage(next).widgetsOrder;
  validateWyrmetizerPage(next, adapters);
  return next;
}

export function removeWyrmetizerWidget(page, areaId, id, adapters) {
  validateWyrmetizerPage(page, adapters);
  if (!page.layout.areas[areaId]?.members.includes(id)) fail("Widget is not a member of this Area");
  const next = clone(page), area = next.layout.areas[areaId], geometry = area.composition.geometry;
  const savedGeometry = clone(geometry);
  savedGeometry.childrenOrder = [id]; savedGeometry.stackOrder = [id];
  savedGeometry.placements = { [id]: clone(geometry.placements[id]) };
  area.detached ??= {};
  const originalIndex = (key, index) => {
    for (const value of Object.values(area.detached).sort((a, b) => a[key] - b[key])) if (value[key] <= index) index++;
    return index;
  };
  area.detached[id] = { source: page.widgets[id].settings.image, geometry: savedGeometry,
    presentation: clone(area.composition.presentation[id]), flowIndex: originalIndex("flowIndex", area.flow.order.indexOf(id)),
    readingIndex: originalIndex("readingIndex", geometry.childrenOrder.indexOf(id)), stackIndex: originalIndex("stackIndex", geometry.stackOrder.indexOf(id)) };
  next.widgets[id] = presented(page.widgets[id], area.flow.presentation[id]);
  area.members = area.members.filter(value => value !== id);
  area.flow.order = area.flow.order.filter(value => value !== id);
  delete area.flow.presentation[id]; delete area.composition.presentation[id];
  geometry.childrenOrder = geometry.childrenOrder.filter(value => value !== id);
  geometry.stackOrder = geometry.stackOrder.filter(value => value !== id);
  delete geometry.placements[id];
  let index = next.layout.contentOrder.findIndex(entry => entry.kind === "area" && entry.id === areaId) + 1;
  while (next.layout.contentOrder[index]?.kind === "widget" &&
      area.detached[next.layout.contentOrder[index].id]?.flowIndex < area.detached[id].flowIndex) index++;
  next.layout.contentOrder.splice(index, 0, { kind: "widget", id });
  next.widgetsOrder = resolveWyrmetizerPage(next).widgetsOrder;
  validateWyrmetizerPage(next, adapters);
  return next;
}

export function editWyrmetizerWidget(page, id, settings, adapters) {
  validateWyrmetizerPage(page, adapters);
  if (!record(settings) || !page.widgets[id]) fail("invalid edit");
  const next = clone(page), area = Object.values(next.layout.areas).find(value => value.members.includes(id));
  for (const [key, value] of Object.entries(settings)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) fail("invalid setting key");
    const target = area && imagePresentationKeys.includes(key) ? area[area.activeMode].presentation[id] : next.widgets[id].settings;
    if (value === undefined) delete target[key]; else target[key] = clone(value);
  }
  validateWyrmetizerPage(next, adapters);
  return JSON.stringify(next) === JSON.stringify(page) ? page : next;
}

export function duplicateWyrmetizerWidget(page, sourceId, newId, adapters) {
  validateWyrmetizerPage(page, adapters);
  if (Object.hasOwn(page.widgets, newId)) fail("Widget ID already exists");
  const next = clone(page), area = Object.values(next.layout.areas).find(value => value.members.includes(sourceId));
  if (!area) fail("source is not an Area member");
  next.widgets[newId] = clone(next.widgets[sourceId]);
  area.members.push(newId);
  for (const mode of ["flow", "composition"]) area[mode].presentation[newId] = clone(area[mode].presentation[sourceId]);
  area.flow.order.splice(area.flow.order.indexOf(sourceId) + 1, 0, newId);
  const geometry = area.composition.geometry;
  geometry.childrenOrder.splice(geometry.childrenOrder.indexOf(sourceId) + 1, 0, newId);
  geometry.stackOrder.push(newId);
  // Overlap is deterministic and cannot displace existing authored children.
  geometry.placements[newId] = clone(geometry.placements[sourceId]);
  next.widgetsOrder = resolveWyrmetizerPage(next).widgetsOrder;
  validateWyrmetizerPage(next, adapters);
  return next;
}

export function addWyrmetizerWidget(page, areaId, id, widget, adapters) {
  validateWyrmetizerPage(page, adapters);
  if (Object.hasOwn(page.widgets, id) || !page.layout.areas[areaId]) fail("invalid add target");
  const next = clone(page), area = next.layout.areas[areaId], split = splitWidget(widget);
  next.widgets[id] = split.content;
  area.members.push(id); area.flow.order.push(id);
  area.flow.presentation[id] = clone(split.presentation);
  area.composition.presentation[id] = clone(split.presentation);
  const geometry = area.composition.geometry;
  geometry.childrenOrder.push(id); geometry.stackOrder.push(id);
  geometry.placements[id] = { version: 1, responsive: { mode: "inherit" },
    frames: { desktop: { x: 0, y: 0, pivot: { x: 0, y: 0 } } } };
  next.widgetsOrder = resolveWyrmetizerPage(next).widgetsOrder;
  validateWyrmetizerPage(next, adapters);
  return next;
}

export function reorderWyrmetizerFlow(page, areaId, order, adapters) {
  validateWyrmetizerPage(page, adapters);
  const area = page.layout.areas[areaId];
  if (!area || area.activeMode !== "flow" || !sameMembers(order, area.members)) fail("invalid Flow order");
  if (JSON.stringify(order) === JSON.stringify(area.flow.order)) return page;
  const next = clone(page);
  next.layout.areas[areaId].flow.order = [...order];
  next.widgetsOrder = resolveWyrmetizerPage(next).widgetsOrder;
  validateWyrmetizerPage(next, adapters);
  return next;
}

export function deleteWyrmetizerWidget(page, id, adapters) {
  validateWyrmetizerPage(page, adapters);
  if (!Object.hasOwn(page.widgets, id)) return page;
  const next = clone(page);
  delete next.widgets[id];
  next.layout.contentOrder = next.layout.contentOrder.filter(entry => entry.kind !== "widget" || entry.id !== id);
  for (const area of Object.values(next.layout.areas)) {
    if (area.detached) delete area.detached[id];
    if (!area.members.includes(id)) continue;
    area.members = area.members.filter(value => value !== id);
    area.flow.order = area.flow.order.filter(value => value !== id);
    delete area.flow.presentation[id]; delete area.composition.presentation[id];
    const geometry = area.composition.geometry;
    geometry.childrenOrder = geometry.childrenOrder.filter(value => value !== id);
    geometry.stackOrder = geometry.stackOrder.filter(value => value !== id);
    delete geometry.placements[id];
  }
  next.widgetsOrder = resolveWyrmetizerPage(next).widgetsOrder;
  validateWyrmetizerPage(next, adapters);
  return next;
}
