import { useEffect, useLayoutEffect, useRef, useState } from "react";

export default function CompositionNumberInput({ value, label, disabled, min = -360000, max = 360000, step = 1, onPreview, onCommit }) {
  const [text, setText] = useState(String(value));
  const active = useRef(false), callbacks = useRef({ onPreview, onCommit });
  useLayoutEffect(() => { callbacks.current = { onPreview, onCommit }; }, [onPreview, onCommit]);
  const number = raw => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()) && Number.isFinite(Number(raw)) && Number(raw) >= min && Number(raw) <= max ? Number(raw) : null;
  useEffect(() => () => { if (active.current) callbacks.current.onPreview(null); }, []);
  const finish = cancel => {
    if (!active.current) return;
    active.current = false;
    callbacks.current.onPreview(null);
    const next = number(text);
    if (!cancel && next !== null && next !== value) { if (callbacks.current.onCommit(next) === false) setText(String(value)); }
    else setText(String(value));
  };
  return <input aria-label={label} className="form-input w-full min-w-0" type="text" inputMode="decimal"
    disabled={disabled} value={text} onFocus={() => { active.current = true; }}
    onChange={event => { active.current = true; setText(event.target.value); const next = number(event.target.value); if (next !== null) callbacks.current.onPreview(next); }}
    onBlur={() => finish(false)} onKeyDown={event => {
      if (["ArrowUp", "ArrowDown"].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        const next = Math.max(min, Math.min(max, Number(((number(text) ?? value) + (event.key === "ArrowUp" ? step : -step)).toFixed(10))));
        active.current = true; setText(String(next)); callbacks.current.onPreview(next);
      }
      if (event.key === "Escape") { event.preventDefault(); finish(true); event.currentTarget.blur(); }
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
    }} />;
}
