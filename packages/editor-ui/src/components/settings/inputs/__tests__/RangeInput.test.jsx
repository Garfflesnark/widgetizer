// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import RangeInput from "../RangeInput";

let sliderProps;
vi.mock("rc-slider", () => ({
  default: (props) => {
    sliderProps = props;
    return (
      <div data-testid="range-slider" className="rc-slider">
        <span
          role="slider"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight") return;
            const next = Number(props.value) + Number(props.step);
            props.onBeforeChange?.();
            props.onChange?.(next);
            props.onChangeComplete?.(next);
          }}
        />
      </div>
    );
  },
}));

afterEach(cleanup);

function pointerEvent(target, type, { x = 50, buttons = 1, pointerId = 11 } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({ pointerId, button: 0, clientX: x, buttons })) {
    Object.defineProperty(event, key, { value });
  }
  fireEvent(target, event);
}

function mountRange({ value = 1.5, min = 0, max = 2.5, step = 0.1, onChange = vi.fn() } = {}) {
  const view = render(<RangeInput id="copyright_line_height" value={value} min={min} max={max} step={step} onChange={onChange} />);
  const slider = screen.getByTestId("range-slider");
  slider.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 10, right: 100, bottom: 10 });
  const root = slider.parentElement.parentElement;
  root.setPointerCapture = vi.fn();
  root.hasPointerCapture = vi.fn(() => true);
  root.releasePointerCapture = vi.fn();
  return { ...view, slider, root, onChange };
}

it("drags and releases inside the control, then remains inactive until a new press", () => {
  const { slider, root, onChange } = mountRange();
  pointerEvent(slider, "pointerdown", { x: 20 });
  pointerEvent(root, "pointermove", { x: 60 });
  expect(screen.getByRole("spinbutton").value).toBe("1.5");
  pointerEvent(root, "pointerup", { x: 80, buttons: 0 });
  expect(onChange).toHaveBeenCalledExactlyOnceWith(2);
  expect(screen.queryByTestId("range-input-drag-shield")).toBeNull();
  pointerEvent(document.body, "pointermove", { x: 10 });
  expect(screen.getByRole("spinbutton").value).toBe("2");
  expect(onChange).toHaveBeenCalledExactlyOnceWith(2);
  expect(root.releasePointerCapture).toHaveBeenCalledWith(11);
});

it("keeps a drag active across the sidebar boundary and accepts release over the editor body", () => {
  const { slider, root, onChange } = mountRange();
  pointerEvent(slider, "pointerdown", { x: 20 });
  const shield = screen.getByTestId("range-input-drag-shield");
  pointerEvent(shield, "pointermove", { x: 50 });
  pointerEvent(shield, "pointerup", { x: 80, buttons: 0 });
  expect(onChange).toHaveBeenCalledExactlyOnceWith(2);
  expect(screen.getByRole("spinbutton").value).toBe("2");
  expect(screen.queryByTestId("range-input-drag-shield")).toBeNull();
  pointerEvent(document.body, "pointermove", { x: 10 });
  expect(onChange).toHaveBeenCalledExactlyOnceWith(2);
  expect(root.releasePointerCapture).toHaveBeenCalledWith(11);
});

it.each(["pointercancel", "lostpointercapture"])("cancels safely on %s", (ending) => {
  const { slider, root, onChange } = mountRange();
  pointerEvent(slider, "pointerdown", { x: 20 });
  const shield = screen.getByTestId("range-input-drag-shield");
  pointerEvent(shield, "pointermove", { x: 50 });
  pointerEvent(ending === "lostpointercapture" ? root : shield, ending, { x: 50, buttons: 0 });
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("spinbutton").value).toBe("1.5");
  expect(screen.queryByTestId("range-input-drag-shield")).toBeNull();
});

it("releases capture and removes the drag shield when unmounted mid-drag", () => {
  const { slider, root, unmount, onChange } = mountRange();
  pointerEvent(slider, "pointerdown", { x: 20 });
  expect(screen.getByTestId("range-input-drag-shield")).toBeTruthy();
  unmount();
  expect(root.releasePointerCapture).toHaveBeenCalledWith(11);
  expect(screen.queryByTestId("range-input-drag-shield")).toBeNull();
  pointerEvent(document.body, "pointerup", { x: 70, buttons: 0 });
  expect(onChange).not.toHaveBeenCalled();
});

it("preserves keyboard adjustment and ordinary range behavior for an unrelated slider", () => {
  const onChange = vi.fn();
  mountRange({ id: "opacity", value: 40, min: 0, max: 100, step: 1, onChange });
  fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
  expect(onChange).toHaveBeenCalledExactlyOnceWith(41);
  expect(sliderProps.value).toBe(41);
});
