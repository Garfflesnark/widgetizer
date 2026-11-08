import { rotatedPoint } from "./rotationGeometry.js";

const STORAGE_KEY = "wz:composition-geometry-recorder";
const MAX_EVENTS = 300;
const MOVE_INTERVAL_MS = 100;
const CORNER_TOLERANCE_PX = 2;
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];

function safeJson(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}

function parseJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function localHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

export function compositionGeometryRecorderEnabled(window, document) {
  const script = document?.querySelector?.("script[data-preview-mode]");
  if (script?.dataset?.geometryRecorderAvailable !== "true" || script.dataset.previewMode !== "editor" || !localHost(window?.location?.hostname || "")) return false;
  try { return window.sessionStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}

function rectOf(element) {
  if (!element) return null;
  const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
  return { left, top, right, bottom, width, height };
}

function cornersOf(element) {
  if (!element) return { points: null, source: "unavailable" };
  try {
    const quads = element.getBoxQuads?.({ box: "border" });
    const quad = quads?.[0];
    if (quad) return { points: [quad.p1, quad.p2, quad.p3, quad.p4].map(({ x, y }) => ({ x, y })), source: "getBoxQuads" };
  } catch { /* fall through to the explicitly marked bounds approximation */ }
  const rect = rectOf(element);
  return rect ? { points: [{ x: rect.left, y: rect.top }, { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom }, { x: rect.left, y: rect.bottom }], source: "axis-aligned-bounds-fallback" } : { points: null, source: "unavailable" };
}

function centerOf(element) {
  const rect = rectOf(element);
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
}

function styleOf(element, view) {
  if (!element) return null;
  const style = view.getComputedStyle(element);
  return { inline: { left: element.style.left, top: element.style.top, width: element.style.width,
    height: element.style.height, transform: element.style.transform, transformOrigin: element.style.transformOrigin },
  computed: { left: style.left, top: style.top, width: style.width, height: style.height,
    transform: style.transform, transformOrigin: style.transformOrigin } };
}

function pointFromPolygon(polygon) {
  if (!polygon) return null;
  const values = (polygon.getAttribute("points") || "").trim().split(/[ ,]+/).map(Number);
  if (values.length < 8 || values.slice(0, 8).some(value => !Number.isFinite(value))) return null;
  return Array.from({ length: 4 }, (_, i) => ({ x: values[i * 2], y: values[i * 2 + 1] }));
}

function expectedCanonicalCorners(canonical, area, scale) {
  const rect = canonical?.rect, frame = canonical?.frame;
  if (!rect || !frame || ![rect.left, rect.top, rect.width, rect.height, scale].every(Number.isFinite) || scale <= 0) return null;
  return CORNERS.map(([x, y]) => {
    const point = rotatedPoint(rect, x, y, frame.rotation || 0, frame.rotationPivot);
    return { x: area.left + point.x * scale, y: area.top + point.y * scale };
  });
}

function comparePoints(left, right, sources = []) {
  if (!left || !right || left.length !== right.length) return { comparable: false, maxErrorPx: null, agrees: null, reason: "corners-unavailable" };
  if (sources.some(source => source === "axis-aligned-bounds-fallback"))
    return { comparable: false, maxErrorPx: null, agrees: null, reason: "axis-aligned-bounds-is-not-transformed-corners" };
  const maxErrorPx = Math.max(...left.flatMap((point, index) => [
    Math.abs(point.x - right[index].x), Math.abs(point.y - right[index].y),
  ]));
  return { comparable: true, maxErrorPx, agrees: maxErrorPx <= CORNER_TOLERANCE_PX };
}

function canonicalFromSync(data, widgetId, areaId) {
  const areas = data?.responsive === true ? data.resolvedPresentation?.areas :
    (data?.resolvedCompositionAreas || data?.payload?.compositions);
  const area = areas?.[areaId], placement = area?.placements?.[widgetId];
  const frame = placement?.frame || placement?.frames?.desktop || null;
  return { frame: safeJson(frame), rect: safeJson(placement?.rect || null),
    revision: data?.revisions?.[widgetId] || null, resolvedSize: safeJson(data?.sizes?.[widgetId] || null),
    presentation: data?.responsive === true ? data.presentation : "desktop",
    syncRevision: data?.responsive === true ? data.syncRevision : null };
}

function diagnosticMessagePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const keys = ["widgetId", "compositionId", "startRevision", "startFrame", "frame", "rotationPivot",
    "presentation", "presentationEpoch", "syncRevision"];
  return safeJson(Object.fromEntries(keys.filter(key => payload[key] !== undefined).map(key => [key, payload[key]])));
}

export function createCompositionGeometryRecorder({ window, document, selected, maxEvents = MAX_EVENTS, moveIntervalMs = MOVE_INTERVAL_MS }) {
  const events = [];
  const pendingMessages = new Map();
  let recording = true;
  let canonical = null, order = 0, dropped = 0, lastMoveAt = 0, nextMessageId = 0, firstDisagreement = null;
  const limit = Math.max(1, Math.floor(maxEvents));

  function snapshot(label, detail = {}) {
    const widgetId = selected();
    const base = { label, at: new Date().toISOString(), order: ++order, widgetId: widgetId || null, detail: safeJson(detail) };
    const widget = widgetId ? Array.from(document.querySelectorAll("[data-widget-id]")).find(element => element.dataset.widgetId === widgetId) : null;
    const child = widget?.closest("[data-composition-child]");
    const area = child?.closest("[data-composition-id]");
    if (!widget || !child || !area) return { ...base, areaId: area?.dataset?.compositionId || null, geometryUnavailable: true };
    const areaData = { id: area.dataset.compositionId || null, width: Number(area.dataset.compositionWidth),
      height: Number(area.dataset.compositionHeight), bounds: rectOf(area) };
    const scale = areaData.width > 0 && areaData.bounds?.width ? areaData.bounds.width / areaData.width : null;
    const frame = safeJson(parseJson(child.dataset.compositionFrame || "null"));
    const image = widget.querySelector("img");
    const polygon = document.querySelector("#wz-selection-overlay svg polygon");
    const outlineCorners = pointFromPolygon(polygon);
    const wrapperCorners = cornersOf(child), imageCorners = cornersOf(image);
    const expectedCorners = expectedCanonicalCorners(canonical, areaData.bounds, scale);
    const comparison = {
      wrapperToImage: comparePoints(wrapperCorners.points, imageCorners.points, [wrapperCorners.source, imageCorners.source]),
      outlineToWrapper: comparePoints(outlineCorners, wrapperCorners.points, [wrapperCorners.source]),
      outlineToImage: comparePoints(outlineCorners, imageCorners.points, [imageCorners.source]),
      canonicalToWrapper: comparePoints(expectedCorners, wrapperCorners.points, [wrapperCorners.source]),
      canonicalToImage: comparePoints(expectedCorners, imageCorners.points, [imageCorners.source]),
      canonicalToOutline: comparePoints(expectedCorners, outlineCorners),
    };
    const issue = Object.entries(comparison).find(([, result]) => result.comparable && result.agrees === false);
    const record = { ...base, areaId: areaData.id, canonical: safeJson(canonical), area: { ...areaData, scale },
      wrapper: { frame, revision: child.dataset.compositionRevision || null, rect: rectOf(child),
        corners: wrapperCorners, style: styleOf(child, window.getComputedStyle ? window : document.defaultView) },
      image: image ? { rect: rectOf(image), corners: imageCorners, naturalSize: { width: image.naturalWidth, height: image.naturalHeight },
        style: styleOf(image, window.getComputedStyle ? window : document.defaultView) } : null,
      outline: { corners: outlineCorners, pivot: centerOf(document.querySelector("#wz-selection-overlay [data-rotation-pivot]")),
        rotationHandle: centerOf(document.querySelector("#wz-selection-overlay [data-composition-rotate]")) }, comparison };
    if (issue && !firstDisagreement) firstDisagreement = { order: record.order, label, pair: issue[0], maxErrorPx: issue[1].maxErrorPx };
    return record;
  }

  function push(record) {
    if (events.length === limit) { events.shift(); dropped++; }
    events.push(record);
    return record;
  }

  function capture(label, detail) {
    if (!recording) return null;
    try { return push(snapshot(label, detail)); } catch { return null; }
  }

  function captureSync(data, phase) {
    if (!recording) return null;
    try {
      const widgetId = selected(), widget = widgetId ? Array.from(document.querySelectorAll("[data-widget-id]")).find(element => element.dataset.widgetId === widgetId) : null;
      const areaId = widget?.closest("[data-composition-child]")?.dataset?.compositionChild ?
        widget.closest("[data-composition-child]").closest("[data-composition-id]")?.dataset?.compositionId : null;
      canonical = canonicalFromSync(data, widgetId, areaId);
      return capture(`composition-sync-${phase}`, { accepted: true, canonical });
    } catch { return null; }
  }

  function decorateMessage(message) {
    if (!recording || !message || !["COMPOSITION_MOVE", "COMPOSITION_ROTATE", "COMPOSITION_PIVOT"].includes(message.type)) return message;
    try {
      const diagnosticId = `geometry-${++nextMessageId}`;
      pendingMessages.set(diagnosticId, { type: message.type, order: order + 1 });
      if (pendingMessages.size > 32) pendingMessages.delete(pendingMessages.keys().next().value);
      capture(`${message.type.toLowerCase()}-sent`, { diagnosticId, payload: diagnosticMessagePayload(message.payload) });
      return { ...message, diagnosticId };
    } catch { return message; }
  }

  function recordResult(payload) {
    try {
      const pending = pendingMessages.get(payload?.diagnosticId);
      if (!pending) return;
      pendingMessages.delete(payload.diagnosticId);
      capture(`${pending.type.toLowerCase()}-result`, { diagnosticId: payload.diagnosticId,
        messageType: payload.messageType, accepted: payload.accepted === true, reason: payload.reason || null,
        diagnostics: safeJson(payload.diagnostics || null),
        at: payload.at || null, pendingOrder: pending.order });
    } catch { /* diagnostic collection must never affect a user interaction */ }
  }

  function report() {
    return { format: "wz-composition-geometry-diagnostic-v1", generatedAt: new Date().toISOString(),
      limits: { maxEvents: limit, movementSamplingMs: moveIntervalMs }, buffer: { retained: events.length, dropped },
      firstDisagreement: safeJson(firstDisagreement), events: safeJson(events) };
  }

  let activeKind = null;
  function observe(event) {
    if (!recording) return;
    const target = event.target?.closest?.("[data-rotation-pivot], [data-reset-rotation-pivot], [data-composition-rotate], [data-composition-move]");
    if (event.type === "pointerdown" && target) activeKind = target.hasAttribute("data-rotation-pivot") ? "pivot" :
      target.hasAttribute("data-reset-rotation-pivot") ? "reset-pivot" :
      target.hasAttribute("data-composition-rotate") ? "rotation" : "move";
    const kind = target ? (target.hasAttribute("data-rotation-pivot") ? "pivot" : target.hasAttribute("data-reset-rotation-pivot") ? "reset-pivot" :
      target.hasAttribute("data-composition-rotate") ? "rotation" : "move") : activeKind;
    if (!kind) return;
    if (event.type === "pointermove") {
      const now = Date.now();
      if (now - lastMoveAt < moveIntervalMs) return;
      lastMoveAt = now;
    }
    const label = kind === "pivot" && event.type === "dblclick" ? "pivot-confirm-or-edit" :
      kind === "reset-pivot" ? "reset-pivot" : `${kind}-${event.type}`;
    queueMicrotask(() => capture(label, { eventType: event.type, pointerId: event.pointerId ?? null,
      clientX: Number.isFinite(event.clientX) ? event.clientX : null, clientY: Number.isFinite(event.clientY) ? event.clientY : null,
      editMode: document.querySelector("#wz-selection-overlay [data-rotation-pivot]")?.getAttribute("aria-pressed") === "true" }));
    if (event.type === "pointerup" || event.type === "click" || event.type === "dblclick") activeKind = null;
  }

  const listeners = ["pointerdown", "pointermove", "pointerup", "dblclick", "click"].map(type => {
    const listener = event => observe(event);
    // Observe before document-level controllers consume the pointer event.
    window.addEventListener(type, listener, true);
    return [type, listener];
  });
  return {
    start() { this.clear(); canonical = null; activeKind = null; lastMoveAt = 0; recording = true; },
    stop() { recording = false; activeKind = null; pendingMessages.clear(); },
    status() { return { hasCapture: true, recording, retained: events.length, dropped, maxEvents: limit }; },
    capture,
    captureSync,
    decorateMessage,
    recordResult,
    report,
    clear() { events.length = 0; dropped = 0; order = 0; firstDisagreement = null; pendingMessages.clear(); },
    destroy() { listeners.forEach(([type, listener]) => window.removeEventListener(type, listener, true)); },
  };
}

export function installCompositionGeometryRecorderApi(window, recorder) {
  const api = {
    report: () => recorder.report(),
    json: () => JSON.stringify(recorder.report(), null, 2),
    async copy() {
      const json = api.json();
      if (!window.navigator?.clipboard?.writeText) throw new Error("Clipboard access is unavailable; use download() or json().");
      await window.navigator.clipboard.writeText(json);
      return "Composition geometry report copied.";
    },
    download() {
      const blob = new window.Blob([api.json()], { type: "application/json" });
      const url = window.URL.createObjectURL(blob), link = window.document.createElement("a");
      link.href = url; link.download = "composition-geometry-diagnostic.json"; link.click();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
      return "Composition geometry report downloaded.";
    },
    clear: () => recorder.clear(),
  };
  window.__WZ_COMPOSITION_GEOMETRY_RECORDER__ = api;
  return api;
}
