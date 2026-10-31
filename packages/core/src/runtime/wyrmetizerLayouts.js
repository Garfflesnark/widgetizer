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

// The resolver is a disposable adapter for existing renderers, never persisted.
// Canonical member Widgets contain content; each arrangement owns presentation.
export function resolveWyrmetizerPage(page) {
  if (page.layout?.version !== 2) return page;
  const next = clone(page), contentOrder = [], compositions = {};
  for (const entry of page.layout.contentOrder) {
    if (entry.kind === "widget") { contentOrder.push(clone(entry)); continue; }
    const area = page.layout.areas[entry.id], mode = area.activeMode;
    for (const id of area.members) next.widgets[id] = presented(page.widgets[id], area[mode].presentation[id]);
    if (mode === "flow") contentOrder.push(...area.flow.order.map(id => ({ kind: "widget", id })));
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
  layout.contentOrder.sort((a, b) => rank(a) - rank(b));
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
        !Array.isArray(area.members) || !area.members.length || !sameMembers(area.members, area.members)) fail("invalid Area");
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
  }
  if (!sameMembers(areaIds, Object.keys(layout.areas)) || owners.size !== Object.keys(page.widgets || {}).length) fail("orphan ownership");
  // Validate inactive composition geometry too, without including it in active rendering.
  const allComposition = clone(page);
  for (const area of Object.values(allComposition.layout.areas)) area.activeMode = "composition";
  validateCompositionLayout(resolveWyrmetizerPage(allComposition), adapters);
  const active = resolveWyrmetizerPage(page);
  validateCompositionLayout(active, adapters);
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

export function includeWyrmetizerWidgets(page, areaId, ids, frames, adapters) {
  validateWyrmetizerPage(page, adapters);
  if (!page.layout.areas[areaId] || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length ||
      ids.some(id => !page.widgets[id] || Object.values(page.layout.areas).some(area => area.members.includes(id))))
    fail("invalid existing Widget membership");
  const next = clone(page), area = next.layout.areas[areaId], geometry = area.composition.geometry;
  for (const id of ids) {
    const split = splitWidget(page.widgets[id]);
    next.widgets[id] = split.content;
    area.members.push(id);
    area.flow.order.push(id);
    area.flow.presentation[id] = clone(split.presentation);
    area.composition.presentation[id] = clone(split.presentation);
    geometry.childrenOrder.push(id);
    geometry.stackOrder.push(id);
    geometry.placements[id] = { version: 1, responsive: { mode: "inherit" }, frames: { desktop: clone(frames[id]) } };
  }
  next.layout.contentOrder = next.layout.contentOrder.filter(entry => entry.kind !== "widget" || !ids.includes(entry.id));
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
  for (const [areaId, area] of Object.entries(next.layout.areas)) {
    if (!area.members.includes(id)) continue;
    area.members = area.members.filter(value => value !== id);
    area.flow.order = area.flow.order.filter(value => value !== id);
    delete area.flow.presentation[id]; delete area.composition.presentation[id];
    const geometry = area.composition.geometry;
    geometry.childrenOrder = geometry.childrenOrder.filter(value => value !== id);
    geometry.stackOrder = geometry.stackOrder.filter(value => value !== id);
    delete geometry.placements[id];
    if (!area.members.length) {
      delete next.layout.areas[areaId];
      next.layout.contentOrder = next.layout.contentOrder.filter(entry => entry.id !== areaId);
    }
  }
  next.widgetsOrder = resolveWyrmetizerPage(next).widgetsOrder;
  validateWyrmetizerPage(next, adapters);
  return next;
}
