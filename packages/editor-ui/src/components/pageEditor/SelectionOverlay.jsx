import { supportsImageTransform, isImageTransform } from "@widgetizer/core/imageTransform";
import { editorHistoryState, performEditorHistory } from "../../lib/editorHistory";
import { supportsImageStretch, imageWidth, imageHeight } from "@widgetizer/core/imageResize";
import { handleImageResizeMessage, handleImageGeometryMessage, handleImageAlignmentMessage, supportedImageWidgetIds, IMAGE_SIZE_PREVIEW_EVENT } from "../../lib/imageResizeBridge";
import { useEffect, useCallback } from "react";
import useWidgetStore from "../../stores/widgetStore";
import usePageStore from "../../stores/pageStore";
import { scrollElementIntoView } from "../../queries/previewManager";
import { getPreviewTargetOrigin } from "../../lib/previewBase";

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
}) {
  // Get hover state from store
  const sidebarHoveredWidgetId = useWidgetStore((state) => state.hoveredWidgetId);
  const sidebarHoveredBlockId = useWidgetStore((state) => state.hoveredBlockId);
  const reorderWidgets = useWidgetStore((state) => state.reorderWidgets);
  const page = usePageStore((state) => state.page);
  const schemas = useWidgetStore((state) => state.schemas);

  useEffect(() => {
    const iframe = iframeRef?.current;
    if (!iframe) return;
    const sync = () => {
      const widgetIds = supportedImageWidgetIds(page, schemas);
      const stretchWidgetIds = widgetIds.filter((id) =>
        supportsImageStretch(page.widgets[id], schemas[page.widgets[id].type]),
      );
      const sizes = Object.fromEntries(widgetIds.map((id) => [id, {
        width: imageWidth(page.widgets[id].settings?.image_width_percent),
        height: imageHeight(page.widgets[id].settings?.image_height_px),
        transform: isImageTransform(page.widgets[id].settings?.image_transform) ? page.widgets[id].settings.image_transform : null,
      }]));
      iframe.contentWindow?.postMessage({
        type: "SET_IMAGE_RESIZE_SUPPORT", payload: { widgetIds, stretchWidgetIds, transformWidgetIds: widgetIds.filter((id) => supportsImageTransform(page.widgets[id], schemas[page.widgets[id].type])), sizes },
      }, getPreviewTargetOrigin());
    };
    const preview = (event) => iframe.contentWindow?.postMessage(
      { type: "IMAGE_SIZE_PREVIEW", payload: event.detail }, getPreviewTargetOrigin(),
    );
    window.addEventListener(IMAGE_SIZE_PREVIEW_EVENT, preview);
    sync();
    iframe.addEventListener("load", sync);
    return () => {
      iframe.removeEventListener("load", sync);
      window.removeEventListener(IMAGE_SIZE_PREVIEW_EVENT, preview);
    };
  }, [iframeRef, page, schemas, previewReadyKey]);

  useEffect(() => {
    const iframe = iframeRef?.current;
    if (!iframe) return;
    const sync = () => iframe.contentWindow?.postMessage({ type: "EDITOR_HISTORY_STATE", payload: editorHistoryState() }, getPreviewTargetOrigin());
    const unsubscribe = usePageStore.temporal.subscribe(sync);
    sync(); iframe.addEventListener("load", sync);
    return () => { unsubscribe(); iframe.removeEventListener("load", sync); };
  }, [iframeRef, previewReadyKey]);

  const effectiveWidgetId = selectedWidgetId || selectedGlobalWidgetId;

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
        payload: { widgetId: effectiveWidgetId, blockId: selectedBlockId },
      });
    } else {
      // Clear selection in iframe
      postToIframe({
        type: "UPDATE_SELECTION",
        payload: { widgetId: null, blockId: null },
      });
    }
  }, [effectiveWidgetId, selectedBlockId, iframeRef, postToIframe, structuralReloadRef]);

  // Listen for iframe messages
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === "IMAGE_ALIGN") {
        handleImageAlignmentMessage(event, iframeRef?.current?.contentWindow, getPreviewTargetOrigin());
        return;
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
  }, [effectiveWidgetId, selectedBlockId, onWidgetSelect, onBlockSelect, onGlobalWidgetSelect, iframeRef, page, reorderWidgets]);

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
      if (effectiveWidgetId) {
        postToIframe({
          type: "UPDATE_SELECTION",
          payload: { widgetId: effectiveWidgetId, blockId: selectedBlockId },
        });
      }
    };

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, [iframeRef, effectiveWidgetId, selectedBlockId, postToIframe]);

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
    if (previewReadyKey > 0 && effectiveWidgetId) {
      const timeoutId = setTimeout(() => {
        postToIframe({
          type: "UPDATE_SELECTION",
          payload: { widgetId: effectiveWidgetId, blockId: selectedBlockId },
        });
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [previewReadyKey, effectiveWidgetId, selectedBlockId, postToIframe]);

  // No visual rendering — overlay is inside the iframe
  return null;
}
