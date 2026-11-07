// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { compositionAdapters } from "@widgetizer/core/compositionImage";
import { createWyrmetizerCopy, convertWyrmetizerPageToV3, serializeWyrmetizerEditorPage } from "@widgetizer/core/wyrmetizerLayouts";
import { fixture } from "../../../../../core/src/runtime/__tests__/compositionFixture.js";
import schema from "../../../../../../themes/arch/widgets/image/schema.json";
import SelectionOverlay from "../SelectionOverlay";
import usePageStore from "../../../stores/pageStore";
import useWidgetStore from "../../../stores/widgetStore";
import useToastStore from "../../../stores/toastStore";

globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};

afterEach(() => useToastStore.getState().clearToasts());

function pageV3() {
  const page = convertWyrmetizerPageToV3(createWyrmetizerCopy(fixture(), compositionAdapters), compositionAdapters);
  page.widgets.a.settings.name = "Alpha";
  for (const id of ["a", "b"]) {
    const dimensions = page.layout.areas.canvas.composition.presentation[id].image_transform.dimensions;
    dimensions.width.value = null;
    dimensions.height.value = null;
  }
  return page;
}

function harness() {
  const postMessage = vi.fn();
  const iframe = {
    contentWindow: { innerWidth: 1200, postMessage },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const iframeRef = { current: iframe };
  return { postMessage, iframeRef };
}

function configure(page) {
  usePageStore.getState().setPage(page);
  useWidgetStore.setState({
    schemas: { image: { ...schema, displayName: "Image" } },
    imageGeometry: Object.fromEntries(["a", "b"].map(id => [id, {
      imageSource: "/uploads/images/photo.jpg", naturalWidth: 300, naturalHeight: 200,
      width: 300, height: 200, containerWidth: 1200,
    }])),
  });
}

it("uses matching intrinsic image dimensions and reports invalid bounds without a partial sync", () => {
  const page = pageV3();
  configure(page);
  const { postMessage, iframeRef } = harness();
  render(<SelectionOverlay iframeRef={iframeRef} />);

  expect(postMessage.mock.calls.some(([message]) => message.type === "COMPOSITION_SYNC")).toBe(true);
  expect(useToastStore.getState().toasts).toHaveLength(0);

  postMessage.mockClear();
  const invalid = structuredClone(page);
  invalid.layout.areas.canvas.composition.geometry.placements.a.frames.desktop.x = 0.99;
  act(() => usePageStore.getState().setPage(invalid));

  expect(postMessage.mock.calls.some(([message]) => ["COMPOSITION_SYNC", "SET_IMAGE_RESIZE_SUPPORT"].includes(message.type))).toBe(false);
  expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
    variant: "error",
    message: expect.stringContaining('Widget “Alpha” in Composition Area “canvas”'),
  });
  expect(useToastStore.getState().toasts.at(-1).message).toMatch(/adjust its size or position|increase the Area height/i);
  expect(serializeWyrmetizerEditorPage(usePageStore.getState().page, compositionAdapters))
    .toEqual(serializeWyrmetizerEditorPage(invalid, compositionAdapters));
});
