import { rotatedBounds, validRotationPivot } from "./rotationGeometry.js";
import { validateWyrmetizerPage } from "./wyrmetizerLayouts.js";
// Composition membership and ordering are independent of each widget adapter.
const finite = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const idOK = (v) =>
  typeof v === "string" &&
  /^[a-zA-Z0-9_-]{1,128}$/.test(v) &&
  !["__proto__", "constructor", "prototype", "header", "footer"].includes(v);
const fail = (message) => {
  throw new Error(`Composition layout: ${message}`);
};
const unique = (values) => Array.isArray(values) && new Set(values).size === values.length;
export function compositionFor(page, widgetId) {
  return Object.entries(page?.layout?.compositions || {}).find(
    ([, c]) => Array.isArray(c?.childrenOrder) && c.childrenOrder.includes(widgetId),
  );
}
export function compositionRevision(widget, frame) {
  // A revision detects stale gestures; origin/capability validation authorizes
  // them. Publish a compact token rather than a second copy of widget content.
  let hash = 14695981039346656037n;
  for (const char of JSON.stringify([frame, widget]))
    hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0))) * 1099511628211n);
  return hash.toString(16);
}
export function projectContentOrder(layout) {
  return layout.contentOrder.flatMap((entry) =>
    entry.kind === "widget" ? [entry.id] : layout.compositions[entry.id].childrenOrder,
  );
}
export function validateCompositionLayout(page, adapters = {}) {
  if (page.layout === undefined || page.layout === null) return;
  if (page.layout.version === 2) return validateWyrmetizerPage(page, adapters);
  const l = page.layout;
  if (l?.version !== 1) fail("unsupported version");
  if (
    !Array.isArray(l.contentOrder) ||
    !l.compositions ||
    typeof l.compositions !== "object" ||
    Array.isArray(l.compositions)
  )
    fail("invalid content order or Block registry");
  if (Object.keys(l.compositions).length > 20) fail("too many Composition Areas");
  const all = [],
    blocks = [];
  for (const entry of l.contentOrder) {
    if (!idOK(entry?.id)) fail("invalid content ID");
    if (entry.kind === "widget") all.push(entry.id);
    else if (entry.kind === "composition") {
      blocks.push(entry.id);
      const c = l.compositions[entry.id];
      if (c?.version !== 1 || c.type !== "composition-area") fail("unsupported Block");
      if (
        !unique(c.childrenOrder) ||
        !c.childrenOrder.length ||
        !unique(c.stackOrder) ||
        c.stackOrder.length !== c.childrenOrder.length ||
        c.stackOrder.some((id) => !c.childrenOrder.includes(id))
      )
        fail("invalid reading/stack order");
      if (!["proportional", "custom"].includes(c.responsive?.defaultMode))
        fail(
          "this build supports Proportional and uninitialized Custom fallback only; Reflow requires a newer capability",
        );
      if (Object.keys(c.profiles || {}).some((name) => name !== "desktop"))
        fail("responsive profile authoring requires a newer capability");
      const profile = c.profiles?.desktop;
      if (
        !finite(profile?.referenceWidthPx, 320, 10000) ||
        profile.height?.mode !== "explicit" ||
        !finite(profile.height.valuePx, 1, 10000) ||
        profile.overflow !== "clip"
      )
        fail("unsupported canvas bounds");
      if (!c.placements || Object.keys(c.placements).length !== c.childrenOrder.length) fail("invalid placements");
      for (const id of c.childrenOrder) {
        if (!idOK(id)) fail("invalid child ID");
        const widget = page.widgets?.[id];
        const adapter = widget && adapters[widget.type];
        if (!adapter?.supports(widget)) fail(`unsupported child capability: ${id}`);
        const p = c.placements[id],
          f = p?.frames?.desktop;
        if (
          ![1, 2, 3].includes(p?.version) ||
          !["inherit", "proportional", "custom"].includes(p.responsive?.mode) ||
          !f ||
          (f.rotation !== undefined && !finite(f.rotation, -180, 180)) ||
          (f.rotation !== undefined && p.version < 2) ||
          (f.rotationPivot !== undefined && (p.version !== 3 || !validRotationPivot(f.rotationPivot))) ||
          !finite(f.x, p.version === 3 ? -10 : 0, p.version === 3 ? 10 : 1) ||
          !finite(f.y, p.version === 3 ? -10 : 0, p.version === 3 ? 10 : profile.height.valuePx / profile.referenceWidthPx) ||
          !finite(f.pivot?.x, 0, 1) ||
          !finite(f.pivot?.y, 0, 1)
        )
          fail(`unsupported placement: ${id}`);
        if (Object.keys(p.frames).some((name) => name !== "desktop"))
          fail("responsive authoring requires a newer capability");
        adapter.validate?.(widget, c, f);
      }
      all.push(...c.childrenOrder);
    } else fail("unknown content kind");
  }
  if (!unique(blocks) || blocks.length !== Object.keys(l.compositions).length)
    fail("duplicate or orphan Composition Block");
  if (
    !unique(all) ||
    all.some((id) => !idOK(id) || !Object.hasOwn(page.widgets || {}, id)) ||
    all.length !== Object.keys(page.widgets || {}).length
  )
    fail("duplicate, missing or orphan widget membership");
  if (JSON.stringify(projectContentOrder(l)) !== JSON.stringify(page.widgetsOrder))
    fail("legacy order projection differs");
}
export function compositionRect(frame, width, height, referenceWidth) {
  return {
    left: frame.x * referenceWidth - frame.pivot.x * width,
    top: frame.y * referenceWidth - frame.pivot.y * height,
    width,
    height,
  };
}
export function frameFromRect(rect, pivot, referenceWidth) {
  const round = (v) => Math.round(v * 1e6) / 1e6;
  return {
    x: round((rect.left + pivot.x * rect.width) / referenceWidth),
    y: round((rect.top + pivot.y * rect.height) / referenceWidth),
    pivot: { ...pivot },
  };
}
export function containedRect(rect, width, height, rotation = 0, rotationPivot) {
  rect = rotatedBounds(rect, rotation, rotationPivot);
  return (
    rect.width <= width + 0.02 &&
    rect.height <= height + 0.02 &&
    rect.left >= -0.02 &&
    rect.top >= -0.02 &&
    rect.left + rect.width <= width + 0.02 &&
    rect.top + rect.height <= height + 0.02
  );
}
export function changeStack(page, widgetId, direction) {
  const found = compositionFor(page, widgetId);
  if (!found || !["forward", "backward"].includes(direction)) return page;
  const [id, c] = found,
    order = [...c.stackOrder],
    index = order.indexOf(widgetId),
    next = index + (direction === "forward" ? 1 : -1);
  if (next < 0 || next >= order.length) return page;
  [order[index], order[next]] = [order[next], order[index]];
  return {
    ...page,
    layout: { ...page.layout, compositions: { ...page.layout.compositions, [id]: { ...c, stackOrder: order } } },
  };
}
export function createComposition(page, id, children, frames, width = 1200, height = 800) {
  if (
    !idOK(id) ||
    page.layout?.compositions?.[id] ||
    !unique(children) ||
    !children.length ||
    children.some((child) => compositionFor(page, child) || !page.widgets?.[child])
  )
    fail("invalid conversion target");
  const layout = structuredClone(
    page.layout || {
      version: 1,
      contentOrder: page.widgetsOrder.map((id) => ({ kind: "widget", id })),
      compositions: {},
    },
  );
  const first = layout.contentOrder.findIndex((e) => e.kind === "widget" && children.includes(e.id));
  if (first < 0) fail("no flow widgets selected");
  layout.contentOrder = layout.contentOrder.filter((e) => e.kind !== "widget" || !children.includes(e.id));
  layout.contentOrder.splice(first, 0, { kind: "composition", id });
  layout.compositions[id] = {
    version: 1,
    type: "composition-area",
    childrenOrder: [...children],
    stackOrder: [...children],
    responsive: { defaultMode: "proportional" },
    profiles: { desktop: { referenceWidthPx: width, height: { mode: "explicit", valuePx: height }, overflow: "clip" } },
    placements: Object.fromEntries(
      children.map((child) => [
        child,
        { version: 1, responsive: { mode: "inherit" }, frames: { desktop: frames[child] } },
      ]),
    ),
  };
  return { ...page, layout, widgetsOrder: projectContentOrder(layout) };
}
export function dissolveComposition(page, id) {
  const c = page.layout?.compositions[id];
  if (!c) return page;
  const layout = structuredClone(page.layout);
  layout.contentOrder = layout.contentOrder.flatMap((entry) =>
    entry.kind === "composition" && entry.id === id ? c.childrenOrder.map((id) => ({ kind: "widget", id })) : [entry],
  );
  delete layout.compositions[id];
  const next = { ...page, layout, widgetsOrder: projectContentOrder(layout) };
  if (!Object.keys(layout.compositions).length) next.layout = null;
  return next;
}

// Adapt legacy flow CRUD without allowing a child to acquire two owners. New
// widgets/copies enter flow; removing a final child removes its empty Block.
export function reconcileCompositionCrud(page, previous) {
  if (
    !previous?.layout ||
    page.layout !== previous.layout ||
    JSON.stringify(page.widgetsOrder) === JSON.stringify(previous.widgetsOrder)
  )
    return page;
  const layout = structuredClone(page.layout),
    members = new Set();
  for (const [id, c] of Object.entries(layout.compositions)) {
    c.childrenOrder = c.childrenOrder.filter((child) => Object.hasOwn(page.widgets, child));
    c.stackOrder = c.stackOrder.filter((child) => c.childrenOrder.includes(child));
    for (const child of Object.keys(c.placements)) if (!c.childrenOrder.includes(child)) delete c.placements[child];
    if (!c.childrenOrder.length) delete layout.compositions[id];
    else c.childrenOrder.forEach((child) => members.add(child));
  }
  layout.contentOrder = layout.contentOrder.filter((entry) =>
    entry.kind === "widget" ? Object.hasOwn(page.widgets, entry.id) : Object.hasOwn(layout.compositions, entry.id),
  );
  const flow = new Set(layout.contentOrder.filter((e) => e.kind === "widget").map((e) => e.id));
  for (const id of page.widgetsOrder)
    if (!members.has(id) && !flow.has(id)) layout.contentOrder.push({ kind: "widget", id });
  const rank = (entry) =>
    Math.min(
      ...(entry.kind === "widget" ? [entry.id] : layout.compositions[entry.id].childrenOrder).map((id) =>
        page.widgetsOrder.indexOf(id),
      ),
    );
  layout.contentOrder.sort((a, b) => rank(a) - rank(b));
  return { ...page, layout, widgetsOrder: projectContentOrder(layout) };
}
