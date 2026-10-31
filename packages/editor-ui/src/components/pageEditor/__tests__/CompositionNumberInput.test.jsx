// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CompositionNumberInput from "../CompositionNumberInput";
afterEach(cleanup);
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

it("clickable steppers preview repeatedly and commit on confirmation", () => {
  const preview = vi.fn(), commit = vi.fn();
  render(<CompositionNumberInput label="Angle" value={10} step={0.1} onPreview={preview} onCommit={commit} />);
  fireEvent.click(screen.getByRole("button", { name: "Increase Angle" }));
  fireEvent.click(screen.getByRole("button", { name: "Increase Angle" }));
  expect(screen.getByLabelText("Angle").value).toBe("10.2");
  fireEvent.click(screen.getByRole("button", { name: "Decrease Angle" }));
  expect(preview).toHaveBeenLastCalledWith(10.1);
  expect(commit).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByLabelText("Angle"), { key: "Enter" });
  expect(commit).toHaveBeenCalledExactlyOnceWith(10.1);
  expect(preview).toHaveBeenLastCalledWith(10.1, "commit");
});
it("disables visible steppers with the input", () => {
  render(<CompositionNumberInput label="Height" value={800} disabled onPreview={vi.fn()} onCommit={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Increase Height" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Decrease Height" })).toBeDisabled();
});
