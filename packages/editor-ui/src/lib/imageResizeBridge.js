import {
  IMAGE_WIDTH_SETTING,
  IMAGE_HEIGHT_SETTING,
  imageWidth,
  imageHeight,
  isImageWidth,
  isImageHeight,
  supportsImageResize,
  supportsImageStretch,
} from "@widgetizer/core/imageResize";
import useWidgetStore from "../stores/widgetStore";
import usePageStore from "../stores/pageStore";
import useAutoSave from "../stores/saveStore";

export function supportedImageWidgetIds(page, schemas) {
  return Object.entries(page?.widgets || {})
    .filter(([id, widget]) => id !== "header" && id !== "footer" && supportsImageResize(widget, schemas[widget.type]))
    .map(([id]) => id);
}

export function handleImageResizeMessage(event, iframeWindow, origin) {
  if (!iframeWindow || origin === "*" || event.source !== iframeWindow || event.origin !== origin) return false;
  const { type, payload } = event.data || {};
  if (
    type !== "IMAGE_RESIZE_COMMIT" ||
    !payload ||
    typeof payload.widgetId !== "string" ||
    !isImageWidth(payload.width) ||
    !isImageWidth(payload.startWidth)
  )
    return false;
  const { widgetId, width, startWidth, height, startHeight } = payload;
  const store = useWidgetStore.getState();
  const { page } = usePageStore.getState();
  if (
    store.selectedWidgetId !== widgetId ||
    store.selectedBlockId ||
    !supportedImageWidgetIds(page, store.schemas).includes(widgetId)
  )
    return false;
  const currentWidth = imageWidth(page.widgets[widgetId].settings?.[IMAGE_WIDTH_SETTING]);
  const widget = page.widgets[widgetId];
  const hasHeight = Object.hasOwn(payload, "height") || Object.hasOwn(payload, "startHeight");
  if (
    hasHeight &&
    (!supportsImageStretch(widget, store.schemas[widget.type]) ||
      !isImageHeight(height) ||
      !isImageHeight(startHeight) ||
      startHeight !== imageHeight(widget.settings?.[IMAGE_HEIGHT_SETTING]))
  )
    return false;
  if (startWidth !== currentWidth || (width === currentWidth && (!hasHeight || height === startHeight))) return false;
  usePageStore.getState().beginHistoryStep();
  store.updateWidgetSettingValues(widgetId, {
    [IMAGE_WIDTH_SETTING]: width,
    ...(hasHeight ? { [IMAGE_HEIGHT_SETTING]: height } : {}),
  });
  usePageStore.getState().beginHistoryStep();
  useAutoSave.getState().markWidgetModified(widgetId);
  return true;
}

export const IMAGE_SIZE_PREVIEW_EVENT = "widgetizer:image-size-preview";
export function imageSizePreview(widgetId, settingId, value, phase = "preview") {
  const store = useWidgetStore.getState();
  const widget = usePageStore.getState().page?.widgets?.[widgetId];
  if (
    !widget ||
    store.selectedWidgetId !== widgetId ||
    store.selectedBlockId ||
    !supportsImageResize(widget, store.schemas[widget.type])
  )
    return;
  const width = settingId === IMAGE_WIDTH_SETTING ? value : imageWidth(widget.settings?.[IMAGE_WIDTH_SETTING]);
  const height = settingId === IMAGE_HEIGHT_SETTING ? value : imageHeight(widget.settings?.[IMAGE_HEIGHT_SETTING]);
  if (!isImageWidth(width) || !isImageHeight(height)) return;
  window.dispatchEvent(
    new CustomEvent(IMAGE_SIZE_PREVIEW_EVENT, {
      detail: {
        widgetId,
        width,
        ...(supportsImageStretch(widget, store.schemas[widget.type]) ? { height } : {}),
        phase,
      },
    }),
  );
}
