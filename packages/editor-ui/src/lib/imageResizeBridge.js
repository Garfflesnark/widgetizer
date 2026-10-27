import { SCALE_WIDTH, SCALE_HEIGHT, isImageTransform, supportsImageTransform, legacyImageTransform } from "@widgetizer/core/imageTransform";
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
    typeof payload.widgetId !== "string"
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
  const selected = page.widgets[widgetId];
  if (Object.hasOwn(payload, "transform")) {
    const previous = isImageTransform(selected.settings?.image_transform) ? selected.settings.image_transform : null;
    if (!supportsImageTransform(selected, store.schemas[selected.type]) || !isImageTransform(payload.transform) ||
        JSON.stringify(previous) !== JSON.stringify(payload.startTransform) || JSON.stringify(previous) === JSON.stringify(payload.transform)) return false;
    usePageStore.getState().beginHistoryStep();
    store.updateWidgetSettingValues(widgetId, { image_transform: payload.transform });
    usePageStore.getState().beginHistoryStep();
    useAutoSave.getState().markWidgetModified(widgetId);
    return true;
  }
  if (!isImageWidth(width) || !isImageWidth(startWidth)) return false;
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
  if ([SCALE_WIDTH, SCALE_HEIGHT].includes(settingId)) {
    const transform = editedImageTransform(widgetId, settingId, value);
    if (!transform) return;
    window.dispatchEvent(new CustomEvent(IMAGE_SIZE_PREVIEW_EVENT, { detail: { widgetId, transform, phase } }));
    return;
  }
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

export function editedImageTransform(widgetId, settingId, value) {
  const store = useWidgetStore.getState();
  const widget = usePageStore.getState().page?.widgets?.[widgetId];
  const reference = store.imageGeometry[widgetId];
  if (!widget || !reference || reference.imageSource !== (widget.settings?.image || "") ||
      !supportsImageTransform(widget, store.schemas[widget.type]) || !Number.isFinite(value) || value < 0 || value > 400) return null;
  const transform = legacyImageTransform(widget, reference);
  transform.scale[settingId === SCALE_WIDTH ? "width" : "height"] = value === 0 ? null : value;
  const availableScale = 100 * reference.containerWidth * (1 - transform.flowInset.inlinePercent / 100) / reference.width;
  if (transform.scale.width !== null) transform.scale.width = Math.min(transform.scale.width, availableScale);
  else if (transform.scale.height !== null) transform.scale.height = Math.min(transform.scale.height, availableScale);
  return isImageTransform(transform) ? transform : null;
}
export function handleImageGeometryMessage(event, iframeWindow, origin) {
  if (!iframeWindow || origin === "*" || event.source !== iframeWindow || event.origin !== origin) return false;
  const p = event.data?.payload;
  const widget = usePageStore.getState().page?.widgets?.[p?.widgetId];
  const store = useWidgetStore.getState();
  if (!p || event.data.type !== "IMAGE_GEOMETRY_CONTEXT" || store.selectedWidgetId !== p.widgetId ||
      !supportsImageTransform(widget, store.schemas[widget?.type]) || p.imageSource !== (widget.settings?.image || "") ||
      ![p.width, p.height, p.containerWidth].every((n) => Number.isFinite(n) && n > 0 && n < 1e7) || p.width > p.containerWidth) return false;
  store.setImageGeometry(p.widgetId, p);
  return true;
}
