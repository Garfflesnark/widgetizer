import { describe, it, expect } from "vitest";
import {
  validateCompositionLayout,
  changeStack,
  dissolveComposition,
  reconcileCompositionCrud,
  compositionRect,
  frameFromRect,
} from "../composition.js";
import { compositionAdapters, compositionImageRect } from "../compositionImage.js";

import { fixture } from "./compositionFixture.js";
describe("Composition contracts", () => {
  it("opts in explicitly, retaining payloads, IDs and following flow content", () => {
    const page = fixture();
    expect(() => validateCompositionLayout(page, compositionAdapters)).not.toThrow();
    expect(page.layout.contentOrder).toEqual([
      { kind: "composition", id: "canvas" },
      { kind: "widget", id: "after" },
    ]);
    expect(dissolveComposition(page, "canvas").layout).toBeNull();
    expect(dissolveComposition(page, "canvas").widgetsOrder).toEqual(["a", "b", "after"]);
  });
  it("stacking changes only stack order and has no-op boundaries", () => {
    const page = fixture(),
      next = changeStack(page, "a", "forward");
    expect(next.layout.compositions.canvas.stackOrder).toEqual(["b", "a"]);
    expect(next.widgets).toBe(page.widgets);
    expect(next.layout.compositions.canvas.placements).toBe(page.layout.compositions.canvas.placements);
    expect(next.layout.compositions.canvas.childrenOrder).toEqual(["a", "b"]);
    expect(changeStack(next, "a", "forward")).toBe(next);
    expect(changeStack(next, "a", "backward")).toEqual(page);
  });
  it.each([
    (p) => {
      p.layout.version = 2;
    },
    (p) => {
      p.layout.compositions.canvas.stackOrder = ["a", "a"];
    },
    (p) => {
      p.layout.compositions.canvas.childrenOrder.push("missing");
    },
    (p) => {
      p.layout.contentOrder.push({ kind: "widget", id: "a" });
    },
    (p) => {
      p.layout.compositions.canvas.placements.a.frames.desktop.x = NaN;
    },
    (p) => {
      p.layout.compositions.canvas.placements.a.frames.desktop.pivot.x = 2;
    },
    (p) => {
      p.widgets.a.type = "video";
    },
    (p) => {
      p.layout.compositions.canvas.responsive.defaultMode = "reflow";
    },
    (p) => {
      p.layout.compositions.canvas.profiles.desktop.height.valuePx = 0;
    },
    (p) => {
      p.widgetsOrder.reverse();
    },
  ])("rejects invalid or unsupported layout without silently flattening", (edit) => {
    const p = fixture();
    edit(p);
    expect(() => validateCompositionLayout(p, compositionAdapters)).toThrow(/Composition layout/);
  });
  it("supports a registered nonimage capability without schema changes", () => {
    const page = fixture();
    page.widgets.a = { type: "text", settings: {} };
    expect(() =>
      validateCompositionLayout(page, { ...compositionAdapters, text: { supports: (w) => w.type === "text" } }),
    ).not.toThrow();
  });
  it("resolves normalized pivots, uniform responsive geometry and independent units", () => {
    const p = fixture(),
      c = p.layout.compositions.canvas,
      frame = c.placements.a.frames.desktop;
    const r = compositionImageRect(p.widgets.a, c, frame, 1600, 900);
    expect(r).toEqual({ left: 450, top: 180, width: 300, height: 200 });
    expect(Object.values(r).map((v) => (v * 390) / 1200)).toEqual([146.25, 58.5, 97.5, 65]);
    expect(frameFromRect(r, frame.pivot, 1200)).toEqual(frame);
    expect(compositionRect(frame, 300, 200, 1200)).toEqual(r);
  });
  it("keeps legacy CRUD valid and copies in flow without orphan placement", () => {
    const p = fixture();
    const next = reconcileCompositionCrud(
      {
        ...p,
        widgets: { ...p.widgets, copy: structuredClone(p.widgets.a) },
        widgetsOrder: ["a", "copy", "b", "after"],
      },
      p,
    );
    expect(next.layout.compositions.canvas.childrenOrder).toEqual(["a", "b"]);
    expect(next.layout.contentOrder).toContainEqual({ kind: "widget", id: "copy" });
    expect(() => validateCompositionLayout(next, compositionAdapters)).not.toThrow();
    const removed = reconcileCompositionCrud({ ...p, widgets: { after: p.widgets.after }, widgetsOrder: ["after"] }, p);
    expect(() => validateCompositionLayout(removed, compositionAdapters)).not.toThrow();
  });
});
