import { IMAGE_WIDTH_SETTING, imageWidth, isImageWidth, supportsImageResize } from "@widgetizer/core/imageResize";
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
  const { widgetId, width, startWidth } = payload;
  const store = useWidgetStore.getState();
  const { page } = usePageStore.getState();
  if (
    store.selectedWidgetId !== widgetId ||
    store.selectedBlockId ||
    !supportedImageWidgetIds(page, store.schemas).includes(widgetId)
  )
    return false;
  const currentWidth = imageWidth(page.widgets[widgetId].settings?.[IMAGE_WIDTH_SETTING]);
  if (startWidth !== currentWidth || width === currentWidth) return false;
  usePageStore.getState().beginHistoryStep();
  store.updateWidgetSettingValues(widgetId, { [IMAGE_WIDTH_SETTING]: width });
  usePageStore.getState().beginHistoryStep();
  useAutoSave.getState().markWidgetModified(widgetId);
  return true;
}
