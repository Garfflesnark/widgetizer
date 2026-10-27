import { useEffect, useRef, useState } from "react";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import { imageSizePreview } from "../../lib/imageResizeBridge";
import { IMAGE_HEIGHT_SETTING } from "@widgetizer/core/imageResize";

// Image-only transient feedback bypasses PreviewPanel's server-render debounce.
export default function ImageDimensionInput({ widgetId, setting, value = setting.default, label, onChange }) {
  const [local, setLocal] = useState(value);
  const active = useRef(false);
  const cancelled = useRef(false);
  const latest = useRef(value);
  const saved = useRef(value);
  saved.current = value;
  const height = setting.id === IMAGE_HEIGHT_SETTING;
  const send = (next, phase) => imageSizePreview(widgetId, setting.id, next, phase);
  const cancel = () => {
    if (!active.current) return;
    active.current = false;
    cancelled.current = true;
    latest.current = saved.current;
    setLocal(saved.current);
    send(saved.current, "cancel");
  };
  useEffect(() => {
    setLocal(value);
    latest.current = value;
    active.current = false;
  }, [value]);
  useEffect(() => {
    const blur = () => cancel();
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("blur", blur);
      if (active.current) imageSizePreview(widgetId, setting.id, saved.current, "cancel");
    };
    // The saved value is read through a ref, so unmount cancels the current draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetId, setting.id]);
  const begin = () => {
    active.current = true;
    cancelled.current = false;
  };
  const preview = (next) => {
    if (!Number.isFinite(next)) return;
    next = Math.round(Math.max(setting.min, Math.min(setting.max, next)));
    if (!active.current) begin();
    latest.current = next;
    setLocal(next);
    send(next, "preview");
  };
  const commit = (next = latest.current) => {
    if (cancelled.current || !Number.isFinite(next)) return;
    next = Math.round(Math.max(setting.min, Math.min(setting.max, next)));
    active.current = false;
    latest.current = next;
    setLocal(next);
    // Keep the transient style until the committed Liquid HTML arrives.
    send(next, "commit");
    if (next !== saved.current) onChange(setting.id, next);
  };
  const id = `${widgetId}-${setting.id}`;
  return (
    <div
      onPointerCancel={cancel}
      onKeyDown={(event) => {
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
        min={setting.min}
        max={setting.max}
        step={setting.step}
        value={local}
        ariaLabelForHandle={label}
        onBeforeChange={begin}
        onChange={preview}
        onChangeComplete={commit}
      />
      <div className="flex items-center gap-2 mt-2">
        <input
          id={id}
          aria-label={label}
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
        <span>{height && local === 0 ? "Auto" : setting.unit}</span>
        {height && (
          <button
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
      {height && (
        <p className="text-xs text-slate-500 mt-1">Auto keeps proportions. A pixel height stretches the image.</p>
      )}
    </div>
  );
}
