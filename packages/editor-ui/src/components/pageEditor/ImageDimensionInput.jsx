import { SCALE_WIDTH, SCALE_HEIGHT } from "@widgetizer/core/imageTransform";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import { imageSizePreview } from "../../lib/imageResizeBridge";
import { IMAGE_HEIGHT_SETTING } from "@widgetizer/core/imageResize";

// Image-only transient feedback bypasses PreviewPanel's server-render debounce.
export default function ImageDimensionInput({ widgetId, setting, value = setting.default, label, onChange, disabled = false, onUnitChange, naturalScale = false }) {
  const [local, setLocal] = useState(value);
  const active = useRef(false);
  const cancelled = useRef(false);
  const latest = useRef(value);
  const saved = useRef(value);
  const pointer = useRef(null);
  const sliderActive = useRef(false);
  const [shield, setShield] = useState(false);
  const actions = useRef({});
  saved.current = value;
  const height = setting.id === IMAGE_HEIGHT_SETTING;
  const modern = [SCALE_WIDTH, SCALE_HEIGHT].includes(setting.id);
  const sliderMin = setting.sliderMin ?? setting.min;
  const sliderMax = setting.sliderMax ?? setting.max;
  const hasAuto = height || (modern && !onUnitChange);
  const release = () => {
    const session = pointer.current;
    pointer.current = null;
    sliderActive.current = false;
    setShield(false);
    if (session?.element.hasPointerCapture?.(session.id)) session.element.releasePointerCapture(session.id);
  };
  const send = (next, phase) => imageSizePreview(widgetId, setting.id, next, phase);
  const cancel = () => {
    if (!active.current) return;
    active.current = false;
    release();
    cancelled.current = true;
    latest.current = saved.current;
    setLocal(saved.current);
    send(saved.current, "cancel");
  };
  useEffect(() => {
    setLocal(value);
    latest.current = value;
    active.current = false;
    release();
  }, [value]);
  useEffect(() => {
    const blur = () => cancel();
    const up = (event) => { if (sliderActive.current && (!pointer.current || event.type === "mouseup" || pointer.current.id === event.pointerId)) actions.current.commit(); };
    window.addEventListener("blur", blur);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("mouseup", up, true);
    return () => {
      window.removeEventListener("blur", blur);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("mouseup", up, true);
      release();
      if (active.current) imageSizePreview(widgetId, setting.id, saved.current, "cancel");
    };
    // The saved value is read through a ref, so unmount cancels the current draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetId, setting.id, setting.unit]);
  const begin = () => {
    active.current = true;
    cancelled.current = false;
  };
  const preview = (next) => {
    if (!Number.isFinite(next)) return;
    next = Math.round(Math.max(setting.min, Math.min(setting.max, next)) * 100) / 100;
    if (modern && next > 0 && next < 1) next = 1;
    if (!active.current) begin();
    latest.current = next;
    setLocal(next);
    send(next, "preview");
  };
  const commit = (next = latest.current) => {
    if (!active.current || cancelled.current || !Number.isFinite(next)) return;
    next = Math.round(Math.max(setting.min, Math.min(setting.max, next)) * 100) / 100;
    if (modern && next > 0 && next < 1) next = 1;
    active.current = false;
    release();
    latest.current = next;
    cancelled.current = true;
    setLocal(next);
    // Keep the transient style until the committed Liquid HTML arrives.
    send(next, "commit");
    if (next !== saved.current && onChange(setting.id, next) === false) {
      latest.current = saved.current; setLocal(saved.current); send(saved.current, "cancel");
    }
  };
  actions.current = { commit };
  const id = `${widgetId}-${setting.id}`;
  return (
    <div
      onPointerCancel={cancel}
      onLostPointerCapture={(event) => { if (pointer.current?.id === event.pointerId) cancel(); }}
      onPointerDownCapture={(event) => {
        if (disabled || event.button !== 0 || !event.target.closest(".rc-slider")) return;
        const slider = event.currentTarget.querySelector(".rc-slider");
        const rect = slider.getBoundingClientRect();
        if (!rect.width) return;
        // Own pointer capture rather than rc-slider's document mouse listeners,
        // which cannot receive a release over the preview iframe.
        event.preventDefault(); event.stopPropagation();
        slider.querySelector('[role="slider"]')?.focus();
        begin();
        sliderActive.current = true;
        setShield(true);
        pointer.current = { id: event.pointerId, element: event.currentTarget, rect };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const step = setting.step || 1;
        preview(Math.max(sliderMin, Math.min(sliderMax, sliderMin + Math.round((event.clientX - rect.left) / rect.width * (sliderMax - sliderMin) / step) * step)));
      }}
      onPointerMove={(event) => {
        const session = pointer.current;
        if (!session || session.id !== event.pointerId) return;
        if (event.buttons === 0) { commit(); return; }
        event.preventDefault();
        const step = setting.step || 1;
        preview(Math.max(sliderMin, Math.min(sliderMax, sliderMin + Math.round((event.clientX - session.rect.left) / session.rect.width * (sliderMax - sliderMin) / step) * step)));
      }}
      style={{ touchAction: "pan-y" }}
      onKeyDown={(event) => {
        if (event.target.getAttribute("role") === "slider" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key) && !active.current) begin();
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-2">
        {label}
      </label>
      <Slider
        disabled={disabled}
        min={sliderMin}
        max={sliderMax}
        step={setting.step}
        value={Math.max(sliderMin, Math.min(sliderMax, local))}
        ariaLabelForHandle={label}
        onBeforeChange={() => { begin(); sliderActive.current = true; setShield(true); }}
        onChange={(next) => { if (!cancelled.current) preview(next); }}
        onChangeComplete={commit}
        styles={{ rail: { backgroundColor: "#e2e8f0", height: 6 }, track: { backgroundColor: "#e0006d", height: 6 },
          handle: { backgroundColor: "#e0006d", border: "2px solid #ffffff", opacity: 1, width: 18, height: 18, marginTop: -6 } }}
      />
      {shield && createPortal(<div data-testid="image-slider-shield" aria-hidden="true"
        style={{ position: "fixed", inset: 0, zIndex: 100000, cursor: "ew-resize", touchAction: "none" }}
        onPointerCancel={cancel} />, document.body)}
      <div className="flex items-center gap-2 mt-2">
        <input
          id={id}
          aria-label={label}
          disabled={disabled}
          type="number"
          min={setting.min}
          max={setting.max}
          step={setting.step}
          value={local}
          className="form-input w-24"
          onChange={(event) => preview(event.target.valueAsNumber)}
          onBlur={() => {
            if (active.current) commit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
        />
        {onUnitChange ? <select disabled={disabled} className="form-input text-sm w-16" aria-label={`${label} unit`} value={setting.unit}
          onChange={(event) => { cancel(); onUnitChange(event.target.value); }}><option value="%">%</option><option value="px">px</option></select> : <span>{hasAuto && local === 0 ? "Auto" : setting.unit}</span>}
        {hasAuto && (
          <button
            disabled={disabled}
            type="button"
            className="text-sm underline"
            onClick={() => {
              begin();
              commit(0);
            }}
          >
            Auto
          </button>
        )}
      </div>
      {modern && <p className="text-xs text-slate-500 mt-1">{onUnitChange ? `${naturalScale ? "Natural proportions. " : ""}% scales the fitted original; px stores CSS pixels. Default Scale restores proportions.` : "Both percentages scale the fitted intrinsic image. Auto keeps proportions."}</p>}
      {local > sliderMax && <p className="text-xs text-slate-500 mt-1">Slider limit: {sliderMax}{setting.unit}. Exact entry supports up to {setting.max}{setting.unit}; the saved value is unchanged.</p>}
      {height && (
        <p className="text-xs text-slate-500 mt-1">Auto keeps proportions. A pixel height stretches the image.</p>
      )}
    </div>
  );
}
