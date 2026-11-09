import { expect, it } from "vitest";
import { createComposition } from "../composition.js";
import { compositionAdapters } from "../compositionImage.js";
import { defaultImageTransform } from "../imageTransform.js";
import { createWyrmetizerCopy, resolveWyrmetizerPage, switchWyrmetizerMode,
  editWyrmetizerWidget, duplicateWyrmetizerWidget, deleteWyrmetizerWidget, validateWyrmetizerPage,
  addWyrmetizerWidget, reorderWyrmetizerFlow, openWyrmetizerEditorPage, serializeWyrmetizerEditorPage,
  initializeWyrmetizerPage, convertWyrmetizerPageToV3, createWyrmetizerComposition, includeWyrmetizerWidgets, removeWyrmetizerWidget,
  createEmptyWyrmetizerComposition, deleteWyrmetizerComposition,
  copyWyrmetizerComposition, pasteWyrmetizerComposition } from "../wyrmetizerLayouts.js";
import { validateCompositionLayout } from "../composition.js";
import { resolveWyrmetizerPresentation } from "../wyrmetizerPresentation.js";
const adapters = compositionAdapters;
const roundTrip = page => serializeWyrmetizerEditorPage(openWyrmetizerEditorPage(JSON.parse(JSON.stringify(page)), adapters), adapters);
const pairedV3 = () => convertWyrmetizerPageToV3(createWyrmetizerCopy(fixture(), adapters), adapters);
function withStandaloneImages(ids = ["c"]) {
  const page = pairedV3(), resolved = resolveWyrmetizerPage(page);
  page.layout.mobile.areas = { area: { composition: { height: { mode: "custom", valuePx: 400 } } } };
  for (const id of ids) {
    page.widgets[id] = structuredClone(resolved.widgets.a);
    page.widgetsOrder.push(id);
    page.layout.contentOrder.push({ kind: "widget", id });
  }
  return page;
}
const mobileRootOrder = (...entries) => entries.map(([kind, id]) => ({ kind, id }));
it.each(["flow", "composition"])("copies paired content and every authored arrangement independently in %s", mode => {
  let page = duplicateWyrmetizerWidget(createWyrmetizerCopy(fixture(), adapters), "a", "b", adapters);
  page.layout.areas.area.flow.order.reverse();
  page.layout.areas.area.flow.presentation.a.top_spacing_px = 93;
  page.layout.areas.area.flow.presentation.a.image_transform.dimensions.width.value = 173;
  page.layout.areas.area.composition.geometry.stackOrder.reverse();
  page.layout.areas.area.composition.geometry.placements.a.version = 3;
  Object.assign(page.layout.areas.area.composition.geometry.placements.a.frames.desktop,
    { rotation: 30, rotationPivot: { x: 0.2, y: 0.8 } });
  page = switchWyrmetizerMode(page, "area", mode, adapters);
  const before = structuredClone(page), clipboard = copyWyrmetizerComposition(page, "area", adapters);
  const snapshot = structuredClone(clipboard), map = { a: "new_a", b: "new_b" };
  const next = pasteWyrmetizerComposition(page, clipboard, "copy", map, adapters, 0);
  expect(page).toEqual(before);
  expect(clipboard).toEqual(snapshot);
  expect(next.layout.contentOrder[0]).toEqual({ kind: "area", id: "copy" });
  const old = page.layout.areas.area, area = next.layout.areas.copy;
  expect(next.layout.areas.area).toEqual(old);
  expect(area.activeMode).toBe(mode);
  expect(area.members).toEqual(["new_a", "new_b"]);
  expect(area.flow.order).toEqual(["new_b", "new_a"]);
  expect(area.composition.geometry.stackOrder).toEqual(["new_b", "new_a"]);
  for (const id of old.members) {
    expect(next.widgets[map[id]]).toEqual(page.widgets[id]);
    expect(area.flow.presentation[map[id]]).toEqual(old.flow.presentation[id]);
    expect(area.composition.presentation[map[id]]).toEqual(old.composition.presentation[id]);
    expect(area.composition.geometry.placements[map[id]]).toEqual(old.composition.geometry.placements[id]);
  }
  expect(roundTrip(next)).toEqual(next);
  next.widgets.new_a.settings.link = "/independent";
  expect(next.widgets.a.settings.link).toBe("/one");
  expect(clipboard).toEqual(snapshot);
});
it("copies empty Areas and omits detached independent Widgets and their restoration records", () => {
  const page = removeWyrmetizerWidget(createWyrmetizerCopy(fixture(), adapters), "area", "a", adapters);
  const clipboard = copyWyrmetizerComposition(page, "area", adapters);
  expect(clipboard.widgets).toEqual({});
  expect(clipboard.area.detached).toBeUndefined();
  const next = pasteWyrmetizerComposition(page, clipboard, "copy", {}, adapters);
  expect(next.widgets).toEqual(page.widgets);
  expect(next.layout.areas.area.detached).toEqual(page.layout.areas.area.detached);
  expect(next.layout.areas.copy.members).toEqual([]);
  expect(roundTrip(next)).toEqual(next);
});
it("rejects duplicate identities, malformed snapshots and invalid paste positions atomically", () => {
  const page = duplicateWyrmetizerWidget(createWyrmetizerCopy(fixture(), adapters), "a", "b", adapters);
  const before = structuredClone(page), clipboard = copyWyrmetizerComposition(page, "area", adapters);
  for (const ids of [{ a: "same", b: "same" }, { a: "a", b: "new_b" }, { a: "new_a" }])
    expect(() => pasteWyrmetizerComposition(page, clipboard, "copy", ids, adapters)).toThrow();
  expect(() => pasteWyrmetizerComposition(page, clipboard, "area", { a: "x", b: "y" }, adapters)).toThrow();
  expect(() => pasteWyrmetizerComposition(page, clipboard, "copy", { a: "x", b: "y" }, adapters, -1)).toThrow();
  const malformed = structuredClone(clipboard);
  malformed.area.composition.geometry.stackOrder = ["a", "a"];
  expect(() => pasteWyrmetizerComposition(page, malformed, "copy", { a: "x", b: "y" }, adapters)).toThrow();
  expect(page).toEqual(before);
});
it("keeps the existing Area limit when pasting a whole container", () => {
  let page = createWyrmetizerCopy(fixture(), adapters);
  for (let i = 0; i < 19; i++) page = createEmptyWyrmetizerComposition(page, `empty_${i}`, adapters);
  const before = structuredClone(page), clipboard = copyWyrmetizerComposition(page, "area", adapters);
  expect(() => pasteWyrmetizerComposition(page, clipboard, "copy", { a: "new_a" }, adapters)).toThrow(/too many Areas/);
  expect(page).toEqual(before);
});
it("creates empty Areas at explicit Flow positions with stable identities and no input changes", () => {
  const page = createWyrmetizerCopy(fixture(), adapters), before = structuredClone(page);
  let next = createEmptyWyrmetizerComposition(page, "empty", adapters, { index: 0, height: 950 });
  expect(page).toEqual(before);
  expect(next.layout.contentOrder).toEqual([{ kind: "area", id: "empty" }, { kind: "area", id: "area" }]);
  expect(next.widgets).toEqual(page.widgets);
  expect(next.layout.areas.empty.composition.geometry.profiles.desktop.height.valuePx).toBe(950);
  expect(next.layout.areas.empty.composition.geometry.profiles.desktop.height.mode).toBe("auto");
  for (const mode of ["flow", "composition"]) {
    next = switchWyrmetizerMode(next, "empty", mode, adapters);
    expect(roundTrip(next)).toEqual(next);
    expect(next.layout.areas.empty.members).toEqual([]);
  }
  expect(() => createEmptyWyrmetizerComposition(next, "empty", adapters)).toThrow(/already exists/);
  for (const options of [{ index: -1 }, { index: 99 }, { index: 0.5 }, { width: 0 }, { height: NaN }])
    expect(() => createEmptyWyrmetizerComposition(next, "invalid", adapters, options)).toThrow();
  expect(() => createEmptyWyrmetizerComposition(next, "__proto__", adapters)).toThrow();
  const blank = initializeWyrmetizerPage({ widgets: {} }, adapters);
  expect(roundTrip(createEmptyWyrmetizerComposition(blank, "first", adapters)).layout.areas.first.members).toEqual([]);
});
it.each(["flow", "composition"])("deletes only the container in %s and releases authored Flow in Flow order at its position", mode => {
  let page = duplicateWyrmetizerWidget(createWyrmetizerCopy(fixture(), adapters), "a", "b", adapters);
  page.layout.areas.area.flow.order = ["b", "a"];
  page.layout.areas.area.flow.presentation.a.top_spacing_px = 99;
  page.layout.areas.area.flow.presentation.a.image_transform.dimensions.width.value = 173;
  page = createEmptyWyrmetizerComposition(page, "before", adapters, { index: 0 });
  page = createEmptyWyrmetizerComposition(page, "after", adapters);
  page = switchWyrmetizerMode(page, "area", mode, adapters);
  const before = structuredClone(page), released = deleteWyrmetizerComposition(page, "area", adapters);
  expect(page).toEqual(before);
  expect(released.layout.contentOrder).toEqual([
    { kind: "area", id: "before" }, { kind: "widget", id: "b" }, { kind: "widget", id: "a" }, { kind: "area", id: "after" },
  ]);
  expect(released.layout.areas).toEqual({ before: before.layout.areas.before, after: before.layout.areas.after });
  expect(released.widgetsOrder).toEqual(["b", "a"]);
  for (const id of ["a", "b"]) expect(released.widgets[id]).toEqual({ ...before.widgets[id],
    settings: { ...before.widgets[id].settings, ...before.layout.areas.area.flow.presentation[id] } });
  expect(roundTrip(released)).toEqual(released);
  expect(deleteWyrmetizerComposition(released, "area", adapters)).toBe(released);
});
it.each(["flow", "composition"])("retains the final Area after explicit child deletion in %s and permits reuse", mode => {
  let page = switchWyrmetizerMode(createWyrmetizerCopy(fixture(), adapters), "area", mode, adapters);
  page = deleteWyrmetizerWidget(page, "a", adapters);
  expect(page.widgets).toEqual({});
  expect(page.widgetsOrder).toEqual([]);
  expect(page.layout.areas.area.members).toEqual([]);
  expect(page.layout.areas.area.composition.geometry.placements).toEqual({});
  expect(roundTrip(page)).toEqual(page);
  page = addWyrmetizerWidget(page, "area", "new", fixture().widgets.a, adapters);
  expect(roundTrip(page).layout.areas.area.members).toEqual(["new"]);
});
it("deletes an empty container without moving detached or independent Widgets or another populated Area", () => {
  let page = duplicateWyrmetizerWidget(createWyrmetizerCopy(fixture(), adapters), "a", "b", adapters);
  page = removeWyrmetizerWidget(page, "area", "b", adapters);
  page = createWyrmetizerComposition(page, "other", ["b"], { b: { x: 0, y: 0, pivot: { x: 0, y: 0 } } }, 1200, 800, adapters);
  expect(page.layout.areas.other.composition.geometry.profiles.desktop.height.mode).toBe("auto");
  page = removeWyrmetizerWidget(page, "area", "a", adapters);
  const before = structuredClone(page), next = deleteWyrmetizerComposition(page, "area", adapters);
  expect(next.layout.contentOrder).toEqual(before.layout.contentOrder.filter(entry => entry.id !== "area"));
  expect(next.widgets).toEqual(before.widgets);
  expect(next.layout.areas.other).toEqual(before.layout.areas.other);
  expect(roundTrip(next)).toEqual(next);
});
it.each(["composition", "flow"])("removes to authored Flow in %s and preserves every remaining placement", mode => {
  let page = createWyrmetizerCopy(fixture(), adapters);
  page = duplicateWyrmetizerWidget(page, "a", "b", adapters);
  const area = page.layout.areas.area;
  area.composition.geometry.placements.a.version = 3;
  Object.assign(area.composition.geometry.placements.a.frames.desktop, { rotation: 30, rotationPivot: { x: 0.2, y: 0.8 } });
  area.flow.presentation.a.image_transform.dimensions.width.value = 173;
  area.flow.presentation.a.top_spacing_px = 93;
  page = switchWyrmetizerMode(page, "area", mode, adapters);
  const before = structuredClone(page);
  const detached = removeWyrmetizerWidget(page, "area", "a", adapters);
  expect(page).toEqual(before);
  expect(detached.widgets.a.settings).toEqual({ ...page.widgets.a.settings, ...area.flow.presentation.a });
  expect(detached.layout.areas.area.members).toEqual(["b"]);
  expect(detached.layout.areas.area.composition.geometry.placements.b).toEqual(area.composition.geometry.placements.b);
  expect(detached.layout.areas.area.composition.geometry.stackOrder).toEqual(["b"]);
  expect(detached.layout.contentOrder).toContainEqual({ kind: "widget", id: "a" });
  let reloaded = serializeWyrmetizerEditorPage(openWyrmetizerEditorPage(JSON.parse(JSON.stringify(detached)), adapters), adapters);
  expect(reloaded).toEqual(detached);
  reloaded.widgets.a.settings.top_spacing_px = 111;
  reloaded = includeWyrmetizerWidgets(reloaded, "area", ["a"], { a: { x: 0, y: 0, pivot: { x: 0, y: 0 } } }, adapters);
  expect(reloaded.layout.areas.area.composition).toEqual(area.composition);
  expect(reloaded.layout.areas.area.flow.presentation.a.top_spacing_px).toBe(111);
  expect(reloaded.layout.areas.area.detached).toEqual({});
  expect(Object.keys(reloaded.widgets)).toEqual(Object.keys(page.widgets));
});
it("retains the final empty Area through serialization and restores members in either rejoin order", () => {
  let page = createWyrmetizerCopy(fixture(), adapters);
  page = duplicateWyrmetizerWidget(page, "a", "b", adapters);
  page.layout.areas.area.composition.geometry.stackOrder.reverse();
  const original = structuredClone(page.layout.areas.area);
  page = removeWyrmetizerWidget(page, "area", "a", adapters);
  page = removeWyrmetizerWidget(page, "area", "b", adapters);
  const view = openWyrmetizerEditorPage(JSON.parse(JSON.stringify(page)), adapters);
  expect(view.layout.compositions.area.childrenOrder).toEqual([]);
  expect(serializeWyrmetizerEditorPage(view, adapters)).toEqual(page);
  expect(page.layout.contentOrder).toEqual([{ kind: "area", id: "area" }, { kind: "widget", id: "a" }, { kind: "widget", id: "b" }]);
  expect(() => validateCompositionLayout({ ...view, wyrmetizerEditorLayout: undefined }, adapters)).toThrow(/reading\/stack/);
  for (const ids of [["a", "b"], ["b", "a"]]) {
    const restored = includeWyrmetizerWidgets(page, "area", ids, {}, adapters);
    expect(restored.layout.areas.area.composition).toEqual(original.composition);
    expect(restored.layout.areas.area.flow).toEqual(original.flow);
    expect(new Set(restored.layout.areas.area.members).size).toBe(2);
  }
});
it("invalidates unsafe restoration and cleans records on deletion or joining a different Area", () => {
  let page = removeWyrmetizerWidget(createWyrmetizerCopy(fixture(), adapters), "area", "a", adapters);
  const frame = { x: 0.1, y: 0.1, pivot: { x: 0, y: 0 } };
  const other = createWyrmetizerComposition(page, "other", ["a"], { a: frame }, 1200, 800, adapters);
  expect(other.layout.areas.area.detached).toEqual({});
  expect(deleteWyrmetizerWidget(page, "a", adapters).layout.areas.area.detached).toEqual({});
  page = editWyrmetizerWidget(page, "a", { image: "/different.png" }, adapters);
  page = includeWyrmetizerWidgets(page, "area", ["a"], { a: frame }, adapters);
  expect(page.layout.areas.area.composition.geometry.placements.a.frames.desktop).toEqual(frame);
  expect(() => includeWyrmetizerWidgets(page, "area", ["a"], { a: frame }, adapters)).toThrow(/membership/);
});
it("rejects malformed restoration records without changing the original page", () => {
  const page = removeWyrmetizerWidget(createWyrmetizerCopy(fixture(), adapters), "area", "a", adapters);
  const invalid = structuredClone(page);
  invalid.layout.areas.area.detached.a.geometry.placements.a.frames.desktop.x = NaN;
  expect(() => validateWyrmetizerPage(invalid, adapters)).toThrow();
  expect(() => validateWyrmetizerPage(page, adapters)).not.toThrow();
});
it.each(["flow", "composition"])("includes existing Flow Widgets atomically in %s without replacing authored members", mode => {
  const source = fixture();
  source.widgets.b = structuredClone(source.widgets.a);
  source.widgets.c = structuredClone(source.widgets.a);
  source.widgetsOrder.push("b", "c");
  source.layout.contentOrder.push({ kind: "widget", id: "b" }, { kind: "widget", id: "c" });
  let page = createWyrmetizerCopy(source, adapters);
  page = duplicateWyrmetizerWidget(page, "a", "d", adapters);
  page.layout.areas.area.flow.order = ["d", "a"];
  page.layout.areas.area.composition.geometry.stackOrder = ["d", "a"];
  const placement = page.layout.areas.area.composition.geometry.placements.a;
  Object.assign(placement, { version: 3 });
  Object.assign(placement.frames.desktop, { rotation: 25, rotationPivot: { x: 0.2, y: 0.8 } });
  page = switchWyrmetizerMode(page, "area", mode, adapters);
  const before = structuredClone(page);
  const frame = { x: 0.1, y: 0.1, pivot: { x: 0, y: 0 } };
  page = includeWyrmetizerWidgets(page, "area", ["b"], { b: frame }, adapters);
  const area = page.layout.areas.area, old = before.layout.areas.area;
  expect(area.activeMode).toBe(mode);
  expect(area.members).toEqual(["a", "d", "b"]);
  expect(area.flow.order).toEqual(["d", "a", "b"]);
  expect(area.flow.presentation.a).toEqual(old.flow.presentation.a);
  expect(area.composition.presentation.a).toEqual(old.composition.presentation.a);
  expect(area.composition.geometry.placements.a).toEqual(old.composition.geometry.placements.a);
  expect(area.composition.geometry.placements.d).toEqual(old.composition.geometry.placements.d);
  expect(area.composition.geometry.childrenOrder).toEqual(["a", "d", "b"]);
  expect(area.composition.geometry.stackOrder).toEqual(["d", "a", "b"]);
  expect(area.composition.geometry.placements.b.frames.desktop).toEqual(frame);
  expect(page.widgets.c).toEqual(before.widgets.c);
  expect(page.layout.contentOrder).toContainEqual({ kind: "widget", id: "c" });
  expect(before.widgets.b.settings.image_transform).toEqual(area.flow.presentation.b.image_transform);
  expect(serializeWyrmetizerEditorPage(openWyrmetizerEditorPage(JSON.parse(JSON.stringify(page)), adapters), adapters)).toEqual(page);
  const unchanged = structuredClone(page);
  expect(() => includeWyrmetizerWidgets(page, "area", ["c", "a"], { c: frame, a: frame }, adapters)).toThrow(/membership/);
  expect(page).toEqual(unchanged);
  page = editWyrmetizerWidget(page, "b", { link: "/shared-content" }, adapters);
  for (const target of ["flow", "composition"]) {
    page = switchWyrmetizerMode(page, "area", target, adapters);
    expect(resolveWyrmetizerPage(page).widgets.b.settings.link).toBe("/shared-content");
  }
});
it("initializes new empty and Flow-only pages with the paired envelope without altering Flow", () => {
  for (const source of [{ widgets: {} }, { widgets: fixture().widgets, widgetsOrder: ["a"] }]) {
    const before = structuredClone(source);
    const page = initializeWyrmetizerPage(source, adapters);
    expect(page.layout).toEqual({ version: 2, areas: {}, contentOrder: (source.widgetsOrder || []).map(id => ({ kind: "widget", id })) });
    expect(page.widgets).toEqual(source.widgets);
    expect(source).toEqual(before);
    expect(openWyrmetizerEditorPage(page, adapters).wyrmetizerEditorLayout.version).toBe(2);
  }
});
it("creates a first paired area without replacing Flow presentation or an existing inactive area", () => {
  let page = initializeWyrmetizerPage({ widgets: { ...fixture().widgets, b: structuredClone(fixture().widgets.a) }, widgetsOrder: ["b", "a"] }, adapters);
  const original = structuredClone(page);
  page = createWyrmetizerComposition(page, "first", ["a"], { a: { x: 0.3, y: 0.2, pivot: { x: 0, y: 0 } } }, 1200, 800, adapters);
  page = switchWyrmetizerMode(page, "first", "flow", adapters);
  const first = structuredClone(page.layout.areas.first);
  expect(resolveWyrmetizerPage(page).widgets).toEqual(original.widgets);
  expect(page.widgetsOrder).toEqual(original.widgetsOrder);
  expect(() => createWyrmetizerComposition(page, "other", ["a"], {}, 1200, 800, adapters)).toThrow(/already has/);
  expect(() => createWyrmetizerComposition(page, "first", ["b"], {}, 1200, 800, adapters)).toThrow(/already exists/);
  page = createWyrmetizerComposition(page, "second", ["b"], { b: { x: 0.1, y: 0.1, pivot: { x: 0, y: 0 } } }, 1200, 800, adapters);
  expect(page.layout.areas.first).toEqual(first);
  expect(page.layout.areas.second.flow.presentation.b).toEqual(first.flow.presentation.a);
});
it.each([false, true])("transfers root Mobile ownership into a new Area (patch: %s) and round-trips", hasPatch => {
  const page = withStandaloneImages(["c", "d", "e"]);
  const mobilePatch = { fullwidth: false, top_spacing_px: 0, image_transform: structuredClone(page.widgets.c.settings.image_transform) };
  mobilePatch.image_transform.dimensions = {
    width: { unit: "px", value: 200 }, height: { unit: "px", value: null },
  };
  if (hasPatch) page.layout.mobile.presentation = { c: mobilePatch };
  page.layout.mobile.rootOrder = mobileRootOrder(["widget", "c"], ["widget", "d"], ["widget", "e"], ["area", "area"]);
  const before = structuredClone(page), desktopBefore = resolveWyrmetizerPage(page);
  const mobileBefore = resolveWyrmetizerPresentation(page, 390);
  const frames = {
    c: { x: 0.1, y: 0.1, pivot: { x: 0, y: 0 } },
    e: { x: 0.2, y: 0.1, pivot: { x: 0, y: 0 } },
  };
  const baseline = createWyrmetizerComposition(withStandaloneImages(["c", "d", "e"]), "new-area", ["c", "e"], frames, 1200, 800, adapters);

  const next = createWyrmetizerComposition(page, "new-area", ["c", "e"], frames, 1200, 800, adapters);

  expect(page).toEqual(before);
  expect(next.layout.areas["new-area"]).toEqual(baseline.layout.areas["new-area"]);
  expect(resolveWyrmetizerPage(next).layout.compositions).toEqual(resolveWyrmetizerPage(baseline).layout.compositions);
  expect(resolveWyrmetizerPage(next).widgets.c.settings).toEqual(desktopBefore.widgets.c.settings);
  expect(next.layout.mobile.presentation?.c).toBeUndefined();
  expect(next.layout.mobile.rootOrder).toEqual(mobileRootOrder(["area", "new-area"], ["widget", "d"], ["area", "area"]));
  expect(next.layout.mobile.areas?.["new-area"]?.composition?.presentation?.c ?? {}).toEqual(
    hasPatch ? mobilePatch : {});
  expect(next.layout.mobile.areas?.["new-area"]?.flow?.presentation?.c ?? {}).toEqual(
    hasPatch ? mobilePatch : {});
  expect(resolveWyrmetizerPresentation(next, 390).widgets.c.settings.fullwidth)
    .toBe(hasPatch ? false : mobileBefore.widgets.c.settings.fullwidth);
  expect(resolveWyrmetizerPresentation(next, 390).widgets.c.settings.image_transform)
    .toEqual(hasPatch ? mobilePatch.image_transform : mobileBefore.widgets.c.settings.image_transform);

  let switched = switchWyrmetizerMode(next, "new-area", "flow", adapters);
  expect(resolveWyrmetizerPresentation(switched, 390).widgets.c.settings.top_spacing_px)
    .toBe(hasPatch ? 0 : mobileBefore.widgets.c.settings.top_spacing_px);
  switched = switchWyrmetizerMode(switched, "new-area", "composition", adapters);
  expect(roundTrip(switched)).toEqual(switched);
});
it.each([false, true])("transfers root Mobile ownership when including into an Area (patch: %s)", hasPatch => {
  const page = withStandaloneImages(["c", "d", "e"]);
  if (hasPatch) page.layout.mobile.presentation = { c: { fullwidth: false, top_spacing_px: 0 } };
  page.layout.mobile.rootOrder = mobileRootOrder(["widget", "c"], ["widget", "d"], ["widget", "e"], ["area", "area"]);
  const before = structuredClone(page), desktopBefore = resolveWyrmetizerPage(page);
  const mobileBefore = resolveWyrmetizerPresentation(page, 390);
  const frames = {
    c: { x: 0.1, y: 0.1, pivot: { x: 0, y: 0 } },
    e: { x: 0.2, y: 0.1, pivot: { x: 0, y: 0 } },
  };
  const baseline = includeWyrmetizerWidgets(withStandaloneImages(["c", "d", "e"]), "area", ["c", "e"], frames, adapters);

  const next = includeWyrmetizerWidgets(page, "area", ["c", "e"], frames, adapters);

  expect(page).toEqual(before);
  expect(next.layout.mobile.presentation?.c).toBeUndefined();
  expect(next.layout.mobile.rootOrder).toEqual(mobileRootOrder(["widget", "d"], ["area", "area"]));
  expect(next.layout.mobile.areas?.area?.composition?.presentation?.c ?? {})
    .toEqual(hasPatch ? { fullwidth: false, top_spacing_px: 0 } : {});
  expect(next.layout.mobile.areas?.area?.flow?.presentation?.c ?? {})
    .toEqual(hasPatch ? { fullwidth: false, top_spacing_px: 0 } : {});
  expect(next.layout.areas.area.flow.order).toEqual(["a", "c", "e"]);
  expect(next.layout.areas.area.flow).toEqual(baseline.layout.areas.area.flow);
  expect(next.layout.areas.area.composition).toEqual(baseline.layout.areas.area.composition);
  expect(resolveWyrmetizerPage(next).widgets.c.settings).toEqual(desktopBefore.widgets.c.settings);
  expect(resolveWyrmetizerPresentation(next, 390).widgets.c.settings.fullwidth)
    .toBe(hasPatch ? false : mobileBefore.widgets.c.settings.fullwidth);
  expect(roundTrip(next)).toEqual(next);
});
it.each(["new Area", "existing Area"]) ("keeps Mobile root order sparse when it was omitted during transfer to a %s", destination => {
  const page = withStandaloneImages(["c"]);
  page.layout.mobile.presentation = { c: { top_spacing_px: 0 } };
  const frames = { c: { x: 0.1, y: 0.1, pivot: { x: 0, y: 0 } } };
  const next = destination === "new Area"
    ? createWyrmetizerComposition(page, "new-area", ["c"], frames, 1200, 800, adapters)
    : includeWyrmetizerWidgets(page, "area", ["c"], frames, adapters);

  expect(next.layout.mobile.rootOrder).toBeUndefined();
  expect(next.layout.mobile.presentation?.c).toBeUndefined();
  const areaId = destination === "new Area" ? "new-area" : "area";
  expect(next.layout.mobile.areas[areaId].flow.presentation.c).toEqual({ top_spacing_px: 0 });
  expect(next.layout.mobile.areas[areaId].composition.presentation.c).toEqual({ top_spacing_px: 0 });
  expect(roundTrip(next)).toEqual(next);
});
it("rejects inclusion that would invalidate existing independent Mobile geometry without mutating input", () => {
  const page = withStandaloneImages(["c"]);
  page.layout.mobile.areas = { area: { composition: { geometry: {
    version: 1, referenceWidthPx: 390, heightPx: 400,
    readingOrder: ["a"], stackOrder: ["a"],
    placements: {
      a: { x: { value: 0, unit: "px" }, y: { value: 0, unit: "px" }, pivot: { x: 0, y: 0 } },
    },
  } } } };
  page.layout.mobile.presentation = { c: { fullwidth: false } };
  const before = structuredClone(page);

  expect(() => includeWyrmetizerWidgets(page, "area", ["c"], {
    c: { x: 0.1, y: 0.1, pivot: { x: 0, y: 0 } },
  }, adapters)).toThrow(/cannot include standalone Widgets.*independent Mobile Composition geometry/);
  expect(page).toEqual(before);
});
it("opens legacy Flow without upgrading, and explicitly converts only a separate copy", () => {
  const legacy = { widgets: fixture().widgets, widgetsOrder: ["a"] };
  expect(openWyrmetizerEditorPage(legacy, adapters)).toBe(legacy);
  const before = structuredClone(legacy);
  expect(createWyrmetizerCopy(legacy, adapters).layout.version).toBe(2);
  expect(legacy).toEqual(before);
});
it("round-trips the editor view and routes active edits without touching inactive presentation", () => {
  const canonical = createWyrmetizerCopy(fixture(), adapters);
  const view = openWyrmetizerEditorPage(canonical, adapters);
  expect(serializeWyrmetizerEditorPage(view, adapters)).toEqual(canonical);
  view.widgets.a.settings.image_transform.dimensions.width.value = 199;
  view.widgets.a.settings.link = "/shared";
  view.layout.compositions.area.placements.a.frames.desktop.x = 0.3;
  const saved = serializeWyrmetizerEditorPage(view, adapters);
  expect(saved.wyrmetizerEditorLayout).toBeUndefined();
  expect(saved.layout.areas.area.flow).toEqual(canonical.layout.areas.area.flow);
  expect(saved.layout.areas.area.composition.presentation.a.image_transform.dimensions.width.value).toBe(199);
  expect(saved.widgets.a.settings.link).toBe("/shared");
  expect(saved.widgets.a.settings.image_transform).toBeUndefined();
});
function fixture() {
  const transform = defaultImageTransform();
  transform.dimensions = { width: { unit: "px", value: 100 }, height: { unit: "px", value: 80 } };
  return createComposition({ widgets: { a: { type: "image", settings: { image: "/photo.png", link: "/one", image_transform: transform, top_spacing_px: 17 } } }, widgetsOrder: ["a"] },
    "area", ["a"], { a: { x: 0.2, y: 0.2, pivot: { x: 0, y: 0 } } });
}
it("creates an independent copy with canonical content and no input mutation", () => {
  const original = fixture(), before = JSON.stringify(original), copy = createWyrmetizerCopy(original, adapters);
  expect(JSON.stringify(original)).toBe(before);
  expect(copy.widgets.a.settings).toEqual({ image: "/photo.png", link: "/one" });
  expect(resolveWyrmetizerPage(copy)).toEqual(original);
});
it("preserves exact independent geometry across repeated switching and JSON reload", () => {
  let page = createWyrmetizerCopy(fixture(), adapters);
  const composition = structuredClone(page.layout.areas.area.composition);
  page = switchWyrmetizerMode(page, "area", "flow", adapters);
  const transform = structuredClone(page.layout.areas.area.flow.presentation.a.image_transform);
  transform.dimensions.width.value = 257;
  page = editWyrmetizerWidget(page, "a", { image_transform: transform, top_spacing_px: 93 }, adapters);
  const flow = structuredClone(page.layout.areas.area.flow);
  for (let i = 0; i < 30; i++) {
    page = switchWyrmetizerMode(JSON.parse(JSON.stringify(page)), "area", "composition", adapters);
    expect(page.layout.areas.area.composition).toEqual(composition);
    expect(resolveWyrmetizerPage(page).widgets.a.settings.image_transform.dimensions.width.value).toBe(100);
    page = switchWyrmetizerMode(page, "area", "flow", adapters);
    expect(page.layout.areas.area.flow).toEqual(flow);
    expect(resolveWyrmetizerPage(page).layout.compositions).toEqual({});
  }
});
it("shares content edits across both modes without copying layout settings into content", () => {
  let page = createWyrmetizerCopy(fixture(), adapters);
  page = editWyrmetizerWidget(page, "a", { link: "/changed", image: "/new.png" }, adapters);
  page = switchWyrmetizerMode(page, "area", "flow", adapters);
  expect(resolveWyrmetizerPage(page).widgets.a.settings.link).toBe("/changed");
  expect(page.widgets.a.settings.image_transform).toBeUndefined();
});
it("duplicates both arrangements independently and deletes all references without resurrection", () => {
  let page = createWyrmetizerCopy(fixture(), adapters);
  page = duplicateWyrmetizerWidget(page, "a", "b", adapters);
  expect(page.layout.areas.area.flow.order).toEqual(["a", "b"]);
  expect(page.layout.areas.area.composition.geometry.stackOrder).toEqual(["a", "b"]);
  page = deleteWyrmetizerWidget(page, "a", adapters);
  page = switchWyrmetizerMode(page, "area", "flow", adapters);
  expect(page.widgetsOrder).toEqual(["b"]);
  expect(page.widgets.a).toBeUndefined();
  page = deleteWyrmetizerWidget(page, "b", adapters);
  expect(page.layout.areas.area.members).toEqual([]);
  expect(page.layout.contentOrder).toEqual([{ kind: "area", id: "area" }]);
});
it("no-op mode switches and edits preserve identity for history suppression", () => {
  const page = createWyrmetizerCopy(fixture(), adapters);
  expect(switchWyrmetizerMode(page, "area", "composition", adapters)).toBe(page);
  expect(editWyrmetizerWidget(page, "a", { link: "/one" }, adapters)).toBe(page);
});
it("adds without repacking and keeps Flow order independent of Composition order", () => {
  let page = createWyrmetizerCopy(fixture(), adapters);
  const original = structuredClone(page.layout.areas.area.composition.geometry.placements.a);
  page = addWyrmetizerWidget(page, "area", "b", fixture().widgets.a, adapters);
  expect(page.layout.areas.area.composition.geometry.placements.a).toEqual(original);
  page = switchWyrmetizerMode(page, "area", "flow", adapters);
  page = reorderWyrmetizerFlow(page, "area", ["b", "a"], adapters);
  expect(page.widgetsOrder).toEqual(["b", "a"]);
  page = switchWyrmetizerMode(page, "area", "composition", adapters);
  expect(page.widgetsOrder).toEqual(["a", "b"]);
  expect(page.layout.areas.area.flow.order).toEqual(["b", "a"]);
});
it.each(["version", "membership", "content", "ownership"])("fails closed for invalid %s", issue => {
  const page = createWyrmetizerCopy(fixture(), adapters);
  if (issue === "version") page.layout.version = 99;
  if (issue === "membership") page.layout.areas.area.flow.order.push("missing");
  if (issue === "content") page.layout.areas.area.flow.presentation.a.link = "/bad";
  if (issue === "ownership") page.widgets.a.settings.image_transform = defaultImageTransform();
  expect(() => validateWyrmetizerPage(page, adapters)).toThrow();
});
