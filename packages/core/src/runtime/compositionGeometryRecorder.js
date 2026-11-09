import { rotatedPoint } from "./rotationGeometry.js";
import { activeWidget } from "./responsiveDOM.js";

const STORAGE_KEY = "wz:composition-geometry-recorder";
const MAX_EVENTS = 300;
const MAX_FRAMES = 1800;
const MOVE_INTERVAL_MS = 100;
const CORNER_TOLERANCE_PX = 2;
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const IDENTITY = { a: 1, b: 0, c: 0, d: 1 };

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

function multiplyLinear(parent, child) {
  return { a: parent.a * child.a + parent.c * child.b, b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d, d: parent.b * child.c + parent.d * child.d };
}

function linearTransform(value) {
  if (!value || value === "none") return { ...IDENTITY };
  const match = value.match(/^matrix(3d)?\(([^)]+)\)$/);
  if (!match) return null;
  const parts = match[2].split(",").map(Number);
  if (parts.some(part => !Number.isFinite(part))) return null;
  if (!match[1] && parts.length === 6) return { a: parts[0], b: parts[1], c: parts[2], d: parts[3] };
  if (match[1] && parts.length === 16 && Math.abs(parts[2]) < 1e-9 && Math.abs(parts[3]) < 1e-9 &&
      Math.abs(parts[6]) < 1e-9 && Math.abs(parts[7]) < 1e-9 && Math.abs(parts[8]) < 1e-9 &&
      Math.abs(parts[9]) < 1e-9 && Math.abs(parts[10] - 1) < 1e-9 && Math.abs(parts[11]) < 1e-9 &&
      Math.abs(parts[14]) < 1e-9 && Math.abs(parts[15] - 1) < 1e-9)
    return { a: parts[0], b: parts[1], c: parts[4], d: parts[5] };
  return null;
}

function transformChain(element, view) {
  let result = { ...IDENTITY };
  for (let current = element; current?.nodeType === 1; current = current.parentElement) {
    const style = view.getComputedStyle(current);
    if ((style.zoom && style.zoom !== "1" && style.zoom !== "normal") || (style.perspective && style.perspective !== "none") ||
        (style.translate && style.translate !== "none") || (style.rotate && style.rotate !== "none") || (style.scale && style.scale !== "none")) return null;
    const local = linearTransform(style.transform);
    if (!local) return null;
    result = multiplyLinear(local, result);
  }
  return result;
}

function borderBoxSize(element, style) {
  const contentWidth = Number.parseFloat(style.width), contentHeight = Number.parseFloat(style.height);
  const edge = (value, first, second, boxSizing) => {
    if (!Number.isFinite(value)) return null;
    if (boxSizing === "border-box") return value;
    return value + [first, second].reduce((sum, key) => sum + (Number.parseFloat(style[key]) || 0), 0);
  };
  return { width: edge(contentWidth, "paddingLeft", "paddingRight", style.boxSizing) ?? element.offsetWidth,
    height: edge(contentHeight, "paddingTop", "paddingBottom", style.boxSizing) ?? element.offsetHeight };
}

export function transformedCorners(element, view = element?.ownerDocument?.defaultView) {
  if (!element) return { points: null, source: "unavailable" };
  try {
    const quads = element.getBoxQuads?.({ box: "border" });
    const quad = quads?.[0];
    if (quad) return { points: [quad.p1, quad.p2, quad.p3, quad.p4].map(({ x, y }) => ({ x, y })), source: "getBoxQuads" };
  } catch { /* fall through to the explicitly marked bounds approximation */ }
  const rect = rectOf(element);
  const chain = transformChain(element, view);
  if (rect && chain) {
    const size = borderBoxSize(element, view.getComputedStyle(element));
    if (Number.isFinite(size.width) && Number.isFinite(size.height) && size.width >= 0 && size.height >= 0) {
      const local = [[0, 0], [size.width, 0], [size.width, size.height], [0, size.height]].map(([x, y]) =>
        ({ x: chain.a * x + chain.c * y, y: chain.b * x + chain.d * y }));
      const minX = Math.min(...local.map(point => point.x)), minY = Math.min(...local.map(point => point.y));
      const offsetX = rect.left - minX, offsetY = rect.top - minY;
      return { points: local.map(point => ({ x: point.x + offsetX, y: point.y + offsetY })), source: "dom-transform-chain" };
    }
  }
  return rect ? { points: [{ x: rect.left, y: rect.top }, { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom }, { x: rect.left, y: rect.bottom }], source: "axis-aligned-bounds-fallback",
    reason: chain ? "border-box-size-unavailable" : "unsupported-or-non-2d-transform-chain" } : { points: null, source: "unavailable" };
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
  const points = Array.from({ length: 4 }, (_, i) => ({ x: values[i * 2], y: values[i * 2 + 1] }));
  const matrix = polygon.ownerSVGElement?.getScreenCTM?.();
  if (matrix) return { points: points.map(point => ({ x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f })), source: "svg-screen-ctm" };
  return { points, source: "svg-user-space-coordinates-fallback" };
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

function canonicalBaseline(value) {
  const rect = value?.rect, frame = value?.frame;
  const valid = rect && frame && [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 && rect.height > 0 && Number.isFinite(frame.rotation || 0);
  return valid ? { available: true, ...safeJson(value) } : { available: false,
    reason: value ? "canonical-sync-missing-valid-frame-or-rect" : "no-canonical-sync-observed", observed: safeJson(value) };
}

function diagnosticMessagePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const keys = ["widgetId", "compositionId", "startRevision", "startFrame", "frame", "rotationPivot",
    "presentation", "presentationEpoch", "syncRevision"];
  return safeJson(Object.fromEntries(keys.filter(key => payload[key] !== undefined).map(key => [key, payload[key]])));
}

export function createCompositionGeometryRecorder({ window, document, selected, maxEvents = MAX_EVENTS, maxFrames = MAX_FRAMES, moveIntervalMs = MOVE_INTERVAL_MS }) {
  const events = [];
  const frames = [];
  const pendingMessages = new Map();
  let recording = true;
  let canonical = null, order = 0, dropped = 0, droppedFrames = 0, frameNumber = 0, lastMoveAt = 0, nextMessageId = 0, firstDisagreement = null;
  let frameCaptureEnabled = false, frameCaptureTruncated = false, frameRequest = null, activePointer = null, activePivotDrag = null, previousFrame = null;
  const nodeIds = new WeakMap(); let nextNodeId = 0;
  const limit = Math.max(1, Math.floor(maxEvents));
  const frameLimit = Math.max(1, Math.floor(maxFrames));

  function nodeId(element) {
    if (!element) return null;
    if (!nodeIds.has(element)) nodeIds.set(element, `node-${++nextNodeId}`);
    return nodeIds.get(element);
  }

  function geometry(widgetId) {
    const widget = widgetId ? activeWidget(document, widgetId) : null;
    const child = widget?.closest("[data-composition-child]"), area = child?.closest("[data-composition-id]");
    if (!widget || !child || !area) return { areaId: area?.dataset?.compositionId || null, geometryUnavailable: true,
      canonical: canonicalBaseline(canonical) };
    const areaData = { id: area.dataset.compositionId || null, width: Number(area.dataset.compositionWidth),
      height: Number(area.dataset.compositionHeight), bounds: rectOf(area) };
    const scale = areaData.width > 0 && areaData.bounds?.width ? areaData.bounds.width / areaData.width : null;
    const frame = safeJson(parseJson(child.dataset.compositionFrame || "null"));
    const image = widget.querySelector("img"), polygon = document.querySelector("#wz-selection-overlay svg polygon");
    const outlineCorners = pointFromPolygon(polygon), wrapperCorners = transformedCorners(child, window), imageCorners = transformedCorners(image, window);
    const baseline = canonicalBaseline(canonical);
    const expectedCorners = baseline.available ? expectedCanonicalCorners(canonical, areaData.bounds, scale) : null;
    const comparison = {
      wrapperToImage: comparePoints(wrapperCorners.points, imageCorners.points, [wrapperCorners.source, imageCorners.source]),
      outlineToWrapper: comparePoints(outlineCorners?.points || null, wrapperCorners.points, [outlineCorners?.source, wrapperCorners.source]),
      outlineToImage: comparePoints(outlineCorners?.points || null, imageCorners.points, [outlineCorners?.source, imageCorners.source]),
      canonicalToWrapper: comparePoints(expectedCorners, wrapperCorners.points, [wrapperCorners.source]),
      canonicalToImage: comparePoints(expectedCorners, imageCorners.points, [imageCorners.source]),
      canonicalToOutline: comparePoints(expectedCorners, outlineCorners?.points || null, [outlineCorners?.source]),
    };
    const issue = Object.entries(comparison).find(([, result]) => result.comparable && result.agrees === false);
    return { widget, child, area, imageElement: image, polygon, areaId: areaData.id, scale, frame,
      areaData, wrapperCorners, imageCorners, outlineCorners, comparison, issue,
      canonical: { ...baseline, ...(baseline.available ? { revisionMatches: canonical.revision === (child.dataset.compositionRevision || null) } : {}) },
      wrapper: { frame, revision: child.dataset.compositionRevision || null, rect: rectOf(child), corners: wrapperCorners,
        nodeId: nodeId(child), style: styleOf(child, window) },
      image: image ? { rect: rectOf(image), corners: imageCorners, naturalSize: { width: image.naturalWidth, height: image.naturalHeight },
        nodeId: nodeId(image), style: styleOf(image, window) } : null,
      outline: { corners: outlineCorners, pivot: centerOf(document.querySelector("#wz-selection-overlay [data-rotation-pivot]")),
        rotationHandle: centerOf(document.querySelector("#wz-selection-overlay [data-composition-rotate]")) } };
  }

  function snapshot(label, detail = {}) {
    const widgetId = selected();
    const base = { label, at: new Date().toISOString(), order: ++order, widgetId: widgetId || null, detail: safeJson(detail) };
    const measured = geometry(widgetId);
    if (measured.geometryUnavailable) return { ...base, ...measured };
    if (measured.issue && !firstDisagreement) firstDisagreement = { order: base.order, label, pair: measured.issue[0], maxErrorPx: measured.issue[1].maxErrorPx };
    const recorded = { ...measured };
    delete recorded.widget; delete recorded.child; delete recorded.area; delete recorded.imageElement; delete recorded.polygon;
    return { ...base, ...recorded, area: { ...measured.areaData, scale: measured.scale } };
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
      const widgetId = selected(), widget = activeWidget(document, widgetId);
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
      limits: { maxEvents: limit, maxFrames: frameLimit, movementSamplingMs: moveIntervalMs,
        frameSampling: "requestAnimationFrame while an opted-in pivot drag is active" },
      buffer: { retained: events.length, dropped },
      frameBuffer: { retained: frames.length, dropped: droppedFrames, truncated: frameCaptureTruncated },
      frameCaptureEnabled, firstDisagreement: safeJson(firstDisagreement), events: safeJson(events), frames: safeJson(frames) };
  }

  let activeKind = null;
  function cancelFrameLoop() {
    if (frameRequest !== null) window.cancelAnimationFrame?.(frameRequest);
    frameRequest = null;
  }

  function styleChanges(previous, current) {
    if (!previous) return [];
    const changes = [];
    for (const key of ["wrapper", "image"]) {
      if (previous[key]?.nodeId !== current[key]?.nodeId) changes.push({ element: key, type: "replaced",
        from: previous[key]?.nodeId || null, to: current[key]?.nodeId || null });
      if (JSON.stringify(previous[key]?.style) !== JSON.stringify(current[key]?.style)) changes.push({ element: key, type: "style-changed" });
    }
    return changes;
  }

  function captureFrame(phase, timestamp = window.performance?.now?.() ?? Date.now()) {
    if (!recording || !frameCaptureEnabled || frames.length >= frameLimit) {
      if (frames.length >= frameLimit) { droppedFrames++; frameCaptureTruncated = true; frameCaptureEnabled = false; }
      return;
    }
    try {
      const widgetId = selected(), measured = geometry(widgetId);
      const pointer = activePointer ? { id: activePointer.id, x: activePointer.x, y: activePointer.y } : null;
      const current = { wrapper: measured.wrapper, image: measured.image };
      const frame = { at: new Date().toISOString(), timestamp, frameNumber: ++frameNumber, order: ++order, phase,
        widgetId: widgetId || null, areaId: measured.areaId || null, presentation: measured.canonical?.presentation || "unknown",
        pointer, pivot: measured.outline?.pivot || null,
        canonical: safeJson(measured.canonical), area: measured.areaData ? { id: measured.areaData.id,
          axisAlignedBounds: measured.areaData.bounds, effectiveScale: measured.scale } : null,
        wrapper: measured.wrapper ? { axisAlignedBounds: measured.wrapper.rect, corners: measured.wrapper.corners, style: measured.wrapper.style,
          canonicalRotation: measured.frame?.rotation ?? null,
          renderedRotationDegrees: (() => { const matrix = linearTransform(measured.wrapper.style?.computed?.transform);
            return matrix ? Math.atan2(matrix.b, matrix.a) * 180 / Math.PI : null; })(),
          transformOrigin: measured.wrapper.style?.computed?.transformOrigin || null } : null,
        image: measured.image ? { axisAlignedBounds: measured.image.rect, corners: measured.image.corners, style: measured.image.style } : null,
        outline: measured.outline ? { corners: measured.outline.corners } : null,
        comparison: safeJson(measured.comparison || null), domChanges: styleChanges(previousFrame, current) };
      frames.push(frame);
      previousFrame = current;
    } catch { /* recording must not affect a user interaction */ }
    if (frames.length >= frameLimit) { frameCaptureTruncated = true; frameCaptureEnabled = false; cancelFrameLoop(); }
  }

  function scheduleFrameLoop() {
    if (!recording || !frameCaptureEnabled || !activePivotDrag || frameRequest !== null || typeof window.requestAnimationFrame !== "function") return;
    frameRequest = window.requestAnimationFrame(timestamp => {
      frameRequest = null;
      if (!recording || !frameCaptureEnabled || !activePivotDrag) return;
      captureFrame("pivot-drag-frame", timestamp);
      scheduleFrameLoop();
    });
  }

  function setFrameCapture(enabled) {
    if (!recording && enabled) return false;
    frameCaptureEnabled = enabled === true && !frameCaptureTruncated;
    if (!frameCaptureEnabled) cancelFrameLoop();
    else scheduleFrameLoop();
    return frameCaptureEnabled;
  }

  function observe(event) {
    if (!recording) return;
    const target = event.target?.closest?.("[data-rotation-pivot], [data-reset-rotation-pivot], [data-composition-rotate], [data-composition-move]");
    if (event.type === "pointerdown" && target) {
      activeKind = target.hasAttribute("data-rotation-pivot") ? "pivot" : target.hasAttribute("data-reset-rotation-pivot") ? "reset-pivot" :
        target.hasAttribute("data-composition-rotate") ? "rotation" : "move";
      if (activeKind === "pivot") activePointer = { id: event.pointerId ?? 1, target, startX: event.clientX || 0, startY: event.clientY || 0,
        x: Number.isFinite(event.clientX) ? event.clientX : null, y: Number.isFinite(event.clientY) ? event.clientY : null };
    }
    const kind = target ? (target.hasAttribute("data-rotation-pivot") ? "pivot" : target.hasAttribute("data-reset-rotation-pivot") ? "reset-pivot" :
      target.hasAttribute("data-composition-rotate") ? "rotation" : "move") : activeKind;
    if (!kind) return;
    if (event.type === "pointermove" && activePointer && (event.pointerId == null || event.pointerId === activePointer.id)) {
      activePointer.x = Number.isFinite(event.clientX) ? event.clientX : activePointer.x;
      activePointer.y = Number.isFinite(event.clientY) ? event.clientY : activePointer.y;
      if (!activePivotDrag && Math.hypot((activePointer.x ?? activePointer.startX) - activePointer.startX,
          (activePointer.y ?? activePointer.startY) - activePointer.startY) >= 3) {
        activePivotDrag = true;
        queueMicrotask(() => { capture("pivot-drag-start", { pointerId: activePointer?.id }); captureFrame("pivot-drag-start"); scheduleFrameLoop(); });
      }
      if (activePivotDrag) scheduleFrameLoop();
    }
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
    if ((event.type === "pointerup" || event.type === "pointercancel" || event.type === "lostpointercapture") && activePointer) {
      const wasDragging = activePivotDrag;
      activePointer.x = Number.isFinite(event.clientX) ? event.clientX : activePointer.x;
      activePointer.y = Number.isFinite(event.clientY) ? event.clientY : activePointer.y;
      cancelFrameLoop();
      queueMicrotask(() => { if (wasDragging) { captureFrame("pivot-drag-end"); capture("pivot-drag-end", { pointerId: activePointer?.id, cancelled: event.type !== "pointerup" }); }
        activePointer = null; activePivotDrag = null; previousFrame = null; });
    }
    if (event.type === "pointerup" || event.type === "click" || event.type === "dblclick") activeKind = null;
  }

  const listeners = ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture", "dblclick", "click"].map(type => {
    const listener = event => observe(event);
    // Observe before document-level controllers consume the pointer event.
    window.addEventListener(type, listener, true);
    return [type, listener];
  });
  return {
    start() { this.clear(); canonical = null; activeKind = null; activePointer = null; activePivotDrag = null; frameCaptureEnabled = false; frameCaptureTruncated = false; frameNumber = 0; lastMoveAt = 0; recording = true; },
    stop() { recording = false; frameCaptureEnabled = false; cancelFrameLoop(); activePointer = null; activePivotDrag = null; activeKind = null; pendingMessages.clear(); },
    setFrameCapture,
    status() { return { hasCapture: true, recording, retained: events.length, dropped, maxEvents: limit, frameCaptureEnabled,
      retainedFrames: frames.length, droppedFrames, maxFrames: frameLimit, frameCaptureTruncated }; },
    capture,
    captureSync,
    decorateMessage,
    recordResult,
    report,
    clear() { cancelFrameLoop(); events.length = 0; frames.length = 0; dropped = 0; droppedFrames = 0; frameNumber = 0; frameCaptureTruncated = false; frameCaptureEnabled = false; activePointer = null; activePivotDrag = null; previousFrame = null; order = 0; firstDisagreement = null; pendingMessages.clear(); },
    destroy() { this.stop(); listeners.forEach(([type, listener]) => window.removeEventListener(type, listener, true)); },
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
