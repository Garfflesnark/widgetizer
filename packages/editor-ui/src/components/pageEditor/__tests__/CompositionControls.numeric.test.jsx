// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fixture } from "../../../../../core/src/runtime/__tests__/compositionFixture.js";
import { serializeWyrmetizerEditorPage } from "@widgetizer/core/wyrmetizerLayouts";
import schema from "../../../../../../themes/arch/widgets/image/schema.json";
vi.mock("../../../queries/pageManager", () => ({ getPage: vi.fn() }));
vi.mock("../../../queries/previewManager", () => ({ getGlobalWidgets: vi.fn(), getProjectWidgets: vi.fn() }));
vi.mock("../../../stores/themeStore", () => ({ default: { getState: () => ({ settings: {} }) } }));
vi.mock("../WyrmetizerCompatibility", () => ({ default: () => null }));
import CompositionControls from "../CompositionControls";
import usePageStore from "../../../stores/pageStore";
import useWidgetStore from "../../../stores/widgetStore";
import useAutoSave from "../../../stores/saveStore";

beforeEach(() => {
  const page = fixture();
  usePageStore.setState({ page, originalPage: structuredClone(page), globalWidgets: {} });
  usePageStore.temporal.getState().clear();
  useWidgetStore.setState({ compositionContext: "desktop", compositionMovementLocks: {}, schemas: { image: schema },
    selectedWidgetId: "a", selectedBlockId: null, selectedCompositionId: null,
    imageGeometry: { a: { containerWidth: 1200, width: 1200, height: 675, imageSource: "" } } });
});
afterEach(() => { cleanup(); useAutoSave.getState().stopAutoSave(); vi.useRealTimers(); });

it.each([
  ["Image rotation angle", "rotation", "20", "30", page => page.layout.compositions.canvas.placements.a.frames.desktop.rotation],
  ["Canvas height", "height", "1000", "1200", page => page.layout.compositions.canvas.profiles.desktop.height.valuePx],
])("previews %s outside saved state and commits one reversible history step", (label, field, first, last, read) => {
  const before = structuredClone(usePageStore.getState().page);
  const saved = JSON.stringify(serializeWyrmetizerEditorPage(before));
  const preview = vi.fn();
  window.addEventListener("wyrmetizer:numeric-preview", preview);
  try {
    render(<CompositionControls widgetId="a" />);
    const input = screen.getByLabelText(label);
    act(() => input.focus());
    fireEvent.change(input, { target: { value: first } });
    fireEvent.change(input, { target: { value: last } });
    expect(preview.mock.lastCall[0].detail).toMatchObject({ field, value: Number(last), phase: "preview" });
    expect(JSON.stringify(serializeWyrmetizerEditorPage(usePageStore.getState().page))).toBe(saved);
    expect(usePageStore.temporal.getState().pastStates).toHaveLength(0);
    fireEvent.keyDown(input, { key: "Enter" }); fireEvent.blur(input);
    const after = structuredClone(usePageStore.getState().page);
    expect(read(after)).toBe(Number(last));
    expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
    act(() => usePageStore.temporal.getState().undo()); expect(usePageStore.getState().page).toEqual(before);
    act(() => usePageStore.temporal.getState().redo()); expect(usePageStore.getState().page).toEqual(after);
  } finally { window.removeEventListener("wyrmetizer:numeric-preview", preview); }
});

it.each([["Enter", "50"], ["blur", "0"], ["blur", "-10"]])("clamps undersized height including rotated siblings on %s (%s) without moving frames", (confirmation, value) => {
  const page = structuredClone(usePageStore.getState().page);
  const c = page.layout.compositions.canvas;
  c.placements.b.version = 3;
  c.placements.b.frames.desktop.rotation = 90;
  c.placements.b.frames.desktop.rotationPivot = { x: 0, y: 0 };
  usePageStore.setState({ page });
  const frames = structuredClone(c.placements);
  render(<CompositionControls widgetId="a" />);
  const input = screen.getByLabelText("Canvas height");
  act(() => input.focus());
  fireEvent.change(input, { target: { value } });
  if (confirmation === "Enter") fireEvent.keyDown(input, { key: "Enter" });
  else fireEvent.blur(input);
  const committed = usePageStore.getState().page.layout.compositions.canvas;
  expect(committed.profiles.desktop.height.valuePx).toBeCloseTo(540);
  expect(committed.placements).toEqual(frames);
  expect(committed.profiles.desktop.overflow).toBe("clip");
  expect(screen.getByLabelText("Canvas height").value).toBe("540");
});

it("rounds the clamped height up for preview and commit while preserving rotated placements", () => {
  const page = structuredClone(usePageStore.getState().page), c = page.layout.compositions.canvas;
  page.widgets.b.settings.image_transform.dimensions.width = { unit: "%", value: 25.02083333 };
  c.placements.b.version = 3;
  Object.assign(c.placements.b.frames.desktop, { rotation: 90, rotationPivot: { x: 0, y: 0 } });
  usePageStore.setState({ page });
  const frames = structuredClone(c.placements), preview = vi.fn();
  window.addEventListener("wyrmetizer:numeric-preview", preview);
  try {
    render(<CompositionControls widgetId="a" />);
    const input = screen.getByLabelText("Canvas height");
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "50" } });
    expect(preview.mock.lastCall[0].detail.value).toBe(541);
    fireEvent.keyDown(input, { key: "Enter" });
    const committed = usePageStore.getState().page.layout.compositions.canvas;
    expect(committed.profiles.desktop.height.valuePx).toBe(541);
    expect(committed.placements).toEqual(frames);
    expect(screen.getByLabelText("Canvas height").value).toBe("541");
  } finally { window.removeEventListener("wyrmetizer:numeric-preview", preview); }
});
function pointer(target, type) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 7 });
  fireEvent(target, event);
}
it.each(["Image rotation angle", "Canvas height"])("press-and-hold %s produces one reversible Undo entry per hold", label => {
  vi.useFakeTimers();
  const before = structuredClone(usePageStore.getState().page);
  render(<CompositionControls widgetId="a" />);
  pointer(screen.getByRole("button", { name: `Increase ${label}` }), "pointerdown");
  act(() => vi.advanceTimersByTime(500));
  expect(usePageStore.getState().page).toEqual(before);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(0);
  pointer(document, "pointerup");
  const after = structuredClone(usePageStore.getState().page);
  expect(after).not.toEqual(before);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
  pointer(screen.getByRole("button", { name: `Increase ${label}` }), "pointerdown");
  act(() => vi.advanceTimersByTime(425));
  pointer(document, "pointerup");
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(2);
  act(() => usePageStore.temporal.getState().undo());
  expect(usePageStore.getState().page).toEqual(after);
  act(() => usePageStore.temporal.getState().undo());
  expect(usePageStore.getState().page).toEqual(before);
  act(() => usePageStore.temporal.getState().redo());
  expect(usePageStore.getState().page).toEqual(after);
});

it.each([["Image rotation angle", 0.4, 0.7], ["Canvas height", 804, 807]])("keyboard repeat %s keeps focus and groups each held key into one Undo entry", (label, first, second) => {
  vi.useFakeTimers();
  const before = structuredClone(usePageStore.getState().page), preview = vi.fn();
  const read = page => label === "Canvas height" ? page.layout.compositions.canvas.profiles.desktop.height.valuePx : page.layout.compositions.canvas.placements.a.frames.desktop.rotation;
  window.addEventListener("wyrmetizer:numeric-preview", preview);
  try {
    render(<CompositionControls widgetId="a" />);
    const input = screen.getByLabelText(label);
    act(() => input.focus());
    fireEvent.keyDown(input, { key: "ArrowUp" });
    act(() => vi.advanceTimersByTime(500));
    expect(input.value).toBe(String(first));
    expect(preview.mock.lastCall[0].detail).toMatchObject({ phase: "preview", value: first });
    expect(usePageStore.getState().page).toEqual(before);
    fireEvent.keyUp(input, { key: "ArrowUp" });
    const after = structuredClone(usePageStore.getState().page);
    expect(read(after)).toBe(first);
    expect(input).toBe(screen.getByLabelText(label));
    expect(input).toHaveFocus();
    expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp", repeat: true });
    act(() => vi.advanceTimersByTime(425));
    fireEvent.keyUp(input, { key: "ArrowUp" });
    expect(read(usePageStore.getState().page)).toBe(second);
    expect(usePageStore.temporal.getState().pastStates).toHaveLength(2);
    act(() => usePageStore.temporal.getState().undo());
    expect(usePageStore.getState().page).toEqual(after);
    expect(input.value).toBe(String(first));
    act(() => usePageStore.temporal.getState().undo());
    expect(usePageStore.getState().page).toEqual(before);
    act(() => usePageStore.temporal.getState().redo());
    expect(usePageStore.getState().page).toEqual(after);
  } finally { window.removeEventListener("wyrmetizer:numeric-preview", preview); }
});
it("keyboard repeat height starts at the clamped minimum without a dead range", () => {
  vi.useFakeTimers();
  const frames = structuredClone(usePageStore.getState().page.layout.compositions.canvas.placements);
  render(<CompositionControls widgetId="a" />);
  const input = screen.getByLabelText("Canvas height");
  act(() => input.focus());
  fireEvent.change(input, { target: { value: "50" } });
  fireEvent.keyDown(input, { key: "ArrowUp" });
  expect(input.value).toBe("441");
  act(() => vi.advanceTimersByTime(500));
  expect(input.value).toBe("444");
  fireEvent.keyUp(input, { key: "ArrowUp" });
  const c = usePageStore.getState().page.layout.compositions.canvas;
  expect(c.profiles.desktop.height.valuePx).toBe(444);
  expect(c.placements).toEqual(frames);
  expect(usePageStore.temporal.getState().pastStates).toHaveLength(1);
});
