import { resizeAnchoredRect } from "./anchoredResize.js";
import { imageReference, isImageTransform, rectTransform, transformRect } from "./imageTransform.js";
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

export const IMAGE_HEIGHT_SETTING = "image_height_px";
export const MAX_IMAGE_HEIGHT = 2000;
export function isImageHeight(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_IMAGE_HEIGHT;
}
export function imageHeight(value) {
  return isImageHeight(value) ? value : 0;
}
export function supportsImageStretch(widget, schema) {
  return (
    supportsImageResize(widget, schema) &&
    schema.settings.some(
      (setting) =>
        setting.id === IMAGE_HEIGHT_SETTING &&
        setting.type === "range" &&
        setting.min === 0 &&
        setting.max === MAX_IMAGE_HEIGHT &&
        setting.step === 1 &&
        setting.default === 0,
    )
  );
}

// Gestures and sidebar drafts affect only DOM styles until a single store commit.
export function createImageResizeController({ document, onCommit, onPreview, onContext }) {
  let gesture = null;
  let draft = null;
  let supported = new Set();
  let stretch = new Set();
  const canonicalSizes = new Map();
  const canonicalValues = new Map();
  const contextKeys = new Map();
  let transforms = new Set();
  const find = (id) =>
    Array.from(document.querySelectorAll("[data-widget-id]")).find((el) => el.dataset.widgetId === id);
  function parts(widget) {
    const target = widget?.querySelector("[data-image-resize-target]");
    return { target, image: target?.querySelector("img") || target };
  }
  function eligible(widget, blockId) {
    return (
      !blockId &&
      supported.has(widget?.dataset.widgetId) &&
      widget?.dataset.widgetType === "image" &&
      !["header", "footer"].includes(widget?.dataset.widgetId) &&
      parts(widget).target
    );
  }
  function snapshot(widget) {
    const { target, image } = parts(widget);
    return {
      widgetId: widget.dataset.widgetId,
      target,
      image,
      originalWidth: target.style.width,
      originalInlineStart: target.style.marginInlineStart,
      originalInlineEnd: target.style.marginInlineEnd,
      originalBlockStart: target.style.paddingBlockStart,
      originalHeight: image.style.height,
      originalFit: image.style.objectFit,
    };
  }
  function restore(state) {
    state.target.style.width = state.originalWidth;
    state.target.style.marginInlineStart = state.originalInlineStart;
    state.target.style.marginInlineEnd = state.originalInlineEnd;
    state.target.style.paddingBlockStart = state.originalBlockStart;
    state.image.style.height = state.originalHeight;
    state.image.style.objectFit = state.originalFit;
  }
  function reference(widget) {
    const { target } = parts(widget);
    return imageReference(target.parentElement.getBoundingClientRect().width,
      Number(widget.dataset.imageNaturalWidth), Number(widget.dataset.imageNaturalHeight));
  }
  function currentTransform(widget) {
    if (canonicalValues.has(widget.dataset.widgetId)) return canonicalValues.get(widget.dataset.widgetId).transform || null;
    if (widget.dataset.imageTransformVersion !== "1") return null;
    const nullable = (v) => v === "" || v === undefined ? null : Number(v);
    const value = { version: 1, reference: "intrinsic-fit", scale: {
      width: nullable(widget.dataset.imageTransformWidth), height: nullable(widget.dataset.imageTransformHeight) },
      flowInset: { inlinePercent: Number(widget.dataset.imageTransformInline), blockPercent: Number(widget.dataset.imageTransformBlock) } };
    return isImageTransform(value) ? value : null;
  }
  function applyTransform(state, transform, basis) {
    const rect = transformRect(transform, basis);
    Object.assign(state.target.style, { width: `${rect.width}px`, marginInlineStart: `${rect.left}px`,
      marginInlineEnd: "0px", paddingBlockStart: `${rect.top}px` });
    state.image.style.height = `${rect.height}px`;
    state.image.style.objectFit = "fill";
  }
  function apply(state, width, height) {
    state.target.style.marginInlineStart = "auto";
    state.target.style.marginInlineEnd = "auto";
    state.target.style.paddingBlockStart = "0px";
    state.target.style.width = `${width}%`;
    if (height !== undefined) {
      state.image.style.height = height ? `${height}px` : "auto";
      state.image.style.objectFit = height ? "fill" : "";
    }
  }
  function cancelDraft() {
    if (draft) {
      restore(draft);
      draft = null;
    }
  }
  function finish(commit) {
    if (!gesture) return;
    const current = gesture;
    gesture = null;
    const changed = current.modern ? !!current.moved : current.width !== current.startWidth || current.height !== current.startHeight;
    if (!commit || !changed) restore(current);
    if (current.capture.hasPointerCapture?.(current.pointerId))
      current.capture.releasePointerCapture(current.pointerId);
    if (commit && changed) {
      onCommit(current.modern ? { widgetId: current.widgetId, transform: current.transform, startTransform: current.startTransform } : {
        widgetId: current.widgetId, width: current.width, startWidth: current.startWidth,
        ...(current.twoAxes ? { height: current.height, startHeight: current.startHeight } : {}),
      });
    }
    onPreview();
  }
  const cancel = () => {
    finish(false);
    cancelDraft();
    onPreview();
  };
  const move = (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (gesture.modern) {
      const rect = resizeAnchoredRect(gesture.rect, gesture.direction, dx, dy, {
        left: 0, top: 0, right: gesture.basis.containerWidth, maxTop: gesture.basis.height * 4,
        minWidth: gesture.basis.width / 100, minHeight: gesture.basis.height / 100,
        maxWidth: gesture.basis.width * 4, maxHeight: gesture.basis.height * 4,
      });
      gesture.transform = rectTransform(rect, gesture.basis);
      gesture.moved = Math.abs(rect.left - gesture.rect.left) + Math.abs(rect.top - gesture.rect.top) +
        Math.abs(rect.width - gesture.rect.width) + Math.abs(rect.height - gesture.rect.height) > 0.01;
      applyTransform(gesture, gesture.transform, gesture.basis);
      event.preventDefault(); onPreview(); return;
    }
    const xSign = gesture.direction.includes("w") ? -1 : 1;
    const ySign = gesture.direction.includes("n") ? -1 : 1;
    if (/[ew]/.test(gesture.direction)) {
      gesture.width = Math.max(
        MIN_IMAGE_WIDTH,
        Math.min(MAX_IMAGE_WIDTH, Math.round(gesture.startWidth + (xSign * 200 * dx) / gesture.containerWidth)),
      );
    }
    if (gesture.twoAxes && /[ns]/.test(gesture.direction)) {
      gesture.height =
        dy === 0
          ? gesture.startHeight
          : Math.max(1, Math.min(MAX_IMAGE_HEIGHT, Math.round(gesture.pixelHeight + ySign * dy)));
    }
    apply(gesture, gesture.width, gesture.twoAxes ? gesture.height : undefined);
    event.preventDefault();
    onPreview();
  };
  const up = (event) => {
    if (gesture && event.pointerId === gesture.pointerId) {
      move(event);
      finish(true);
    }
  };
  const cancelPointer = (event) => {
    if (gesture && event.pointerId === gesture.pointerId) finish(false);
  };
  const key = (event) => {
    if (event.key === "Escape" && (gesture || draft)) {
      event.preventDefault();
      cancel();
    }
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", cancelPointer);
  document.addEventListener("lostpointercapture", cancelPointer);
  document.addEventListener("keydown", key);
  document.defaultView.addEventListener("blur", cancel);
  return {
    cancel,
    setSupported(ids, stretchIds = [], transformIds = []) {
      transforms = new Set(transformIds);
      supported = new Set(ids);
      stretch = new Set(stretchIds);
      if (gesture && !supported.has(gesture.widgetId)) finish(false);
      if (draft && !supported.has(draft.widgetId)) cancelDraft();
      for (const id of canonicalSizes.keys()) if (!supported.has(id)) {
        canonicalSizes.delete(id);
        canonicalValues.delete(id);
        contextKeys.delete(id);
      }
    },
    setSizes(sizes = {}) {
      // Undo can return to the last server-rendered state before its debounce
      // fires. Reconcile from store values even when no morph will be requested.
      for (const [widgetId, size] of Object.entries(sizes)) {
        const widget = find(widgetId);
        if (!size || !eligible(widget, null) || !isImageWidth(size.width)) continue;
        const twoAxes = stretch.has(widgetId) && widget.hasAttribute("data-image-height");
        if (twoAxes && !isImageHeight(size.height)) continue;
        if (size.transform !== undefined && size.transform !== null && (!transforms.has(widgetId) || !isImageTransform(size.transform))) continue;
        canonicalValues.set(widgetId, size);
        const key = JSON.stringify([size.width, twoAxes ? size.height : "auto", size.transform || null]);
        if (canonicalSizes.get(widgetId) === key) continue;
        if (gesture?.widgetId === widgetId) finish(false);
        if (draft?.widgetId === widgetId) cancelDraft();
        if (isImageTransform(size.transform)) applyTransform(snapshot(widget), size.transform, reference(widget));
        else apply(snapshot(widget), size.width, twoAxes ? size.height : undefined);
        canonicalSizes.set(widgetId, key);
      }
      onPreview();
    },
    preview({ widgetId, width, height, transform, phase }) {
      if (phase === "cancel") {
        cancel();
        return;
      }
      const widget = find(widgetId);
      if (transform !== undefined) {
        if (!eligible(widget, null) || !transforms.has(widgetId) || !isImageTransform(transform)) return;
        finish(false);
        if (draft?.widgetId !== widgetId) { cancelDraft(); draft = snapshot(widget); }
        applyTransform(draft, transform, reference(widget));
        if (phase === "commit") draft = null;
        onPreview(); return;
      }
      if (
        !eligible(widget, null) ||
        !isImageWidth(width) ||
        (height !== undefined && (!stretch.has(widgetId) || !isImageHeight(height)))
      )
        return;
      finish(false);
      if (draft?.widgetId !== widgetId) {
        cancelDraft();
        draft = snapshot(widget);
      }
      apply(draft, width, height);
      if (phase === "commit") draft = null;
      onPreview();
    },
    selectionRect(widget, blockId) {
      return eligible(widget, blockId) ? parts(widget).image.getBoundingClientRect() : null;
    },
    renderHandle(overlay, widget, blockId) {
      if (!eligible(widget, blockId)) return;
      const { target, image } = parts(widget);
      const widgetId = widget.dataset.widgetId;
      const modern = transforms.has(widgetId) && widget.dataset.imageTransformCapable === "true";
      if (modern) {
        const basis = reference(widget);
        const context = { widgetId, ...basis, imageSource: widget.dataset.imageSource || "" };
        const key = JSON.stringify(context);
        if (contextKeys.get(widgetId) !== key) {
          contextKeys.set(widgetId, key);
          if (!gesture && !draft && isImageTransform(currentTransform(widget))) applyTransform(snapshot(widget), currentTransform(widget), basis);
          onContext?.(context);
        }
      }
      const rect = image.getBoundingClientRect();
      const twoAxes = stretch.has(widgetId) && widget.hasAttribute("data-image-height");
      for (const direction of twoAxes ? ["nw", "n", "ne", "e", "se", "s", "sw", "w"] : ["e"]) {
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = "wz-image-resize-handle";
        handle.dataset.resizeDirection = direction;
        handle.setAttribute("aria-label", `Resize image ${direction} (or use Width and Height in the sidebar)`);
        handle.title = "Drag to stretch image; Escape cancels";
        const x = direction.includes("w")
          ? rect.left
          : direction.includes("e")
            ? rect.right
            : rect.left + rect.width / 2;
        const y = direction.includes("n")
          ? rect.top
          : direction.includes("s")
            ? rect.bottom
            : rect.top + rect.height / 2;
        Object.assign(handle.style, {
          position: "absolute",
          left: `${x - 6}px`,
          top: `${y - 6}px`,
          width: "12px",
          height: "12px",
          border: "2px solid white",
          borderRadius: "2px",
          background: "#e0006d",
          cursor: `${direction}-resize`,
          pointerEvents: "auto",
          touchAction: "none",
        });
        handle.addEventListener("pointerdown", (event) => {
          if (event.button !== 0 || gesture) return;
          cancelDraft();
          const containerWidth = target.parentElement.getBoundingClientRect().width;
          if (!(containerWidth > 0)) return;
          const startWidth = imageWidth(Number.parseFloat(target.style.width || widget.dataset.imageWidth));
          const startHeight = imageHeight(Number.parseFloat(image.style.height || widget.dataset.imageHeight));
          gesture = {
            ...snapshot(widget),
            pointerId: event.pointerId,
            capture: overlay,
            containerWidth,
            startX: event.clientX,
            startY: event.clientY,
            startWidth,
            startHeight,
            width: startWidth,
            height: startHeight,
            pixelHeight: image.getBoundingClientRect().height,
            twoAxes,
            direction,
          };
          if (modern) {
            const container = target.parentElement.getBoundingClientRect();
            const bounds = image.getBoundingClientRect();
            Object.assign(gesture, { modern: true, basis: reference(widget), startTransform: currentTransform(widget), moved: false,
              rect: { left: bounds.left - container.left, top: bounds.top - container.top, width: bounds.width, height: bounds.height } });
          }
          overlay.setPointerCapture?.(event.pointerId);
          event.preventDefault();
          event.stopPropagation();
        });
        overlay.appendChild(handle);
      }
    },
    destroy() {
      cancel();
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancelPointer);
      document.removeEventListener("lostpointercapture", cancelPointer);
      document.removeEventListener("keydown", key);
      document.defaultView.removeEventListener("blur", cancel);
    },
  };
}
