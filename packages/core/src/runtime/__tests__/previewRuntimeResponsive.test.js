// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

const sent = [];
const observed = [];
let width = 749;
class TestResizeObserver {
  observe(element) { observed.push(element); }
  disconnect() {}
}

window.history.replaceState({}, "", `/?parentOrigin=${encodeURIComponent(window.location.origin)}`);
window.matchMedia = () => ({ get matches() { return width < 750; } });
Object.defineProperty(window, "innerWidth", { configurable: true, get: () => width });
vi.stubGlobal("ResizeObserver", TestResizeObserver);
window.parent.postMessage = (data) => sent.push(data);
await import("../previewRuntime.js");

afterEach(() => {
  document.body.innerHTML = "";
  sent.length = 0;
  observed.length = 0;
});

it("targets active bounds and rebinds selection and ResizeObserver on 749/750px transitions", () => {
  document.body.innerHTML = `<div data-wyrmetizer-responsive>
    <div data-wyrmetizer-presentation="desktop"><section data-widget-id="w"><div data-block-id="b"></div></section></div>
    <div data-wyrmetizer-presentation="mobile"><section data-widget-id="w"><div data-block-id="b"></div></section></div>
  </div>`;
  const desktop = document.querySelector('[data-wyrmetizer-presentation="desktop"] [data-widget-id="w"]');
  const mobile = document.querySelector('[data-wyrmetizer-presentation="mobile"] [data-widget-id="w"]');
  desktop.getBoundingClientRect = () => ({ top: 10, left: 20, width: 300, height: 100 });
  mobile.getBoundingClientRect = () => ({ top: 210, left: 40, width: 150, height: 60 });
  const selected = vi.fn(), deselected = vi.fn();
  mobile.addEventListener("widget:select", selected);
  mobile.addEventListener("widget:deselect", deselected);
  window.dispatchEvent(new MessageEvent("message", { origin: window.location.origin, source: window.parent,
    data: { type: "UPDATE_SELECTION", payload: { widgetId: "w", blockId: null } } }));
  window.dispatchEvent(new MessageEvent("message", { origin: window.location.origin, source: window.parent,
    data: { type: "GET_ELEMENT_BOUNDS", payload: { widgetId: "w" } } }));
  expect(sent.findLast((item) => item.type === "ELEMENT_BOUNDS").payload.bounds).toEqual({ top: 210, left: 40, width: 150, height: 60 });
  expect(selected).toHaveBeenCalledOnce();
  expect(observed).toContain(mobile);

  width = 750;
  window.dispatchEvent(new Event("resize"));
  expect(deselected).toHaveBeenCalledOnce();
  expect(desktop).toBe(document.querySelector('[data-wyrmetizer-presentation="desktop"] [data-widget-id="w"]'));
  expect(observed).toContain(desktop);
  expect(sent.findLast((item) => item.type === "ELEMENT_BOUNDS").payload.bounds).toEqual({ top: 10, left: 20, width: 300, height: 100 });
});
