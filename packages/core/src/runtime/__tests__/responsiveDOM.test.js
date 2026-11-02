// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { activeArea, activePresentation, activeWidget } from "../responsiveDOM.js";

afterEach(() => {
  document.body.innerHTML = "";
  delete window.matchMedia;
});

function setWidth(width) {
  window.matchMedia = (query) => ({ matches: query.includes("749px") && width < 750 });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

it.each([[749, "mobile"], [750, "desktop"]])("resolves active Widget and Area at %i px", (width, presentation) => {
  document.body.innerHTML = `<div data-wyrmetizer-responsive>
    <div data-wyrmetizer-presentation="desktop"><section data-widget-id="w" id="w--wyrmetizer-desktop"></section><section data-composition-id="a"></section></div>
    <div data-wyrmetizer-presentation="mobile"><section data-widget-id="w" id="w--wyrmetizer-mobile"></section><section data-composition-id="a"></section></div>
  </div>`;
  setWidth(width);
  expect(activePresentation(document)).toBe(presentation);
  expect(activeWidget(document, "w").closest("[data-wyrmetizer-presentation]").dataset.wyrmetizerPresentation).toBe(presentation);
  expect(activeArea(document, "a").closest("[data-wyrmetizer-presentation]").dataset.wyrmetizerPresentation).toBe(presentation);
});

it("does not fall back to a hidden responsive instance when the active one is absent", () => {
  document.body.innerHTML = `<div data-wyrmetizer-responsive><div data-wyrmetizer-presentation="desktop"><section data-widget-id="desktop-only"></section><section data-composition-id="desktop-only"></section></div><div data-wyrmetizer-presentation="mobile"></div></div>`;
  setWidth(390);
  expect(activeWidget(document, "desktop-only")).toBeNull();
  expect(activeArea(document, "desktop-only")).toBeNull();
});
