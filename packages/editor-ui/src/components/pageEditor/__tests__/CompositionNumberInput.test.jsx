// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CompositionNumberInput from "../CompositionNumberInput";
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("previews valid values immediately, keeps incomplete text and commits only once on blur", () => {
  const preview = vi.fn(), commit = vi.fn();
  render(<CompositionNumberInput label="Angle" value={10} onPreview={preview} onCommit={commit} />);
  const input = screen.getByLabelText("Angle");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "-" } });
  expect(input.value).toBe("-"); expect(preview).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "-22.5" } });
  fireEvent.change(input, { target: { value: "-30" } });
  expect(preview).toHaveBeenLastCalledWith(-30); expect(commit).not.toHaveBeenCalled();
  fireEvent.blur(input); fireEvent.blur(input);
  expect(commit).toHaveBeenCalledExactlyOnceWith(-30); expect(preview).toHaveBeenLastCalledWith(-30, "commit");
  expect(preview).not.toHaveBeenCalledWith(null);
});
it("Escape and unmount cancel preview without committing", () => {
  const preview = vi.fn(), commit = vi.fn();
  const view = render(<CompositionNumberInput label="Height" value={800} min={1} max={10000} onPreview={preview} onCommit={commit} />);
  const input = screen.getByLabelText("Height");
  fireEvent.focus(input); fireEvent.change(input, { target: { value: "900" } });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(input.value).toBe("800"); expect(commit).not.toHaveBeenCalled(); expect(preview).toHaveBeenLastCalledWith(null);
  fireEvent.focus(input); fireEvent.change(input, { target: { value: "1000" } }); view.unmount();
  expect(preview).toHaveBeenLastCalledWith(null); expect(commit).not.toHaveBeenCalled();
});
it("rejects invalid completed text and preserves native editing keys", () => {
  const preview = vi.fn(), commit = vi.fn();
  render(<CompositionNumberInput label="Height" value={800} min={1} max={10000} onPreview={preview} onCommit={commit} />);
  const input = screen.getByLabelText("Height");
  fireEvent.focus(input); fireEvent.change(input, { target: { value: "" } });
  expect(fireEvent.keyDown(input, { key: "z", ctrlKey: true })).toBe(true);
  fireEvent.blur(input); expect(commit).not.toHaveBeenCalled(); expect(input.value).toBe("800");
});
it("confirms on Enter once and restores rejected values", () => {
  const preview = vi.fn(), commit = vi.fn(() => false);
  render(<CompositionNumberInput label="Angle" value={10} onPreview={preview} onCommit={commit} />);
  const input = screen.getByLabelText("Angle");
  act(() => input.focus());
  fireEvent.change(input, { target: { value: "25" } });
  expect(commit).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" }); fireEvent.blur(input);
  expect(commit).toHaveBeenCalledExactlyOnceWith(25);
  expect(preview).toHaveBeenLastCalledWith(null);
  expect(input.value).toBe("10");
});
it.each(["1e", "0x20", "Infinity"])("keeps %s as an uncommitted draft", text => {
  const preview = vi.fn(), commit = vi.fn();
  render(<CompositionNumberInput label="Angle" value={10} onPreview={preview} onCommit={commit} />);
  const input = screen.getByLabelText("Angle");
  fireEvent.change(input, { target: { value: text } });
  expect(input.value).toBe(text); expect(preview).not.toHaveBeenCalled();
  fireEvent.blur(input); expect(commit).not.toHaveBeenCalled(); expect(input.value).toBe("10");
});
it("retains numeric arrow stepping without committing until blur", () => {
  const preview = vi.fn(), commit = vi.fn();
  render(<CompositionNumberInput label="Angle" value={10} step={0.1} onPreview={preview} onCommit={commit} />);
  const input = screen.getByLabelText("Angle");
  fireEvent.keyDown(input, { key: "ArrowUp" });
  expect(input.value).toBe("10.1"); expect(preview).toHaveBeenLastCalledWith(10.1);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input.value).toBe("10"); expect(commit).not.toHaveBeenCalled();
  fireEvent.blur(input); expect(commit).not.toHaveBeenCalled();
});

it("stepper clicks adjust once and commit once per click", () => {
  const preview = vi.fn(), commit = vi.fn();
  render(<CompositionNumberInput label="Angle" value={10} step={0.1} onPreview={preview} onCommit={commit} />);
  fireEvent.click(screen.getByRole("button", { name: "Increase Angle" }));
  expect(screen.getByLabelText("Angle").value).toBe("10.1");
  expect(commit).toHaveBeenCalledExactlyOnceWith(10.1);
  expect(preview).toHaveBeenLastCalledWith(10.1, "commit");
});
it("disables visible steppers with the input", () => {
  render(<CompositionNumberInput label="Height" value={800} disabled onPreview={vi.fn()} onCommit={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Increase Height" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Decrease Height" })).toBeDisabled();
});

function pointer(target, type, id = 7) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
  Object.defineProperty(event, "pointerId", { value: id });
  fireEvent(target, event);
}
it("press-and-hold previews repeated steps and commits once on release without an extra click step", () => {
  vi.useFakeTimers();
  const preview = vi.fn(), commit = vi.fn();
  render(<CompositionNumberInput label="Angle" value={10} step={0.1} onPreview={preview} onCommit={commit} />);
  const button = screen.getByRole("button", { name: "Increase Angle" });
  let captured = false;
  button.setPointerCapture = vi.fn(() => { captured = true; });
  button.hasPointerCapture = () => captured;
  button.releasePointerCapture = vi.fn(() => { captured = false; pointer(button, "lostpointercapture"); });
  pointer(button, "pointerdown");
  expect(button.setPointerCapture).toHaveBeenCalledWith(7);
  expect(screen.getByLabelText("Angle").value).toBe("10.1");
  act(() => vi.advanceTimersByTime(500));
  expect(screen.getByLabelText("Angle").value).toBe("10.4");
  expect(commit).not.toHaveBeenCalled();
  pointer(document, "pointerup", 99);
  expect(commit).not.toHaveBeenCalled();
  pointer(document, "pointerup");
  expect(button.releasePointerCapture).toHaveBeenCalledWith(7);
  fireEvent.click(button, { detail: 1 });
  act(() => vi.advanceTimersByTime(1000));
  expect(commit).toHaveBeenCalledExactlyOnceWith(10.4);
  expect(preview).toHaveBeenLastCalledWith(10.4, "commit");
});
it.each(["pointercancel", "lostpointercapture", "Escape"])("press-and-hold stops and restores the draft on %s", end => {
  vi.useFakeTimers();
  const preview = vi.fn(), commit = vi.fn();
  render(<CompositionNumberInput label="Height" value={800} onPreview={preview} onCommit={commit} />);
  const button = screen.getByRole("button", { name: "Decrease Height" });
  pointer(button, "pointerdown");
  act(() => vi.advanceTimersByTime(500));
  if (end === "Escape") fireEvent.keyDown(screen.getByLabelText("Height"), { key: "Escape" });
  else pointer(end === "pointercancel" ? document : button, end);
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByLabelText("Height").value).toBe("800");
  expect(preview).toHaveBeenLastCalledWith(null);
  expect(commit).not.toHaveBeenCalled();
});
it.each(["window", "input"])("press-and-hold stops and commits once when %s loses focus", target => {
  vi.useFakeTimers();
  const preview = vi.fn(), commit = vi.fn();
  render(<CompositionNumberInput label="Height" value={800} onPreview={preview} onCommit={commit} />);
  pointer(screen.getByRole("button", { name: "Decrease Height" }), "pointerdown");
  act(() => vi.advanceTimersByTime(500));
  fireEvent.blur(target === "window" ? window : screen.getByLabelText("Height"));
  act(() => vi.advanceTimersByTime(1000));
  expect(commit).toHaveBeenCalledExactlyOnceWith(796);
});
it("press-and-hold stops repeated updates on unmount and when disabled", () => {
  vi.useFakeTimers();
  const preview = vi.fn(), commit = vi.fn();
  const view = render(<CompositionNumberInput label="Height" value={800} onPreview={preview} onCommit={commit} />);
  pointer(screen.getByRole("button", { name: "Increase Height" }), "pointerdown");
  view.rerender(<CompositionNumberInput label="Height" value={800} disabled onPreview={preview} onCommit={commit} />);
  expect(preview).toHaveBeenLastCalledWith(null);
  const disabledCalls = preview.mock.calls.length;
  act(() => vi.advanceTimersByTime(1000));
  expect(preview).toHaveBeenCalledTimes(disabledCalls);
  view.rerender(<CompositionNumberInput label="Height" value={800} onPreview={preview} onCommit={commit} />);
  pointer(screen.getByRole("button", { name: "Increase Height" }), "pointerdown");
  view.unmount();
  const unmountedCalls = preview.mock.calls.length;
  act(() => vi.advanceTimersByTime(1000));
  expect(preview).toHaveBeenCalledTimes(unmountedCalls);
  expect(commit).not.toHaveBeenCalled();
});
it("press-and-hold supports keyboard button activation and stops on button blur", () => {
  vi.useFakeTimers();
  const preview = vi.fn(), commit = vi.fn();
  render(<CompositionNumberInput label="Height" value={800} onPreview={preview} onCommit={commit} />);
  const button = screen.getByRole("button", { name: "Increase Height" });
  fireEvent.keyDown(button, { key: " " });
  fireEvent.keyDown(button, { key: " ", repeat: true });
  act(() => vi.advanceTimersByTime(500));
  fireEvent.keyUp(button, { key: " " });
  expect(commit).toHaveBeenCalledExactlyOnceWith(804);
  fireEvent.keyDown(button, { key: "Enter" });
  fireEvent.blur(button);
  act(() => vi.advanceTimersByTime(1000));
  expect(commit).toHaveBeenCalledTimes(2);
  expect(commit).toHaveBeenLastCalledWith(805);
});
