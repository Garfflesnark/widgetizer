// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import MobilePlacementInput from "../MobilePlacementInput";

const sliders = {};
vi.mock("rc-slider", () => ({ default: props => {
  sliders[props.ariaLabelForHandle] = props;
  return <div className="rc-slider"><span role="slider" aria-label={props.ariaLabelForHandle} tabIndex={0} /></div>;
} }));

afterEach(() => { cleanup(); for (const key of Object.keys(sliders)) delete sliders[key]; });

it.each([
  ["Mobile X position", 250, 390, 200],
  ["Mobile Y position", 1200, 10000, 1000],
])("keeps an out-of-slider %s value while displaying the nearest endpoint", (label, authoredValue, inputMax, sliderMax) => {
  const onPreview = vi.fn(), onCommit = vi.fn();
  const view = render(<MobilePlacementInput label={label} value={authoredValue} min={0} max={inputMax}
    sliderMin={0} sliderMax={sliderMax} onPreview={onPreview} onCommit={onCommit} />);

  expect(sliders[`${label} slider`]).toMatchObject({ min: 0, max: sliderMax, value: sliderMax });
  expect(screen.getByLabelText(label)).toHaveValue(authoredValue);
  expect(screen.getByLabelText(label)).toHaveAttribute("max", String(inputMax));
  expect(onPreview).not.toHaveBeenCalled();
  expect(onCommit).not.toHaveBeenCalled();

  view.rerender(<MobilePlacementInput label={label} value={authoredValue} min={0} max={inputMax}
    sliderMin={0} sliderMax={sliderMax} onPreview={onPreview} onCommit={onCommit} />);
  expect(screen.getByLabelText(label)).toHaveValue(authoredValue);
  expect(onPreview).not.toHaveBeenCalled();
  expect(onCommit).not.toHaveBeenCalled();
});

it.each([
  ["Mobile X position", 250, 390, 200],
  ["Mobile Y position", 1200, 10000, 1000],
])("keeps numeric coordinates beyond the displayed %s range and commits only explicit edits", (label, value, inputMax, sliderMax) => {
  const onPreview = vi.fn(), onCommit = vi.fn();
  render(<MobilePlacementInput label={label} value={value} min={0} max={inputMax}
    sliderMin={0} sliderMax={sliderMax} onPreview={onPreview} onCommit={onCommit} />);
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value: String(value - 10) } });
  expect(input).toHaveValue(value - 10);
  expect(sliders[`${label} slider`].value).toBe(sliderMax);
  expect(onPreview).toHaveBeenCalledExactlyOnceWith(value - 10);
  expect(onCommit).not.toHaveBeenCalled();
  fireEvent.blur(input);
  expect(onCommit).toHaveBeenCalledExactlyOnceWith(value - 10);
});

it.each([
  ["Mobile X position", 100, 390, 200],
  ["Mobile Y position", 500, 10000, 1000],
])("updates %s through both slider endpoints and intermediate values with one release commit", (label, value, inputMax, sliderMax) => {
  const onPreview = vi.fn(), onCommit = vi.fn();
  render(<MobilePlacementInput label={label} value={value} min={0} max={inputMax} sliderMin={0} sliderMax={sliderMax}
    onPreview={onPreview} onCommit={onCommit} />);
  const slider = sliders[`${label} slider`];
  act(() => slider.onBeforeChange());
  act(() => slider.onChange(slider.min));
  expect(screen.getByLabelText(label)).toHaveValue(0);
  const middle = Math.round(slider.max / 2);
  act(() => slider.onChange(middle));
  expect(screen.getByLabelText(label)).toHaveValue(middle);
  act(() => slider.onChange(slider.max));
  expect(screen.getByLabelText(label)).toHaveValue(sliderMax);
  act(() => slider.onChangeComplete(sliderMax));
  expect(onPreview).toHaveBeenCalledTimes(3);
  expect(onCommit).toHaveBeenCalledExactlyOnceWith(sliderMax);
});
