import { expect, it } from "vitest";
import { fixture } from "./compositionFixture.js";
import { orderingControls } from "../orderingControls.js";
it("distinguishes layer and page boundaries for the same composition", () => {
  const page = fixture();
  expect(orderingControls(page, { widgetId: "a" })).toMatchObject({
    scope: "image",
    up: true,
    down: false,
    upLabel: "Bring Forward",
  });
  expect(orderingControls(page, { widgetId: "b" })).toMatchObject({ scope: "image", up: false, down: true });
  expect(orderingControls(page, { compositionId: "canvas" })).toMatchObject({
    scope: "composition",
    up: false,
    down: true,
    upLabel: "Move Block Up",
  });
  expect(orderingControls(page, { widgetId: "after" })).toMatchObject({ scope: "widget", up: true, down: false });
  expect(orderingControls(page)).toBeNull();
});
