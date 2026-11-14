import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";

export default function MobilePlacementInput({ label, value, min, max, sliderMin = min, sliderMax = max, step = 1, onPreview, onCommit }) {
  const [draft, setDraft] = useState(value);
  const [text, setText] = useState(String(value));
  const [shield, setShield] = useState(false);
  const active = useRef(false), latest = useRef(value), saved = useRef(value), pointer = useRef(null);
  const callbacks = useRef({ onPreview, onCommit });
  saved.current = value;
  useEffect(() => { callbacks.current = { onPreview, onCommit }; }, [onPreview, onCommit]);

  const release = () => {
    const session = pointer.current;
    pointer.current = null;
    setShield(false);
    if (session?.element.hasPointerCapture?.(session.id)) session.element.releasePointerCapture(session.id);
  };
  const cancel = () => {
    if (!active.current) return;
    active.current = false;
    release();
    latest.current = saved.current;
    setDraft(saved.current);
    setText(String(saved.current));
    callbacks.current.onPreview(null);
  };
  const preview = raw => {
    if (!Number.isFinite(raw)) return false;
    const next = Math.round(raw);
    if (!active.current) active.current = true;
    if (callbacks.current.onPreview(next) === false) return false;
    latest.current = next;
    setDraft(next);
    setText(String(next));
    return true;
  };
  const commit = raw => {
    const next = Number.isFinite(raw) ? Math.round(raw) : latest.current;
    if (!active.current && next === latest.current) return;
    if (!active.current) {
      if (next === saved.current) return;
      active.current = true;
    }
    active.current = false;
    release();
    if (callbacks.current.onCommit(next) === false) {
      latest.current = saved.current;
      setDraft(saved.current);
      setText(String(saved.current));
      callbacks.current.onPreview(null);
      return;
    }
    latest.current = next;
    setDraft(next);
    setText(String(next));
  };

  useEffect(() => {
    if (!active.current) {
      latest.current = value;
      setDraft(value);
      setText(String(value));
    }
  }, [value]);
  useEffect(() => {
    const finish = event => {
      const session = pointer.current;
      if (!session || session.id !== event.pointerId) return;
      if (event.type === "pointercancel") cancel();
      else commit();
    };
    const blur = () => cancel();
    document.addEventListener("pointerup", finish, true);
    document.addEventListener("pointercancel", finish, true);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("pointerup", finish, true);
      document.removeEventListener("pointercancel", finish, true);
      window.removeEventListener("blur", blur);
      release();
      if (active.current) callbacks.current.onPreview(null);
    };
    // Saved state is read through a ref so cleanup cancels a live gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sliderValue = Math.max(sliderMin, Math.min(sliderMax, draft));
  const valueFromPoint = (clientX, rect) => sliderMin + Math.round((clientX - rect.left) / rect.width * (sliderMax - sliderMin) / step) * step;
  return <div
    className="space-y-1"
    onPointerDownCapture={event => {
      if (event.button !== 0 || !event.target.closest(".rc-slider")) return;
      const slider = event.currentTarget.querySelector(".rc-slider"), rect = slider.getBoundingClientRect();
      if (!rect.width) return;
      event.preventDefault(); event.stopPropagation();
      slider.querySelector('[role="slider"]')?.focus();
      active.current = true;
      setShield(true);
      pointer.current = { id: event.pointerId, element: event.currentTarget, rect };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      preview(Math.max(sliderMin, Math.min(sliderMax, valueFromPoint(event.clientX, rect))));
    }}
    onPointerMove={event => {
      const session = pointer.current;
      if (!session || session.id !== event.pointerId) return;
      if (event.buttons === 0) { commit(); return; }
      event.preventDefault();
      preview(Math.max(sliderMin, Math.min(sliderMax, valueFromPoint(event.clientX, session.rect))));
    }}
    onPointerCancel={cancel}
    onLostPointerCapture={event => { if (pointer.current?.id === event.pointerId) cancel(); }}
    onKeyDown={event => {
      if (event.target.getAttribute("role") === "slider" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key) && !active.current)
        active.current = true;
      if (event.key === "Escape") { event.preventDefault(); cancel(); }
    }}
    style={{ touchAction: "pan-y" }}
  >
    <span className="form-label block">{label}</span>
    <Slider disabled={false} min={sliderMin} max={sliderMax} step={step} value={sliderValue} ariaLabelForHandle={`${label} slider`}
      onBeforeChange={() => { active.current = true; }}
      onChange={next => preview(next)} onChangeComplete={next => commit(next)}
      styles={{ rail: { backgroundColor: "#e2e8f0", height: 6 }, track: { backgroundColor: "#e0006d", height: 6 },
        handle: { backgroundColor: "#e0006d", border: "2px solid #ffffff", opacity: 1, width: 18, height: 18, marginTop: -6 } }} />
    {shield && createPortal(<div data-testid="mobile-placement-slider-shield" aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex: 100000, cursor: "ew-resize", touchAction: "none" }}
      onPointerCancel={cancel} />, document.body)}
    <div className="flex items-center gap-2">
      <input aria-label={label} className="form-input w-24" type="number" inputMode="numeric"
        min={min} max={max} step={step} value={text}
        onChange={event => {
          const raw = event.target.value;
          setText(raw);
          const next = event.target.valueAsNumber;
          if (Number.isFinite(next)) preview(next);
        }}
        onBlur={() => {
          if (!active.current) return;
          const next = text.trim() ? Number(text) : NaN;
          if (!Number.isFinite(next) || next < min || next > max) cancel();
          else commit(next);
        }}
        onKeyDown={event => {
          if (event.key === "Enter") { event.preventDefault(); const next = text.trim() ? Number(text) : NaN; if (Number.isFinite(next)) commit(next); else cancel(); }
          if (event.key === "Escape") { event.preventDefault(); cancel(); }
        }} />
      <span className="text-xs text-slate-500">px</span>
    </div>
  </div>;
}
