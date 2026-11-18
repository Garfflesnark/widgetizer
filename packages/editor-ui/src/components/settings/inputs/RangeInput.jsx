import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";

/**
 * RangeInput component
 * Renders a styled range slider with numeric input
 */
export default function RangeInput({ id, value = 0, onChange, min = 0, max = 100, step = 1, unit = "" }) {
  const [localValue, setLocalValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  const drag = useRef(null);
  const interactionActive = useRef(false);

  const clampValue = (next) => Math.max(min, Math.min(Number(next), max));
  const normalizeStep = (next) => {
    const precision = String(step).split(".")[1]?.length || 0;
    return Number(Number(next).toFixed(Math.min(precision, 10)));
  };
  const setPreviewValue = (next) => {
    const normalized = normalizeStep(clampValue(next));
    setLocalValue(normalized);
    return normalized;
  };
  const releaseCapture = (session) => {
    const element = session?.element;
    if (!element?.releasePointerCapture) return;
    try {
      if (!element.hasPointerCapture || element.hasPointerCapture(session.pointerId)) {
        element.releasePointerCapture(session.pointerId);
      }
    } catch {
      // Browsers may already have released capture as part of cancellation.
    }
  };
  const finishPointer = (commit) => {
    const session = drag.current;
    if (!session) return;
    drag.current = null;
    interactionActive.current = false;
    setIsDragging(false);
    releaseCapture(session);
    if (commit) {
      setLocalValue(session.latest);
      onChange(session.latest);
    } else {
      setLocalValue(session.startValue);
    }
  };

  useEffect(() => () => {
    const session = drag.current;
    drag.current = null;
    interactionActive.current = false;
    releaseCapture(session);
  }, []);

  // Sync local value with prop value
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleSliderChange = (newValue) => {
    const clampedValue = setPreviewValue(newValue);

    if (!interactionActive.current) {
      // If not dragging (e.g., single click), commit immediately
      onChange(clampedValue);
    }
  };

  const handleSliderBeforeChange = () => {
    interactionActive.current = true;
    setIsDragging(true);
  };

  const handleSliderChangeComplete = (newValue) => {
    const clampedValue = setPreviewValue(newValue);
    interactionActive.current = false;
    setIsDragging(false);
    onChange(clampedValue);
  };

  const handleInputChange = (e) => {
    const inputValue = e.target.value === "" ? min : Number(e.target.value);
    const clampedValue = normalizeStep(clampValue(inputValue));
    setLocalValue(clampedValue);
    onChange(clampedValue);
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0 || !event.target.closest?.(".rc-slider")) return;
    const slider = event.currentTarget.querySelector(".rc-slider");
    const rect = slider?.getBoundingClientRect();
    if (!rect?.width) return;

    event.preventDefault();
    event.stopPropagation();
    slider.querySelector('[role="slider"]')?.focus();

    const startValue = Number(localValue);
    const session = {
      pointerId: event.pointerId,
      element: event.currentTarget,
      rect,
      startValue,
      latest: startValue,
    };
    drag.current = session;
    interactionActive.current = true;
    setIsDragging(true);
    session.element.setPointerCapture?.(event.pointerId);
    updateFromPointer(event.clientX, session);
  };

  const updateFromPointer = (clientX, session = drag.current) => {
    if (!session) return;
    const ratio = Math.max(0, Math.min(1, (clientX - session.rect.left) / session.rect.width));
    const increments = Math.round((ratio * (max - min)) / step);
    session.latest = setPreviewValue(min + increments * step);
  };

  const handlePointerMove = (event) => {
    const session = drag.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (event.buttons === 0) {
      updateFromPointer(event.clientX, session);
      finishPointer(true);
      return;
    }
    event.preventDefault();
    updateFromPointer(event.clientX, session);
  };

  const handlePointerUp = (event) => {
    const session = drag.current;
    if (session?.pointerId !== event.pointerId) return;
    updateFromPointer(event.clientX, session);
    finishPointer(true);
  };

  const handlePointerCancel = (event) => {
    if (!event || drag.current?.pointerId === event.pointerId) finishPointer(false);
  };

  const handleLostPointerCapture = (event) => {
    if (drag.current?.pointerId === event.pointerId) finishPointer(false);
  };

  return (
    <div
      className="flex items-center gap-4"
      onPointerDownCapture={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handleLostPointerCapture}
      style={{ touchAction: isDragging ? "none" : "pan-y" }}
    >
      <div className="flex-1">
        <Slider
          value={localValue}
          min={min}
          max={max}
          step={step}
          onChange={handleSliderChange}
          onBeforeChange={handleSliderBeforeChange}
          onChangeComplete={handleSliderChangeComplete}
          styles={{
            rail: { backgroundColor: "#e2e8f0", height: 6 },
            track: { backgroundColor: "#e0006d", height: 6 },
            handle: {
              backgroundColor: "#e0006d",
              border: "2px solid #ffffff",
              opacity: 1,
              width: "18px",
              height: "18px",
              marginTop: "-6px",
            },
          }}
        />
      </div>
      <div className="flex items-center">
        <input
          type="number"
          id={id}
          value={localValue}
          min={min}
          max={max}
          step={step}
          onChange={handleInputChange}
          onBlur={() => onChange(localValue)} // Ensure value is synced on blur
          className="form-input w-24 text-center"
        />
        {unit && <span className="ml-2 text-sm text-slate-500">{unit}</span>}
      </div>
      {isDragging && createPortal(
        <div
          data-testid="range-input-drag-shield"
          aria-hidden="true"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={handleLostPointerCapture}
          style={{ position: "fixed", inset: 0, zIndex: 100000, cursor: "ew-resize", touchAction: "none" }}
        />,
        document.body,
      )}
    </div>
  );
}
