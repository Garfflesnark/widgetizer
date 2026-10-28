import { compositionContext, applyCompositionRect, resolvedCompositionRect, compositionFrame } from "./compositionDOM.js";
import { resizeAnchoredRect, resizePinnedRect } from "./anchoredResize.js";
import { imageReference, isImageTransform, rectTransform, transformRect, imageTransformV2 } from "./imageTransform.js";
import { isImageSpacing } from "./imageSpacing.js";
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
  let spacingDraft = null;
  let lastNodeClick = null;
  let pairedToggle = null;
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
      (compositionContext(widget)?.editable ?? true) &&
      supported.has(widget?.dataset.widgetId) &&
      widget?.dataset.widgetType === "image" &&
      !["header", "footer"].includes(widget?.dataset.widgetId) &&
      parts(widget).target
    );
  }
  function snapshot(widget) {
    const { target, image } = parts(widget);
    return {
      composition: compositionContext(widget),
      originalCompositionStyle: compositionContext(widget)?.child.getAttribute("style"),
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
    if (state.composition) {
      if (state.originalCompositionStyle === null) state.composition.child.removeAttribute("style");
      else state.composition.child.setAttribute("style", state.originalCompositionStyle);
    }
    state.target.style.width = state.originalWidth;
    state.target.style.marginInlineStart = state.originalInlineStart;
    state.target.style.marginInlineEnd = state.originalInlineEnd;
    state.target.style.paddingBlockStart = state.originalBlockStart;
    state.image.style.height = state.originalHeight;
    state.image.style.objectFit = state.originalFit;
  }
  function reference(widget) {
    const { target } = parts(widget);
    return imageReference(compositionContext(widget)?.width || target.parentElement.getBoundingClientRect().width,
      Number(widget.dataset.imageNaturalWidth), Number(widget.dataset.imageNaturalHeight));
  }
  function currentTransform(widget) {
    if (canonicalValues.has(widget.dataset.widgetId)) return canonicalValues.get(widget.dataset.widgetId).transform || null;
    if (widget.dataset.imageTransformVersion === "2") {
      try { const value = JSON.parse(widget.dataset.imageTransform); return isImageTransform(value) ? value : null; } catch { return null; }
    }
    if (widget.dataset.imageTransformVersion !== "1") return null;
    const nullable = (v) => v === "" || v === undefined ? null : Number(v);
    const value = { version: 1, reference: "intrinsic-fit", scale: {
      width: nullable(widget.dataset.imageTransformWidth), height: nullable(widget.dataset.imageTransformHeight) },
      flowInset: { inlinePercent: Number(widget.dataset.imageTransformInline), blockPercent: Number(widget.dataset.imageTransformBlock) } };
    return isImageTransform(value) ? value : null;
  }
  function applyTransform(state, transform, basis, override) {
    const rect = transformRect(transform, basis);
    if (state.composition) {
      const placed = override || resolvedCompositionRect(state.composition, rect);
      placed.left = Math.max(0, Math.min(state.composition.width - placed.width, placed.left));
      placed.top = Math.max(0, Math.min(state.composition.height - placed.height, placed.top));
      applyCompositionRect(state.composition, placed);
      return;
    }
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
    if (spacingDraft) {
      Object.assign(spacingDraft.container.style, spacingDraft.original);
      spacingDraft = null;
    }
    if (draft) {
      restore(draft);
      draft = null;
    }
  }
  function applySpacing(widget, spacing) {
    const container = widget.querySelector(".widget-container");
    if (!container || widget.dataset.imageSpacing !== "1" || !spacing) return;
    for (const [side, value] of Object.entries(spacing)) {
      if (!["top", "bottom"].includes(side) || (value !== null && !isImageSpacing(value))) continue;
      const axis = side === "top" ? "Start" : "End";
      container.style[`marginBlock${axis}`] = value === null ? "" : "0px";
      container.style[`paddingBlock${axis}`] = value === null ? "" : `${value}px`;
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
      onCommit(current.modern ? { widgetId: current.widgetId, transform: current.transform, startTransform: current.startTransform, ...(current.composition ? { frame: compositionFrame(current.composition, current.lastRect), startFrame: current.composition.frame } : {}) } : {
        widgetId: current.widgetId, width: current.width, startWidth: current.startWidth,
        ...(current.twoAxes ? { height: current.height, startHeight: current.startHeight } : {}),
      });
    }
    // A stationary click must retain the same node for native double-click detection.
    if (changed || !commit) onPreview();
    if (commit && (changed || current.dragged)) lastNodeClick = null;
    if (commit && !changed && !current.dragged && current.model?.version === 2) {
      const key = `${current.widgetId}:${current.direction}`, now = Date.now();
      if (lastNodeClick?.key === key && now - lastNodeClick.time <= 500) {
        lastNodeClick = null;
        pairedToggle = { key, time: now };
        toggleAnchor(find(current.widgetId), current.direction);
      } else lastNodeClick = { key, time: now };
    }
  }
  function toggleAnchor(widget, direction) {
    if (!widget) return;
    cancel();
    const previous = currentTransform(widget);
    const next = imageTransformV2({ settings: { image_transform: previous,
      image_width_percent: Number(widget.dataset.imageWidth), image_height_px: Number(widget.dataset.imageHeight) } }, reference(widget));
    const anchors = new Set(next.anchors || []);
    if (anchors.has(direction)) anchors.delete(direction); else anchors.add(direction);
    next.anchors = [...anchors].sort();
    onCommit({ widgetId: widget.dataset.widgetId, transform: next, startTransform: previous });
  }
  const cancel = () => {
    finish(false);
    cancelDraft();
    onPreview();
  };
  const move = (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gesture.dragged ||= Math.hypot(event.clientX - gesture.originX, event.clientY - gesture.originY) > 3;
    if (gesture.modern && gesture.shift !== !!event.shiftKey) rebaseShift(!!event.shiftKey);
    gesture.lastX = event.clientX; gesture.lastY = event.clientY;
    const dx = (event.clientX - gesture.startX) / (gesture.composition?.scale || 1);
    const dy = (event.clientY - gesture.startY) / (gesture.composition?.scale || 1);
    if (dx === 0 && dy === 0 && !gesture.moved && (gesture.modern ||
      (gesture.width === gesture.startWidth && gesture.height === gesture.startHeight))) { event.preventDefault(); return; }
    if (gesture.modern) {
      const bounds = {
        left: 0, top: 0, right: gesture.basis.containerWidth, maxTop: gesture.basis.height * 4,
        minWidth: gesture.model?.dimensions.width.unit === "px" ? 1 : gesture.basis.width / 100,
        minHeight: gesture.model?.dimensions.height.unit === "px" ? 1 : gesture.basis.height / 100,
        maxWidth: gesture.model?.dimensions.width.unit === "px" ? 10000 : gesture.basis.width * 4,
        maxHeight: gesture.model?.dimensions.height.unit === "px" ? 10000 : gesture.basis.height * 4,
      };
      if (gesture.composition) { bounds.bottom = gesture.composition.height; bounds.maxTop = gesture.composition.height; }
      const rect = gesture.model ? resizePinnedRect(gesture.rect, gesture.direction, dx, dy, bounds,
        { proportional: gesture.shift, pins: gesture.model.anchors || [] }) : resizeAnchoredRect(gesture.rect, gesture.direction, dx, dy, bounds);
      gesture.transform = rectTransform(rect, gesture.basis, gesture.model, gesture.everProportional ? "nsew" : gesture.direction);
      gesture.lastRect = transformRect(gesture.transform, gesture.basis);
      if (gesture.composition) {
        gesture.transform.flowInset = structuredClone(gesture.model.flowInset);
        gesture.lastRect = { ...gesture.lastRect, left: rect.left, top: rect.top };
      }
      const start = gesture.initialRect || gesture.rect;
      gesture.moved = Math.abs(gesture.lastRect.left - start.left) + Math.abs(gesture.lastRect.top - start.top) +
        Math.abs(gesture.lastRect.width - start.width) + Math.abs(gesture.lastRect.height - start.height) > 0.01;
      applyTransform(gesture, gesture.transform, gesture.basis, gesture.composition ? gesture.lastRect : undefined);
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
  function rebaseShift(enabled) {
    if (!gesture?.modern || gesture.shift === enabled) return;
    gesture.rect = { ...gesture.lastRect };
    gesture.startX = gesture.lastX; gesture.startY = gesture.lastY;
    gesture.shift = enabled;
    gesture.everProportional ||= enabled;
  }
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
    if (event.key === "Shift") rebaseShift(true);
    if (event.key === "Escape" && (gesture || draft)) {
      event.preventDefault();
      cancel();
    }
  };
  const keyUp = (event) => { if (event.key === "Shift") rebaseShift(false); };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", cancelPointer);
  document.addEventListener("lostpointercapture", cancelPointer);
  document.addEventListener("keydown", key);
  document.addEventListener("keyup", keyUp);
  document.defaultView.addEventListener("blur", cancel);
  return {
    cancel,
    setSupported(ids, stretchIds = [], transformIds = []) {
      transforms = new Set(transformIds);
      supported = new Set(ids);
      stretch = new Set(stretchIds);
      if (gesture && !supported.has(gesture.widgetId)) finish(false);
      if (draft && !supported.has(draft.widgetId)) cancelDraft();
      if (spacingDraft && !supported.has(spacingDraft.widgetId)) cancelDraft();
      for (const id of canonicalSizes.keys()) if (!supported.has(id)) {
        canonicalSizes.delete(id);
        canonicalValues.delete(id);
        contextKeys.delete(id);
      }
    },
    setSizes(sizes = {}, force = false) {
      // Undo can return to the last server-rendered state before its debounce
      // fires. Reconcile from store values even when no morph will be requested.
      for (const [widgetId, size] of Object.entries(sizes)) {
        const widget = find(widgetId);
        if (!size || (!eligible(widget, null) && !compositionContext(widget)) || !isImageWidth(size.width)) continue;
        const twoAxes = stretch.has(widgetId) && widget.hasAttribute("data-image-height");
        if (twoAxes && !isImageHeight(size.height)) continue;
        if (size.transform !== undefined && size.transform !== null && (!transforms.has(widgetId) || !isImageTransform(size.transform))) continue;
        canonicalValues.set(widgetId, size);
        const key = JSON.stringify([size.width, twoAxes ? size.height : "auto", size.transform || null, size.spacing, compositionContext(widget)?.frame]);
        if (!force && canonicalSizes.get(widgetId) === key) continue;
        if (gesture?.widgetId === widgetId) finish(false);
        if (draft?.widgetId === widgetId || spacingDraft?.widgetId === widgetId) cancelDraft();
        applySpacing(widget, size.spacing);
        if (isImageTransform(size.transform)) applyTransform(snapshot(widget), size.transform, reference(widget));
        else apply(snapshot(widget), size.width, twoAxes ? size.height : undefined);
        canonicalSizes.set(widgetId, key);
        if (transforms.has(widgetId)) onContext?.({ widgetId, ...reference(widget), hasCaption: !!widget.querySelector("figcaption"), naturalWidth: Number(widget.dataset.imageNaturalWidth), naturalHeight: Number(widget.dataset.imageNaturalHeight), imageSource: widget.dataset.imageSource || "" });
      }
      onPreview();
    },
    preview({ widgetId, width, height, transform, spacing, phase }) {
      if (phase === "cancel") {
        cancel();
        return;
      }
      const widget = find(widgetId);
      if (spacing !== undefined) {
        if (!eligible(widget, null) || widget.dataset.imageSpacing !== "1" || !spacing ||
          !Object.entries(spacing).every(([side, value]) => ["top", "bottom"].includes(side) && isImageSpacing(value))) return;
        const container = widget.querySelector(".widget-container");
        if (!container) return;
        finish(false);
        if (spacingDraft?.widgetId !== widgetId) {
          cancelDraft();
          spacingDraft = { widgetId, container, original: Object.fromEntries(["marginBlockStart", "marginBlockEnd", "paddingBlockStart", "paddingBlockEnd"].map((key) => [key, container.style[key]])) };
        }
        applySpacing(widget, spacing);
        if (phase === "commit") spacingDraft = null;
        onPreview(); return;
      }
      if (transform !== undefined) {
        if (!eligible(widget, null) || !transforms.has(widgetId) || !isImageTransform(transform)) return;
        finish(false);
        if (draft?.widgetId !== widgetId) { cancelDraft(); draft = snapshot(widget); }
        draft.transform = transform;
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
      return (eligible(widget, blockId) || (!blockId && compositionContext(widget))) ? parts(widget).image?.getBoundingClientRect() : null;
    },
    renderHandle(overlay, widget, blockId) {
      if (!eligible(widget, blockId)) return;
      const { target, image } = parts(widget);
      const widgetId = widget.dataset.widgetId;
      const modern = transforms.has(widgetId) && widget.dataset.imageTransformCapable === "true";
      if (modern) {
        const basis = reference(widget);
        const context = { widgetId, ...basis, hasCaption: !!widget.querySelector("figcaption"), naturalWidth: Number(widget.dataset.imageNaturalWidth), naturalHeight: Number(widget.dataset.imageNaturalHeight), imageSource: widget.dataset.imageSource || "" };
        const key = JSON.stringify(context);
        if (contextKeys.get(widgetId) !== key) {
          contextKeys.set(widgetId, key);
          if (!gesture && !draft && isImageTransform(currentTransform(widget))) applyTransform(snapshot(widget), currentTransform(widget), basis);
          onContext?.(context);
        }
      }
      const rect = image.getBoundingClientRect();
      const twoAxes = stretch.has(widgetId) && widget.hasAttribute("data-image-height");
      const visibleTransform = gesture?.widgetId === widgetId ? gesture.transform || gesture.model :
        draft?.widgetId === widgetId ? draft.transform : currentTransform(widget);
      const handleRadius = 6 * (Number(document.defaultView.getComputedStyle(document.documentElement).getPropertyValue("--wz-editor-inverse-zoom")) || 1);
      for (const direction of twoAxes ? ["nw", "n", "ne", "e", "se", "s", "sw", "w"] : ["e"]) {
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = "wz-image-resize-handle";
        handle.dataset.resizeDirection = direction;
        handle.setAttribute("aria-label", `Resize image ${direction} (or use Width and Height in the sidebar)`);
        const pinned = visibleTransform?.anchors?.includes(direction);
        handle.title = `${pinned ? "Anchored" : "Unanchored"}. Double-click to toggle anchor. Drag to stretch; Shift scales proportionally; Escape cancels.`;
        handle.setAttribute("aria-pressed", pinned ? "true" : "false");
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
          left: `${Math.max(0, Math.min(document.defaultView.innerWidth - 2 * handleRadius, x - handleRadius))}px`,
          top: `${Math.max(0, y - handleRadius)}px`,
          width: `${2 * handleRadius}px`,
          height: `${2 * handleRadius}px`,
          border: "2px solid white",
          borderRadius: "2px",
          background: pinned ? "#00e676" : "#e0006d",
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
            originX: event.clientX,
            originY: event.clientY,
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
              rect: gesture.composition ? { left: (bounds.left - gesture.composition.area.getBoundingClientRect().left) / gesture.composition.scale, top: (bounds.top - gesture.composition.area.getBoundingClientRect().top) / gesture.composition.scale, width: bounds.width / gesture.composition.scale, height: bounds.height / gesture.composition.scale } : { left: bounds.left - container.left, top: bounds.top - container.top, width: bounds.width, height: bounds.height } });
            if (widget.dataset.imageUnits === "2") gesture.model = imageTransformV2({ settings: {
              image_transform: currentTransform(widget), image_width_percent: Number(widget.dataset.imageWidth), image_height_px: Number(widget.dataset.imageHeight),
            } }, gesture.basis);
            Object.assign(gesture, { initialRect: { ...gesture.rect }, lastRect: { ...gesture.rect },
              lastX: event.clientX, lastY: event.clientY, shift: !!event.shiftKey, everProportional: !!event.shiftKey });
          }
          overlay.setPointerCapture?.(event.pointerId);
          event.preventDefault();
          event.stopPropagation();
        });
        handle.addEventListener("dblclick", (event) => {
          if (!modern || widget.dataset.imageUnits !== "2") return;
          event.preventDefault(); event.stopPropagation();
          // Overlay redraws can replace a node between clicks. Pointer pairing
          // handles that case; suppress its corresponding native dblclick.
          if (pairedToggle?.key === `${widgetId}:${direction}` && Date.now() - pairedToggle.time <= 500) { pairedToggle = null; return; }
          toggleAnchor(widget, direction);
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
      document.removeEventListener("keyup", keyUp);
      document.defaultView.removeEventListener("blur", cancel);
    },
  };
}
