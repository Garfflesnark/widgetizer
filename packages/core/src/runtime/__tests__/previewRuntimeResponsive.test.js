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
  width = 749;
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

it("applies only the active v3 presentation geometry and rejects stale sync messages across repeated switches", () => {
  width = 749;
  document.body.innerHTML = `<div data-wyrmetizer-responsive>
    <div data-wyrmetizer-presentation="desktop"><section data-composition-id="canvas" data-composition-mode="composition" data-composition-width="1200" data-composition-height="800"><div data-composition-child="w" data-composition-frame="{}"></div></section></div>
    <div data-wyrmetizer-presentation="mobile"><section data-composition-id="canvas" data-composition-mode="composition" data-composition-width="390" data-composition-height="400"><div data-composition-child="w" data-composition-frame="{}"></div></section></div>
  </div>`;
  window.dispatchEvent(new Event("resize"));
  const mobileContext = sent.findLast((item) => item.type === "PRESENTATION_CONTEXT");
  const mobileEpoch = mobileContext?.payload.epoch ?? 0;
  const desktopArea = document.querySelector('[data-wyrmetizer-presentation="desktop"] [data-composition-id]');
  const mobileArea = document.querySelector('[data-wyrmetizer-presentation="mobile"] [data-composition-id]');
  const desktopChild = desktopArea.querySelector("[data-composition-child]");
  const mobileChild = mobileArea.querySelector("[data-composition-child]");
  const sendSync = (presentation, epoch, syncRevision, left, widthPx, heightPx) => window.dispatchEvent(new MessageEvent("message", {
    origin: window.location.origin, source: window.parent,
    data: { type: "COMPOSITION_SYNC", responsive: true, presentation, presentationEpoch: epoch, syncRevision,
      context: "mobile", movementLocks: {}, sizes: {}, revisions: { w: `rev-${presentation}-${syncRevision}` }, payload: {},
      resolvedPresentation: { presentation, areas: { canvas: { mode: "composition", widthPx, heightPx, stackOrder: ["w"], placements: {
        w: { frame: { x: 0.25, y: 0.2, pivot: { x: 0, y: 0 } }, rect: { left, top: 80, width: 100, height: 50 } },
      } } } },
    },
  }));

  sendSync("mobile", mobileEpoch, 1, 97.5, 390, 400);
  expect(mobileArea.dataset.compositionWidth).toBe("390");
  expect(mobileChild.style.left).toBe("25%");
  expect(mobileChild.dataset.compositionRevision).toBe("rev-mobile-1");
  expect(desktopChild.dataset.compositionRevision).toBeUndefined();

  sendSync("desktop", mobileEpoch, 2, 300, 1200, 800);
  expect(desktopChild.dataset.compositionRevision).toBeUndefined();
  width = 750;
  window.dispatchEvent(new Event("resize"));
  const desktopContext = sent.findLast((item) => item.type === "PRESENTATION_CONTEXT");
  expect(desktopContext.payload.epoch).toBe(mobileEpoch + 1);
  sendSync("desktop", mobileEpoch + 1, 2, 300, 1200, 800);
  expect(desktopChild.dataset.compositionRevision).toBe("rev-desktop-2");
  expect(desktopChild.style.left).toBe("25%");

  width = 749;
  window.dispatchEvent(new Event("resize"));
  expect(sent.findLast((item) => item.type === "PRESENTATION_CONTEXT").payload.epoch).toBe(mobileEpoch + 2);
  sendSync("desktop", mobileEpoch + 1, 3, 500, 1200, 800);
  expect(desktopChild.dataset.compositionRevision).toBe("rev-desktop-2");
  sendSync("mobile", mobileEpoch + 2, 3, 97.5, 390, 400);
  expect(mobileChild.dataset.compositionRevision).toBe("rev-mobile-3");
});

it("initializes Widget-specific inline scripts only for the active responsive form instance", () => {
  width = 749;
  document.body.innerHTML = `<div data-wyrmetizer-responsive>
    <div data-wyrmetizer-presentation="desktop"><section id="form-desktop" data-widget-id="form"><form data-widgetizer-form><input id="email-desktop" aria-describedby="error-desktop"><p id="error-desktop"></p></form><script>var section=typeof widget!=="undefined"&&widget||document.currentScript&&document.currentScript.closest('[data-widget-id]');var form=section&&section.querySelector('form[data-widgetizer-form]');if(form)form.dataset.fieldErrors='true';</script></section></div>
    <div data-wyrmetizer-presentation="mobile"><section id="form-mobile" data-widget-id="form"><form data-widgetizer-form><input id="email-mobile" aria-describedby="error-mobile"><p id="error-mobile"></p></form><script>var section=typeof widget!=="undefined"&&widget||document.currentScript&&document.currentScript.closest('[data-widget-id]');var form=section&&section.querySelector('form[data-widgetizer-form]');if(form)form.dataset.fieldErrors='true';</script></section></div>
  </div>`;
  const desktop = document.querySelector('[data-wyrmetizer-presentation="desktop"] [data-widget-id="form"]');
  const mobile = document.querySelector('[data-wyrmetizer-presentation="mobile"] [data-widget-id="form"]');

  window.PreviewRuntime.initializeWidget("form");
  expect(mobile.querySelector("form").dataset.fieldErrors).toBe("true");
  expect(desktop.querySelector("form").dataset.fieldErrors).toBeUndefined();

  width = 750;
  window.dispatchEvent(new Event("resize"));
  expect(desktop.querySelector("form").dataset.fieldErrors).toBe("true");
  expect(mobile.querySelector("form").dataset.fieldErrors).toBe("true");
});
