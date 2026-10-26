export const IMAGE_WIDTH_SETTING = "image_width_percent";
export const MIN_IMAGE_WIDTH = 10;
export const MAX_IMAGE_WIDTH = 100;

export function isImageWidth(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= MIN_IMAGE_WIDTH &&
    value <= MAX_IMAGE_WIDTH
  );
}

export function imageWidth(value) {
  return isImageWidth(value) ? value : MAX_IMAGE_WIDTH;
}

export function supportsImageResize(widget, schema) {
  return (
    widget?.type === "image" &&
    schema?.type === "image" &&
    Array.isArray(schema.settings) &&
    schema.settings.some(
      (setting) =>
        setting.id === IMAGE_WIDTH_SETTING &&
        setting.type === "range" &&
        setting.min === MIN_IMAGE_WIDTH &&
        setting.max === MAX_IMAGE_WIDTH &&
        setting.step === 1 &&
        setting.default === MAX_IMAGE_WIDTH,
    )
  );
}

// Only temporary DOM styling happens during a gesture. The parent receives one
// completed value; cancelled gestures never enter the store or save pipeline.
export function createImageResizeController({ document, onCommit, onPreview }) {
  let gesture = null;
  let supported = new Set();

  function finish(commit) {
    if (!gesture) return;
    const current = gesture;
    gesture = null;
    if (!commit || current.width === current.startWidth) {
      current.target.style.width = current.originalStyle;
    }
    if (current.capture.hasPointerCapture?.(current.pointerId))
      current.capture.releasePointerCapture(current.pointerId);
    if (commit && current.width !== current.startWidth) {
      onCommit({ widgetId: current.widgetId, width: current.width, startWidth: current.startWidth });
    }
    onPreview();
  }

  const move = (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    // The figure is centered: moving its right edge changes both half-widths.
    const width = Math.round(gesture.startWidth + (200 * (event.clientX - gesture.startX)) / gesture.containerWidth);
    gesture.width = Math.max(MIN_IMAGE_WIDTH, Math.min(MAX_IMAGE_WIDTH, width));
    gesture.target.style.width = `${gesture.width}%`;
    event.preventDefault();
    onPreview();
  };
  const up = (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    move(event);
    finish(true);
  };
  const cancelPointer = (event) => {
    if (gesture && event.pointerId === gesture.pointerId) finish(false);
  };
  const key = (event) => {
    if (event.key === "Escape" && gesture) {
      event.preventDefault();
      finish(false);
    }
  };
  const blur = () => finish(false);
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", cancelPointer);
  document.addEventListener("lostpointercapture", cancelPointer);
  document.addEventListener("keydown", key);
  document.defaultView.addEventListener("blur", blur);

  return {
    cancel: () => finish(false),
    setSupported(ids) {
      const next = new Set(ids);
      if (gesture && !next.has(gesture.widgetId)) finish(false);
      supported = next;
    },
    renderHandle(overlay, widget, blockId) {
      const widgetId = widget?.dataset.widgetId;
      const target = widget?.querySelector("[data-image-resize-target]");
      if (
        !supported.has(widgetId) ||
        blockId ||
        !target ||
        widget.dataset.widgetType !== "image" ||
        widgetId === "header" ||
        widgetId === "footer"
      )
        return;
      const rect = target.getBoundingClientRect();
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "wz-image-resize-handle";
      handle.setAttribute("aria-label", "Resize image width (or use Width in the sidebar)");
      handle.title = "Drag to resize image width; Escape cancels";
      Object.assign(handle.style, {
        position: "absolute",
        left: `${rect.right - 7}px`,
        top: `${rect.top + rect.height / 2 - 16}px`,
        width: "14px",
        height: "32px",
        border: "2px solid white",
        borderRadius: "4px",
        background: "#e0006d",
        cursor: "ew-resize",
        pointerEvents: "auto",
        touchAction: "none",
      });
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || gesture) return;
        const containerWidth = target.parentElement.getBoundingClientRect().width;
        if (!(containerWidth > 0)) return;
        const startWidth = imageWidth(Number.parseFloat(target.style.width || widget.dataset.imageWidth));
        gesture = {
          target,
          widgetId,
          pointerId: event.pointerId,
          capture: overlay,
          containerWidth,
          startX: event.clientX,
          startWidth,
          width: startWidth,
          originalStyle: target.style.width,
        };
        overlay.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
      });
      overlay.appendChild(handle);
    },
    destroy() {
      finish(false);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancelPointer);
      document.removeEventListener("lostpointercapture", cancelPointer);
      document.removeEventListener("keydown", key);
      document.defaultView.removeEventListener("blur", blur);
    },
  };
}
