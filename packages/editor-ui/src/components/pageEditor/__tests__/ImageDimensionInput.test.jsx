// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ImageDimensionInput from "../ImageDimensionInput";
import { imageSizePreview } from "../../../lib/imageResizeBridge";

let slider;
vi.mock("rc-slider", () => ({
  default: (props) => {
    slider = props;
    return <div data-testid="slider" className="rc-slider"><span role="slider" tabIndex={0} /></div>;
  },
}));
vi.mock("../../../lib/imageResizeBridge", () => ({ imageSizePreview: vi.fn() }));
const width = { id: "image_width_percent", default: 100, min: 10, max: 100, step: 1, unit: "%" };
const height = { id: "image_height_px", default: 0, min: 0, max: 2000, step: 1, unit: "px" };
beforeEach(() => vi.clearAllMocks());

function pointerEvent(target, type, x = 50, buttons = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0, buttons });
  Object.defineProperty(event, "pointerId", { value: 7 });
  fireEvent(target, event);
}
it.each(["pointerup", "pointercancel", "lostpointercapture"])("releases captured slider via %s with at most one commit", (ending) => {
  const onChange = vi.fn();
  render(<ImageDimensionInput widgetId="w1" setting={width} label="Width" onChange={onChange} />);
  const track = screen.getByTestId("slider");
  track.getBoundingClientRect = () => ({ left: 0, width: 100 });
  const wrapper = track.parentElement;
  wrapper.setPointerCapture = vi.fn();
  wrapper.hasPointerCapture = () => true;
  wrapper.releasePointerCapture = vi.fn();
  pointerEvent(track, "pointerdown", 50);
  expect(wrapper.setPointerCapture).toHaveBeenCalledWith(7);
  pointerEvent(wrapper, "pointermove", 60);
  expect(onChange).not.toHaveBeenCalled();
  pointerEvent(ending === "pointerup" ? document.body : wrapper, ending, 1000, 0);
  pointerEvent(wrapper, "pointermove", 80, 0);
  pointerEvent(document.body, "pointerup", 80, 0);
  expect(screen.queryByTestId("image-slider-shield")).toBeNull();
  act(() => slider.onChange(80));
  act(() => slider.onChangeComplete(80));
  if (ending === "pointerup") expect(onChange).toHaveBeenCalledExactlyOnceWith(width.id, 64);
  else expect(onChange).not.toHaveBeenCalled();
  expect(wrapper.releasePointerCapture).toHaveBeenCalledWith(7);
});
it("replaces visible Auto with a unit switch without mutating the other axis", () => {
  const onUnitChange = vi.fn();
  render(<ImageDimensionInput widgetId="w1" setting={{ ...width, id: "image_scale_width", min: 1 }} value={50} label="Width" onChange={vi.fn()} onUnitChange={onUnitChange} />);
  expect(screen.queryByRole("button", { name: "Auto" })).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Width unit" }), { target: { value: "px" } });
  expect(onUnitChange).toHaveBeenCalledExactlyOnceWith("px");
});

it.each(["image_scale_width", "image_scale_height"])("supports Auto and bounded fractional percentages for %s", (id) => {
  const setting = { id, default: 0, min: 0, max: 400, step: 1, unit: "%" };
  const onChange = vi.fn();
  render(<ImageDimensionInput widgetId="w1" setting={setting} value={50} label="Scale" onChange={onChange} />);
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0.5" } });
  fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "Enter" });
  expect(onChange).toHaveBeenLastCalledWith(id, 1);
  fireEvent.click(screen.getByRole("button", { name: "Auto" }));
  expect(onChange).toHaveBeenLastCalledWith(id, 0);
  expect(imageSizePreview).toHaveBeenLastCalledWith("w1", id, 0, "commit");
});

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
  fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
  act(() => slider.onChange(46));
  act(() => slider.onChangeComplete(46));
  expect(onChange).toHaveBeenLastCalledWith(width.id, 46);
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
