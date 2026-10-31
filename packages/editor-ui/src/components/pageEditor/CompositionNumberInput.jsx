import { useEffect, useLayoutEffect, useRef, useState } from "react";

export default function CompositionNumberInput({ value, label, disabled, min = -360000, max = 360000, step = 1, clampMin = false, onPreview, onCommit }) {
  const [text, setText] = useState(String(value));
  const active = useRef(false), callbacks = useRef({ onPreview, onCommit });
  const input = useRef(null);
  useLayoutEffect(() => { callbacks.current = { onPreview, onCommit }; }, [onPreview, onCommit]);
  const number = raw => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()) && Number.isFinite(Number(raw)) && (clampMin || Number(raw) >= min) && Number(raw) <= max ? Math.max(min, Number(raw)) : null;
  useEffect(() => () => { if (active.current) callbacks.current.onPreview(null); }, []);
  const finish = cancel => {
    if (!active.current) return;
    active.current = false;
    const next = number(text);
    if (!cancel && next !== null && next !== value && callbacks.current.onCommit(next) !== false) {
      callbacks.current.onPreview(next, "commit");
    } else { callbacks.current.onPreview(null); setText(String(value)); }
  };
  const adjust = direction => {
    const next = Math.max(min, Math.min(max, Number(((number(text) ?? value) + direction * step).toFixed(10))));
    active.current = true; setText(String(next)); callbacks.current.onPreview(next);
  };
  return <div className="flex items-stretch min-w-0">
    <input ref={input} aria-label={label} className="form-input w-full min-w-0" type="text" inputMode="decimal"
    disabled={disabled} value={text} onFocus={() => { active.current = true; }}
    onChange={event => { active.current = true; setText(event.target.value); const next = number(event.target.value); if (next !== null) callbacks.current.onPreview(next); }}
    onBlur={() => finish(false)} onKeyDown={event => {
      if (["ArrowUp", "ArrowDown"].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        adjust(event.key === "ArrowUp" ? 1 : -1);
      }
      if (event.key === "Escape") { event.preventDefault(); finish(true); event.currentTarget.blur(); }
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
    }} />
    <span className="flex flex-col">
      {[1, -1].map(direction => <button key={direction} type="button" disabled={disabled}
        aria-label={`${direction === 1 ? "Increase" : "Decrease"} ${label}`}
        className="border border-slate-300 px-2 text-xs hover:bg-slate-100 disabled:opacity-40"
        onMouseDown={event => event.preventDefault()}
        onClick={() => { input.current?.focus(); adjust(direction); }}>
        {direction === 1 ? "↑" : "↓"}
      </button>)}
    </span>
  </div>;
}
