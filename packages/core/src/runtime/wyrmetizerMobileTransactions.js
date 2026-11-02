import {
  convertWyrmetizerPageToV3,
  imagePresentationKeys,
  openWyrmetizerEditorPage,
  resolveWyrmetizerPage,
  serializeWyrmetizerEditorPage,
  validateWyrmetizerPage,
  WYRMTIZER_MOBILE_REFERENCE_WIDTH_PX,
} from "./wyrmetizerLayouts.js";
import { resolveWyrmetizerPresentation } from "./wyrmetizerPresentation.js";

const clone = value => structuredClone(value);
const record = value => value && typeof value === "object" && !Array.isArray(value);
const fail = message => { throw new Error(`Wyrmetizer Mobile transaction: ${message}`); };

function canonicalPage(page, adapters) {
  if (!record(page)) fail("page is required");
  const canonical = serializeWyrmetizerEditorPage(page, adapters);
  validateWyrmetizerPage(canonical, adapters);
  return canonical;
}

function normalizeTarget(page, target) {
  if (!record(target) || typeof target.widgetId !== "string" || !target.widgetId) fail("invalid Widget target");
  const allowed = target.areaId === undefined ? ["widgetId"] : ["widgetId", "areaId", "mode"];
  if (Object.keys(target).some(key => !allowed.includes(key))) fail("invalid target path");
  if (target.areaId === undefined) {
    if (!page.layout.contentOrder.some(entry => entry.kind === "widget" && entry.id === target.widgetId))
      fail("Widget is not a standalone Flow Widget");
    return { widgetId: target.widgetId };
  }
  if (typeof target.areaId !== "string" || !target.areaId) fail("invalid Area target");
  const area = page.layout.areas[target.areaId];
  const mode = target.mode ?? area?.activeMode;
  if (!area || !["flow", "composition"].includes(mode) || !area.members.includes(target.widgetId)) fail("invalid Area Widget mode");
  return { areaId: target.areaId, mode, widgetId: target.widgetId };
}

function targetView(page, target, adapters) {
  let viewPage = page;
  if (target.areaId && page.layout.areas[target.areaId].activeMode !== target.mode) {
    viewPage = clone(page);
    viewPage.layout.areas[target.areaId].activeMode = target.mode;
    viewPage.widgetsOrder = resolveWyrmetizerPage(viewPage).widgetsOrder;
  }
  return resolveWyrmetizerPresentation(viewPage, WYRMTIZER_MOBILE_REFERENCE_WIDTH_PX, {
    adapters,
    deferBoundsValidation: true,
  });
}

function isSame(a, b) {
  if (Object.is(a, b)) return true;
  if (!record(a) || !record(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => isSame(value, b[index]));
  }
  const aKeys = Object.keys(a), bKeys = Object.keys(b);
  return aKeys.length === bKeys.length && aKeys.every(key => Object.hasOwn(b, key) && isSame(a[key], b[key]));
}

function applyTargetPatch(page, target, patch) {
  if (target.areaId) {
    const mobile = page.layout.mobile;
    mobile.areas ??= {};
    mobile.areas[target.areaId] ??= {};
    mobile.areas[target.areaId][target.mode] ??= {};
    mobile.areas[target.areaId][target.mode].presentation ??= {};
    mobile.areas[target.areaId][target.mode].presentation[target.widgetId] = patch;
    return;
  }
  page.layout.mobile.presentation ??= {};
  page.layout.mobile.presentation[target.widgetId] = patch;
}

function getTargetPatch(page, target) {
  return target.areaId
    ? page.layout.mobile?.areas?.[target.areaId]?.[target.mode]?.presentation?.[target.widgetId]
    : page.layout.mobile?.presentation?.[target.widgetId];
}

function pruneMobile(page) {
  const mobile = page.layout.mobile;
  if (record(mobile.presentation) && Object.keys(mobile.presentation).length === 0) delete mobile.presentation;
  if (record(mobile.areas)) {
    for (const [areaId, area] of Object.entries(mobile.areas)) {
      for (const mode of ["flow", "composition"]) {
        const value = area[mode];
        if (record(value?.presentation) && Object.keys(value.presentation).length === 0) delete value.presentation;
        if (record(value) && Object.keys(value).length === 0) delete area[mode];
      }
      if (Object.keys(area).length === 0) delete mobile.areas[areaId];
    }
    if (Object.keys(mobile.areas).length === 0) delete mobile.areas;
  }
}

function pageShape(page, editorProjection, adapters) {
  return editorProjection ? openWyrmetizerEditorPage(page, adapters) : page;
}

/** Start a disposable property-edit transaction from the resolved Mobile value. */
export function beginWyrmetizerMobileTransaction(page, target, adapters) {
  const canonical = canonicalPage(page, adapters);
  const normalized = normalizeTarget(canonical, target);
  const view = targetView(canonical, normalized, adapters);
  const widget = view.widgets[normalized.widgetId];
  if (!widget) fail("Widget is not available in the Mobile presentation");
  const initialValues = Object.fromEntries(imagePresentationKeys
    .filter(key => Object.hasOwn(widget.settings || {}, key))
    .map(key => [key, clone(widget.settings[key])]));
  return {
    kind: "wyrmetizer-mobile-presentation-transaction",
    sourcePage: clone(page),
    basePage: canonical,
    pageId: canonical.id,
    editorProjection: !!page.wyrmetizerEditorLayout,
    target: normalized,
    initialValues,
    changes: {},
  };
}

/** Stage a value without changing the page; setting the initial value is a no-op. */
export function setWyrmetizerMobileTransactionValue(transaction, property, value) {
  if (transaction?.kind !== "wyrmetizer-mobile-presentation-transaction") fail("invalid transaction");
  if (!imagePresentationKeys.includes(property)) fail("unsupported Mobile presentation property");
  let copy;
  try { copy = clone(value); } catch { fail("Mobile presentation values must be serializable"); }
  if (copy === undefined) fail("undefined is not a Mobile presentation value");
  const changes = clone(transaction.changes);
  if (isSame(copy, transaction.initialValues[property])) delete changes[property];
  else changes[property] = copy;
  return { ...transaction, changes };
}

/** Apply all staged properties together, validating the complete v3 envelope before returning it. */
export function commitWyrmetizerMobileTransaction(transaction, adapters, currentPage = transaction?.sourcePage) {
  if (transaction?.kind !== "wyrmetizer-mobile-presentation-transaction") fail("invalid transaction");
  const changed = Object.keys(transaction.changes || {}).filter(property =>
    imagePresentationKeys.includes(property) && !isSame(transaction.changes[property], transaction.initialValues[property]));
  if (changed.length === 0) return { page: clone(transaction.sourcePage), changed: false, upgraded: false };

  let next = canonicalPage(currentPage, adapters);
  if (transaction.pageId !== next.id) fail("page changed during the transaction");
  const target = normalizeTarget(next, transaction.target);
  const upgraded = next.layout.version === 2;
  if (upgraded) next = convertWyrmetizerPageToV3(next, adapters);
  const previousPatch = getTargetPatch(next, target) || {};
  const patch = { ...clone(previousPatch) };
  for (const property of changed) patch[property] = clone(transaction.changes[property]);
  applyTargetPatch(next, target, patch);
  validateWyrmetizerPage(next, adapters);
  return { page: pageShape(next, transaction.editorProjection, adapters), changed: true, upgraded };
}

/** Cancel only discards the transaction draft; the source page is returned unchanged. */
export function cancelWyrmetizerMobileTransaction(transaction) {
  if (transaction?.kind !== "wyrmetizer-mobile-presentation-transaction") fail("invalid transaction");
  return clone(transaction.sourcePage);
}

/** Remove one Mobile override property or every Mobile presentation override for one Widget. */
export function resetWyrmetizerMobileWidget(page, target, adapters, property) {
  const canonical = canonicalPage(page, adapters);
  const normalized = normalizeTarget(canonical, target);
  if (property !== undefined && !imagePresentationKeys.includes(property)) fail("unsupported Mobile presentation property");
  if (canonical.layout.version === 2) return { page: clone(page), changed: false };
  const next = clone(canonical);
  const patch = getTargetPatch(next, normalized);
  if (!patch) return { page: clone(page), changed: false };
  if (property === undefined) {
    if (target.areaId === undefined) delete next.layout.mobile.presentation[normalized.widgetId];
    else delete next.layout.mobile.areas[normalized.areaId][normalized.mode].presentation[normalized.widgetId];
  } else {
    if (!Object.hasOwn(patch, property)) return { page: clone(page), changed: false };
    delete patch[property];
    if (Object.keys(patch).length === 0) {
      if (target.areaId === undefined) delete next.layout.mobile.presentation[normalized.widgetId];
      else delete next.layout.mobile.areas[normalized.areaId][normalized.mode].presentation[normalized.widgetId];
    }
  }
  pruneMobile(next);
  validateWyrmetizerPage(next, adapters);
  return { page: pageShape(next, !!page.wyrmetizerEditorLayout, adapters), changed: true };
}

/** Reset all Mobile-owned presentation and arrangement overrides for one mode across the page. */
export function resetWyrmetizerMobileMode(page, mode, adapters) {
  if (!["flow", "composition"].includes(mode)) fail("invalid Mobile mode");
  const canonical = canonicalPage(page, adapters);
  if (canonical.layout.version === 2) return { page: clone(page), changed: false };
  const next = clone(canonical);
  let changed = false;
  if (Object.hasOwn(next.layout.mobile, "rootOrder")) {
    delete next.layout.mobile.rootOrder;
    changed = true;
  }
  if (mode === "flow" && record(next.layout.mobile.presentation) && Object.keys(next.layout.mobile.presentation).length) {
    delete next.layout.mobile.presentation;
    changed = true;
  }
  for (const area of Object.values(next.layout.mobile.areas || {})) {
    if (Object.hasOwn(area, mode)) {
      delete area[mode];
      changed = true;
    }
  }
  pruneMobile(next);
  if (!changed) return { page: clone(page), changed: false };
  validateWyrmetizerPage(next, adapters);
  return { page: pageShape(next, !!page.wyrmetizerEditorLayout, adapters), changed: true };
}
