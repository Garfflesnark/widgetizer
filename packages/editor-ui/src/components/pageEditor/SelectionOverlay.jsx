import { compositionFor, compositionRevision } from "@widgetizer/core/composition";
import { compositionAdapters } from "@widgetizer/core/compositionImage";
import { serializeWyrmetizerEditorPage } from "@widgetizer/core/wyrmetizerLayouts";
import { resolveWyrmetizerPresentation } from "@widgetizer/core/wyrmetizerPresentation";
import { handleCompositionMessage, handleCompositionSelectionMessage, reorderContentBlock, handleOrderingMessage, compositionInteractionContext, handleCompositionLockMessage, pruneCompositionMovementLocks } from "../../lib/compositionActions";
import { supportsImageTransform, isImageTransform } from "@widgetizer/core/imageTransform";
import { imageSpacing, supportsImageSpacing } from "@widgetizer/core/imageSpacing";
import { editorHistoryState, performEditorHistory } from "../../lib/editorHistory";
import { supportsImageStretch, imageWidth, imageHeight } from "@widgetizer/core/imageResize";
import { handleImageResizeMessage, handleImageGeometryMessage, handleImageAlignmentMessage, supportedImageWidgetIds, IMAGE_SIZE_PREVIEW_EVENT } from "../../lib/imageResizeBridge";
import { useEffect, useCallback, useRef } from "react";
import useWidgetStore from "../../stores/widgetStore";
import usePageStore from "../../stores/pageStore";
import { scrollElementIntoView } from "../../queries/previewManager";
import { getPreviewTargetOrigin } from "../../lib/previewBase";

function responsiveV3(page) {
  return page?.wyrmetizerEditorLayout?.version === 3 || page?.layout?.version === 3;
}

function responsiveSyncData(page, schemas, viewportWidthPx) {
  const canonical = serializeWyrmetizerEditorPage(page, compositionAdapters);
  const view = resolveWyrmetizerPresentation(canonical, viewportWidthPx, { adapters: compositionAdapters });
  const widgetIds = supportedImageWidgetIds(canonical, schemas);
  const sizes = Object.fromEntries(widgetIds.map((id) => {
    const widget = view.widgets[id] || canonical.widgets[id];
    return [id, {
      width: imageWidth(widget.settings?.image_width_percent),
      height: imageHeight(widget.settings?.image_height_px),
      transform: isImageTransform(widget.settings?.image_transform) ? widget.settings.image_transform : null,
      ...(supportsImageSpacing(widget, schemas[widget.type]) ? { spacing: imageSpacing(widget.settings) } : {}),
    }];
  }));
  const areas = {};
  const revisions = {};
  for (const [areaId, area] of Object.entries(view.areas)) {
    if (area.mode !== "composition") continue;
    const { widthPx, heightPx, placements } = area.geometry;
    areas[areaId] = { mode: area.mode, widthPx, heightPx, readingOrder: area.readingOrder,
      stackOrder: area.stackOrder, placements: {} };
    for (const [id, placement] of Object.entries(placements)) {
      const frame = { x: placement.xPx / widthPx, y: placement.yPx / widthPx, pivot: placement.pivot,
        ...(placement.rotation ? { rotation: placement.rotation } : {}),
        ...(placement.rotationPivot ? { rotationPivot: placement.rotationPivot } : {}) };
      areas[areaId].placements[id] = { frame, rect: placement.rect };
      revisions[id] = compositionRevision(view.widgets[id], frame);
    }
  }
  return { presentation: view.presentation, sizes, areas, revisions };
}

function currentResponsiveMessage(payload, context, sequence) {
  return payload?.presentation === context?.presentation && payload?.presentationEpoch === context?.epoch &&
    payload?.syncRevision === sequence;
}

const RESPONSIVE_RUNTIME_MESSAGES = [
  "COMPOSITION_TOGGLE_IMAGE", "COMPOSITION_SELECTED", "ORDER_SELECTION", "IMAGE_ALIGN", "COMPOSITION_LOCK",
  "COMPOSITION_MOVE", "COMPOSITION_ROTATE", "COMPOSITION_PIVOT", "IMAGE_GEOMETRY_CONTEXT",
  "IMAGE_RESIZE_COMMIT", "REORDER_WIDGET", "WIDGET_SELECTED",
];
const RESPONSIVE_DESKTOP_ONLY_MESSAGES = [
  "COMPOSITION_TOGGLE_IMAGE", "ORDER_SELECTION", "IMAGE_ALIGN", "COMPOSITION_LOCK", "COMPOSITION_MOVE",
  "COMPOSITION_ROTATE", "COMPOSITION_PIVOT", "IMAGE_RESIZE_COMMIT", "REORDER_WIDGET",
];

/**
 * SelectionOverlay - Message relay between React stores and the preview iframe.
 *
 * The visual overlay (selection/hover boxes, labels, reorder buttons) is now
 * rendered inside the iframe by previewRuntime.js. This component is purely
 * a message bridge:
 *
 * ## Iframe → Parent messages handled:
 * - WIDGET_SELECTED → calls onWidgetSelect / onBlockSelect / onGlobalWidgetSelect
 * - REORDER_WIDGET → calls reorderWidgets from store
 * Note: PREVIEW_READY is handled by PreviewPanel for scroll restoration
 *
 * ## Parent → Iframe messages sent:
 * - SCROLL_TO_ELEMENT — when selection changes
 * - UPDATE_SELECTION — when selection changes
 * - SIDEBAR_HOVER — when sidebar hover state changes
 */
export default function SelectionOverlay({
  iframeRef,
  selectedWidgetId,
  selectedBlockId,
  selectedGlobalWidgetId,
  onWidgetSelect,
  onBlockSelect,
  onGlobalWidgetSelect,
  previewReadyKey,
  structuralReloadRef,
  editorZoom = 1,
  previewMode = "desktop",
}) {
  const page = usePageStore((state) => state.page);
  const responsiveContextRef = useRef({ presentation: previewMode === "mobile" ? "mobile" : "desktop", epoch: 0 });
  const responsiveSyncSequenceRef = useRef(0);
  const updateResponsiveContext = useCallback((payload) => {
    responsiveContextRef.current = { presentation: payload?.presentation, epoch: payload?.epoch,
      syncRevision: responsiveSyncSequenceRef.current };
    if (payload?.presentation) useWidgetStore.getState().setCompositionContext(payload.presentation === "mobile" ? "mobile" : previewMode);
  }, [previewMode]);
  useEffect(() => {
    const preview = event => {
      const context = responsiveContextRef.current;
      if (responsiveV3(page) && context.presentation !== "desktop") return;
      iframeRef?.current?.contentWindow?.postMessage({ type: "COMPOSITION_NUMERIC_PREVIEW", payload: {
        ...event.detail,
        ...(responsiveV3(page) ? { presentation: context.presentation, presentationEpoch: context.epoch, syncRevision: responsiveSyncSequenceRef.current } : {}),
      } }, getPreviewTargetOrigin());
    };
    window.addEventListener("wyrmetizer:numeric-preview", preview);
    return () => window.removeEventListener("wyrmetizer:numeric-preview", preview);
  }, [iframeRef, page]);
  useEffect(() => {
    const iframe = iframeRef?.current;
    if (!iframe) return;
    const sync = () => iframe.contentWindow?.postMessage({ type: "EDITOR_ZOOM", payload: editorZoom }, getPreviewTargetOrigin());
    sync(); iframe.addEventListener("load", sync);
    return () => iframe.removeEventListener("load", sync);
  }, [iframeRef, editorZoom, previewReadyKey]);

  // Get hover state from store
  const sidebarHoveredWidgetId = useWidgetStore((state) => state.hoveredWidgetId);
  const sidebarHoveredBlockId = useWidgetStore((state) => state.hoveredBlockId);
  const reorderWidgets = useWidgetStore((state) => state.reorderWidgets);
  const schemas = useWidgetStore((state) => state.schemas);
  const movementLocks = useWidgetStore((state) => state.compositionMovementLocks);
  const compositionLayoutContext = useWidgetStore((state) => state.compositionContext);
  useEffect(() => {
    const iframe = iframeRef?.current;
    if (!iframe) return;
    const sync = (force = false) => {
      const isResponsive = responsiveV3(page);
      let widgetIds = supportedImageWidgetIds(page, schemas);
      const stretchWidgetIds = widgetIds.filter((id) =>
        supportsImageStretch(page.widgets[id], schemas[page.widgets[id].type]),
      );
      let sizes = Object.fromEntries(widgetIds.map((id) => [id, {
        width: imageWidth(page.widgets[id].settings?.image_width_percent),
        height: imageHeight(page.widgets[id].settings?.image_height_px),
        transform: isImageTransform(page.widgets[id].settings?.image_transform) ? page.widgets[id].settings.image_transform : null,
        ...(supportsImageSpacing(page.widgets[id], schemas[page.widgets[id].type]) ? { spacing: imageSpacing(page.widgets[id].settings) } : {}),
      }]));
      let revisions = Object.fromEntries(widgetIds.filter(id => compositionFor(page, id)).map(id => [id, compositionRevision(page.widgets[id], compositionFor(page, id)[1].placements[id].frames.desktop)]));
      let responsivePresentation;
      let syncRevision;
      let presentationEpoch;
      if (isResponsive) {
        let viewportWidthPx = previewMode === "mobile" ? 390 : previewMode === "tablet" ? 900 : 1200;
        try { if (iframe.contentWindow?.innerWidth > 0) viewportWidthPx = iframe.contentWindow.innerWidth; } catch { /* use editor preview width */ }
        const resolved = responsiveSyncData(page, schemas, viewportWidthPx);
        widgetIds = supportedImageWidgetIds(serializeWyrmetizerEditorPage(page, compositionAdapters), schemas);
        sizes = resolved.sizes;
        revisions = resolved.revisions;
        responsivePresentation = { presentation: resolved.presentation, areas: resolved.areas };
        presentationEpoch = responsiveContextRef.current.epoch;
        syncRevision = ++responsiveSyncSequenceRef.current;
        responsiveContextRef.current = { ...responsiveContextRef.current, presentation: resolved.presentation, syncRevision };
      }
      iframe.contentWindow?.postMessage({ type: "COMPOSITION_SYNC", force: force === true, context: compositionInteractionContext(), movementLocks: pruneCompositionMovementLocks(), payload: page?.layout, sizes, revisions,
        ...(isResponsive ? { responsive: true, presentation: responsivePresentation.presentation, presentationEpoch, syncRevision, resolvedPresentation: responsivePresentation } : {}) }, getPreviewTargetOrigin());
      iframe.contentWindow?.postMessage({
        type: "SET_IMAGE_RESIZE_SUPPORT", payload: { widgetIds, stretchWidgetIds, transformWidgetIds: widgetIds.filter((id) => supportsImageTransform(page.widgets[id], schemas[page.widgets[id].type])), sizes,
          ...(isResponsive ? { responsive: true, presentation: responsivePresentation.presentation, presentationEpoch, syncRevision } : {}) },
      }, getPreviewTargetOrigin());
    };
    const preview = (event) => {
      const context = responsiveContextRef.current;
      iframe.contentWindow?.postMessage({ type: "IMAGE_SIZE_PREVIEW", payload: {
        ...event.detail,
        ...(responsiveV3(page) ? { presentation: context.presentation, presentationEpoch: context.epoch, syncRevision: responsiveSyncSequenceRef.current } : {}),
      } }, getPreviewTargetOrigin());
    };
    const reconcile = () => sync(true);
    const presentationChanged = (event) => {
      if (event.source !== iframe.contentWindow || event.origin !== getPreviewTargetOrigin() || event.data?.type !== "PRESENTATION_CONTEXT") return;
      updateResponsiveContext(event.data.payload);
      if (responsiveV3(page)) sync(true);
    };
    window.addEventListener("widgetizer:composition-reconcile", reconcile);
    window.addEventListener(IMAGE_SIZE_PREVIEW_EVENT, preview);
    window.addEventListener("message", presentationChanged);
    sync();
    iframe.addEventListener("load", sync);
    return () => {
      iframe.removeEventListener("load", sync);
      window.removeEventListener(IMAGE_SIZE_PREVIEW_EVENT, preview);
      window.removeEventListener("widgetizer:composition-reconcile", reconcile);
      window.removeEventListener("message", presentationChanged);
    };
  }, [iframeRef, page, schemas, previewReadyKey, compositionLayoutContext, movementLocks, previewMode, updateResponsiveContext]);

  useEffect(() => {
    const iframe = iframeRef?.current;
    if (!iframe) return;
    const sync = () => iframe.contentWindow?.postMessage({ type: "EDITOR_HISTORY_STATE", payload: editorHistoryState() }, getPreviewTargetOrigin());
    const unsubscribe = usePageStore.temporal.subscribe(sync);
    sync(); iframe.addEventListener("load", sync);
    return () => { unsubscribe(); iframe.removeEventListener("load", sync); };
  }, [iframeRef, previewReadyKey]);

  const selectedCompositionId = useWidgetStore((state) => state.selectedCompositionId);
  const effectiveWidgetId = selectedCompositionId ? null : selectedWidgetId || selectedGlobalWidgetId;
  useEffect(() => {
    if (selectedCompositionId && !page?.wyrmetizerEditorLayout?.areas?.[selectedCompositionId] &&
        !page?.layout?.compositions?.[selectedCompositionId]) useWidgetStore.getState().setSelectedCompositionId(null);
  }, [page, selectedCompositionId]);

  // Send message to iframe
  const postToIframe = useCallback(
    (message) => {
      const iframe = iframeRef?.current;
      if (!iframe?.contentWindow) return;
      iframe.contentWindow.postMessage(message, getPreviewTargetOrigin());
    },
    [iframeRef],
  );

  // Scroll and update selection when it changes
  useEffect(() => {
    if (effectiveWidgetId) {
      // Check the ref — it's set synchronously during PreviewPanel's render phase,
      // so it's already up-to-date when this effect fires.
      if (!structuralReloadRef?.current && iframeRef?.current) {
        scrollElementIntoView(iframeRef.current, effectiveWidgetId, selectedBlockId);
      }
      // Always send selection update (even during reload — it queues for the new iframe)
      postToIframe({
        type: "UPDATE_SELECTION",
        payload: { widgetId: effectiveWidgetId, blockId: selectedBlockId, compositionId: selectedCompositionId },
      });
    } else {
      // Clear selection in iframe
      postToIframe({
        type: "UPDATE_SELECTION",
        payload: { widgetId: null, blockId: null, compositionId: selectedCompositionId },
      });
    }
  }, [effectiveWidgetId, selectedBlockId, selectedCompositionId, iframeRef, postToIframe, structuralReloadRef]);

  // Listen for iframe messages
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.source === iframeRef?.current?.contentWindow && event.origin === getPreviewTargetOrigin() && event.data?.type === "PRESENTATION_CONTEXT") {
        updateResponsiveContext(event.data.payload);
        return;
      }
      if (responsiveV3(page) && event.source === iframeRef?.current?.contentWindow && event.origin === getPreviewTargetOrigin() &&
          RESPONSIVE_RUNTIME_MESSAGES.includes(event.data?.type)) {
        if (!currentResponsiveMessage(event.data.payload, responsiveContextRef.current, responsiveSyncSequenceRef.current)) return;
        if (responsiveContextRef.current.presentation !== "desktop" && RESPONSIVE_DESKTOP_ONLY_MESSAGES.includes(event.data.type)) return;
      }
      if (event.data?.type === "COMPOSITION_TOGGLE_IMAGE") {
        handleCompositionSelectionMessage(event, iframeRef?.current?.contentWindow, getPreviewTargetOrigin()); return;
      }
      if (event.data?.type === "ORDER_SELECTION") {
        handleOrderingMessage(event, iframeRef?.current?.contentWindow, getPreviewTargetOrigin()); return;
      }
      if (event.data?.type === "COMPOSITION_SELECTED") {
        if (event.source === iframeRef?.current?.contentWindow && event.origin === getPreviewTargetOrigin()) useWidgetStore.getState().setSelectedCompositionId(event.data.payload?.compositionId);
        return;
      }
      if (event.data?.type === "IMAGE_ALIGN") {
        handleImageAlignmentMessage(event, iframeRef?.current?.contentWindow, getPreviewTargetOrigin());
        return;
      }
      if (event.data?.type === "COMPOSITION_LOCK") {
        handleCompositionLockMessage(event, iframeRef?.current?.contentWindow, getPreviewTargetOrigin()); return;
      }
      if (["COMPOSITION_MOVE", "COMPOSITION_ROTATE", "COMPOSITION_PIVOT"].includes(event.data?.type)) {
        handleCompositionMessage(event, iframeRef?.current?.contentWindow, getPreviewTargetOrigin()); return;
      }
      if (event.data?.type === "IMAGE_GEOMETRY_CONTEXT") {
        handleImageGeometryMessage(event, iframeRef?.current?.contentWindow, getPreviewTargetOrigin());
        return;
      }
      if (event.data?.type === "EDITOR_HISTORY_SHORTCUT") {
        if (event.source === iframeRef?.current?.contentWindow && event.origin === getPreviewTargetOrigin() && event.origin !== "null") {
          performEditorHistory(event.data.payload?.command);
        }
        return;
      }
      if (event.data?.type === "IMAGE_RESIZE_COMMIT") {
        handleImageResizeMessage(event, iframeRef?.current?.contentWindow, getPreviewTargetOrigin());
        return;
      }
      if (event.source !== iframeRef?.current?.contentWindow || event.origin !== getPreviewTargetOrigin()) return;
      const { type, payload } = event.data || {};

      switch (type) {
        case "WIDGET_SELECTED":
          if (payload.widgetId === "header" || payload.widgetId === "footer") {
            onGlobalWidgetSelect?.(payload.widgetId);
          } else {
            onWidgetSelect?.(payload.widgetId);
          }
          if (payload.blockId) {
            onBlockSelect?.(payload.blockId);
          }
          break;

        case "REORDER_WIDGET": {
          const { widgetId, direction } = payload;
          if (useWidgetStore.getState().selectedWidgetId !== widgetId || useWidgetStore.getState().selectedCompositionId) break;
          if (page?.layout) { reorderContentBlock(widgetId, direction); break; }
          const currentOrder = page?.widgetsOrder;
          if (!currentOrder || !widgetId) break;

          const index = currentOrder.indexOf(widgetId);
          if (index === -1) break;

          if (direction === "up" && index > 0) {
            const newOrder = [...currentOrder];
            [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
            reorderWidgets(newOrder);
          } else if (direction === "down" && index < currentOrder.length - 1) {
            const newOrder = [...currentOrder];
            [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
            reorderWidgets(newOrder);
          }
          break;
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [effectiveWidgetId, selectedBlockId, onWidgetSelect, onBlockSelect, onGlobalWidgetSelect, iframeRef, page, reorderWidgets, updateResponsiveContext]);

  // Send sidebar hover state to iframe
  useEffect(() => {
    postToIframe({
      type: "SIDEBAR_HOVER",
      payload: {
        widgetId: sidebarHoveredWidgetId || null,
        blockId: sidebarHoveredBlockId || null,
      },
    });
  }, [sidebarHoveredWidgetId, sidebarHoveredBlockId, postToIframe]);

  // Sync on iframe load
  useEffect(() => {
    const iframe = iframeRef?.current;
    if (!iframe) return;

    const handleLoad = () => {
      if (effectiveWidgetId || selectedCompositionId) {
        postToIframe({
          type: "UPDATE_SELECTION",
          payload: { widgetId: effectiveWidgetId, blockId: selectedBlockId, compositionId: selectedCompositionId },
        });
      }
    };

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, [iframeRef, effectiveWidgetId, selectedBlockId, selectedCompositionId, postToIframe]);

  // Sync on iframe resize (handles preview mode changes, NOT structural reloads)
  useEffect(() => {
    const iframe = iframeRef?.current;
    if (!iframe) return;

    const resizeObserver = new ResizeObserver(() => {
      if (effectiveWidgetId && !structuralReloadRef?.current) {
        scrollElementIntoView(iframe, effectiveWidgetId, selectedBlockId);
      }
    });

    resizeObserver.observe(iframe);

    return () => {
      resizeObserver.disconnect();
    };
  }, [iframeRef, effectiveWidgetId, selectedBlockId, structuralReloadRef]);

  // Re-request selection sync when preview content changes
  useEffect(() => {
    if (previewReadyKey > 0 && (effectiveWidgetId || selectedCompositionId)) {
      const timeoutId = setTimeout(() => {
        postToIframe({
          type: "UPDATE_SELECTION",
          payload: { widgetId: effectiveWidgetId, blockId: selectedBlockId, compositionId: selectedCompositionId },
        });
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [previewReadyKey, effectiveWidgetId, selectedBlockId, selectedCompositionId, postToIframe]);

  // No visual rendering — overlay is inside the iframe
  return null;
}
