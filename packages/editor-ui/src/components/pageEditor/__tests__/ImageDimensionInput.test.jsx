// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ImageDimensionInput from "../ImageDimensionInput";
import { imageSizePreview } from "../../../lib/imageResizeBridge";

let slider;
vi.mock("rc-slider", () => ({
  default: (props) => {
    slider = props;
    return <div data-testid="slider" />;
  },
}));
vi.mock("../../../lib/imageResizeBridge", () => ({ imageSizePreview: vi.fn() }));
const width = { id: "image_width_percent", default: 100, min: 10, max: 100, step: 1, unit: "%" };
const height = { id: "image_height_px", default: 0, min: 0, max: 2000, step: 1, unit: "px" };
beforeEach(() => vi.clearAllMocks());

it("previews every slider move, commits only release, and synchronizes external mouse edits", () => {
  const onChange = vi.fn();
  const view = render(
    <ImageDimensionInput widgetId="w1" setting={width} value={100} label="Width" onChange={onChange} />,
  );
  act(() => slider.onBeforeChange());
  act(() => slider.onChange(80));
  act(() => slider.onChange(65));
  expect(screen.getByRole("spinbutton").value).toBe("65");
  expect(imageSizePreview).toHaveBeenLastCalledWith("w1", width.id, 65, "preview");
  expect(onChange).not.toHaveBeenCalled();
  act(() => slider.onChangeComplete(65));
  expect(onChange).toHaveBeenCalledExactlyOnceWith(width.id, 65);
  expect(imageSizePreview).toHaveBeenLastCalledWith("w1", width.id, 65, "commit");
  view.rerender(<ImageDimensionInput widgetId="w1" setting={width} value={45} label="Width" onChange={onChange} />);
  expect(slider.value).toBe(45);
  expect(screen.getByRole("spinbutton").value).toBe("45");
});
it("cancels Escape without committing a late slider release", () => {
  const onChange = vi.fn();
  render(<ImageDimensionInput widgetId="w1" setting={width} label="Width" onChange={onChange} />);
  act(() => slider.onBeforeChange());
  act(() => slider.onChange(60));
  fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "Escape" });
  act(() => slider.onChangeComplete(60));
  expect(onChange).not.toHaveBeenCalled();
  expect(slider.value).toBe(100);
  expect(imageSizePreview).toHaveBeenLastCalledWith("w1", width.id, 100, "cancel");
});
it("supports independent Height previews, exact typed commits, and Auto reset", () => {
  const onChange = vi.fn();
  const view = render(<ImageDimensionInput widgetId="w1" setting={height} label="Height" onChange={onChange} />);
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "347" } });
  expect(imageSizePreview).toHaveBeenLastCalledWith("w1", height.id, 347, "preview");
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "Enter" });
  fireEvent.blur(screen.getByRole("spinbutton"));
  expect(onChange).toHaveBeenCalledExactlyOnceWith(height.id, 347);
  view.rerender(<ImageDimensionInput widgetId="w1" setting={height} value={347} label="Height" onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Auto" }));
  expect(onChange).toHaveBeenLastCalledWith(height.id, 0);
});
it.each(["blur", "unmount", "pointercancel"])("cancels transient styles on %s", (kind) => {
  const onChange = vi.fn();
  const view = render(<ImageDimensionInput widgetId="w1" setting={width} label="Width" onChange={onChange} />);
  act(() => slider.onBeforeChange());
  act(() => slider.onChange(60));
  if (kind === "unmount") view.unmount();
  else if (kind === "blur") fireEvent(window, new Event("blur"));
  else fireEvent.pointerCancel(screen.getByTestId("slider"));
  expect(onChange).not.toHaveBeenCalled();
  expect(imageSizePreview).toHaveBeenLastCalledWith("w1", width.id, 100, "cancel");
});
