import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { IconButton } from "../ui/Button";

export default function CompositionNumberInput({ value, label, disabled, min = -360000, max = 360000, step = 1, clampMin = false, onPreview, onCommit }) {
  const [text, setText] = useState(String(value));
  const active = useRef(false), callbacks = useRef({ onPreview, onCommit });
  const input = useRef(null), draft = useRef(String(value)), hold = useRef(null), actions = useRef({});
  useLayoutEffect(() => { callbacks.current = { onPreview, onCommit }; }, [onPreview, onCommit]);
  const number = raw => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()) && Number.isFinite(Number(raw)) && (clampMin || Number(raw) >= min) && Number(raw) <= max ? Math.max(min, Number(raw)) : null;
  const setDraft = next => { draft.current = next; setText(next); };
  const release = () => {
    const session = hold.current;
    hold.current = null;
    if (!session) return;
    clearTimeout(session.delay); clearInterval(session.repeat);
    if (session.element.hasPointerCapture?.(session.pointerId)) session.element.releasePointerCapture(session.pointerId);
  };
  const finish = cancel => {
    release();
    if (!active.current) return;
    active.current = false;
    const next = number(draft.current);
    if (!cancel && next !== null && next !== value && callbacks.current.onCommit(next) !== false) {
      callbacks.current.onPreview(next, "commit");
    } else { callbacks.current.onPreview(null); setDraft(String(value)); }
  };
  const adjust = direction => {
    const next = Math.max(min, Math.min(max, Number(((number(draft.current) ?? value) + direction * step).toFixed(10))));
    active.current = true; setDraft(String(next)); callbacks.current.onPreview(next);
  };
  const stopHold = cancel => { if (hold.current) finish(cancel); };
  const startHold = (element, pointerId, direction) => {
    if (disabled || hold.current) return;
    const session = { element, pointerId };
    hold.current = session;
    if (pointerId !== null) {
      input.current?.focus();
      element.setPointerCapture?.(pointerId);
    }
    adjust(direction);
    session.delay = setTimeout(() => {
      if (hold.current !== session) return;
      actions.current.adjust(direction);
      session.repeat = setInterval(() => actions.current.adjust(direction), 75);
    }, 350);
  };
  useLayoutEffect(() => { actions.current = { adjust, stopHold }; });
  useEffect(() => {
    const end = event => {
      if (hold.current?.pointerId !== null && hold.current?.pointerId === event.pointerId)
        actions.current.stopHold(event.type === "pointercancel");
    };
    const blur = () => actions.current.stopHold(false);
    document.addEventListener("pointerup", end, true);
    document.addEventListener("pointercancel", end, true);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("pointerup", end, true);
      document.removeEventListener("pointercancel", end, true);
      window.removeEventListener("blur", blur);
      release();
      if (active.current) callbacks.current.onPreview(null);
    };
  }, []);
  useEffect(() => { if (disabled) actions.current.stopHold(true); }, [disabled]);
  return <div className="relative w-24 max-w-full">
    <input ref={input} aria-label={label} className="form-input w-full min-w-0 pr-7" type="text" inputMode="decimal"
    disabled={disabled} value={text} onFocus={() => { active.current = true; }}
    onChange={event => { active.current = true; setDraft(event.target.value); const next = number(event.target.value); if (next !== null) callbacks.current.onPreview(next); }}
    onBlur={() => finish(false)} onKeyDown={event => {
      if (["ArrowUp", "ArrowDown"].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        adjust(event.key === "ArrowUp" ? 1 : -1);
      }
      if (event.key === "Escape") { event.preventDefault(); finish(true); event.currentTarget.blur(); }
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
    }} />
    <span className="absolute right-1 inset-y-1 flex flex-col justify-center">
      {[1, -1].map(direction => <IconButton key={direction} size="sm" disabled={disabled}
        aria-label={`${direction === 1 ? "Increase" : "Decrease"} ${label}`}
        className="!p-0 w-4 h-4 rounded-sm disabled:opacity-40 touch-none select-none"
        onPointerDown={event => { if (event.button === 0) { event.preventDefault(); startHold(event.currentTarget, event.pointerId, direction); } }}
        onLostPointerCapture={() => stopHold(true)}
        onBlur={() => stopHold(false)}
        onKeyDown={event => {
          if ([" ", "Enter"].includes(event.key)) { event.preventDefault(); if (!event.repeat) startHold(event.currentTarget, null, direction); }
          if (event.key === "Escape") { event.preventDefault(); stopHold(true); }
        }}
        onKeyUp={event => { if ([" ", "Enter"].includes(event.key)) { event.preventDefault(); stopHold(false); } }}
        onClick={event => {
          // Pointer and held-key activation already stepped before release.
          if (event.detail !== 0) return;
          adjust(direction); finish(false);
        }}>
        {direction === 1 ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
      </IconButton>)}
    </span>
  </div>;
}
