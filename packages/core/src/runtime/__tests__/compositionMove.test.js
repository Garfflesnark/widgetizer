// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createCompositionMoveController } from "../compositionMove.js";
let commit, controller, grip;
function pointer(type, x, y, target = document) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(e, "pointerId", { value: 1 });
  target.dispatchEvent(e);
}
beforeEach(() => {
  document.body.innerHTML = `<section data-composition-id="c" data-composition-width="1200" data-composition-height="800"><div data-composition-child="a" data-composition-frame='{"x":0.1,"y":0.1,"pivot":{"x":0,"y":0}}'><section data-widget-id="a"><div data-image-resize-target><img></div></section></div></section><div id="wz-selection-overlay"><button data-composition-move="a">Move image</button></div>`;
  document.querySelector("[data-composition-id]").getBoundingClientRect = () => ({
    left: 0,
    top: 50,
    width: 1200,
    height: 800,
  });
  document.querySelector("[data-widget-id]").getBoundingClientRect = () => ({
    left: 120,
    top: 170,
    width: 300,
    height: 200,
  });
  grip = document.querySelector("button");
  commit = vi.fn();
  controller = createCompositionMoveController({ document, selected: () => "a", onPreview: vi.fn(), onCommit: commit });
});
afterEach(() => {
  controller.destroy();
  vi.restoreAllMocks();
});
it("moves independently, constrains canvas bounds and commits once on release", () => {
  pointer("pointerdown", 120, 170, grip);
  pointer("pointermove", 500, 400);
  pointer("pointermove", 2000, 2000);
  pointer("pointerup", 2000, 2000);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0].frame).toEqual({ x: 0.75, y: 0.5, pivot: { x: 0, y: 0 } });
  expect(commit.mock.calls[0][0].startFrame.x).toBe(0.1);
});
it.each(["pointercancel", "lostpointercapture", "Escape"])(
  "cancels %s without committing or retaining transient geometry",
  (reason) => {
    pointer("pointerdown", 120, 170, grip);
    pointer("pointermove", 500, 400);
    if (reason === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    else pointer(reason, 500, 400);
    expect(commit).not.toHaveBeenCalled();
    expect(document.querySelector("[data-composition-child]").getAttribute("style")).toBeNull();
  },
);
it("clicks below threshold and generated mobile have no gesture history", () => {
  pointer("pointerdown", 120, 170, grip);
  pointer("pointerup", 121, 171);
  expect(commit).not.toHaveBeenCalled();
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
  pointer("pointerdown", 120, 170, grip);
  pointer("pointerup", 500, 400);
  expect(commit).not.toHaveBeenCalled();
});
it("moves a body surface only after selection, and keeps resize/menu interactions separate", () => {
  pointer("pointerdown", 120, 170, document.querySelector("img"));
  pointer("pointerup", 220, 270);
  expect(commit).toHaveBeenCalledTimes(1);
  commit.mockClear();
  grip.className = "wz-image-resize-handle";
  pointer("pointerdown", 120, 170, grip);
  pointer("pointerup", 220, 270);
  expect(commit).not.toHaveBeenCalled();
});

it("drags linked images without native HTML dragging or mid-gesture canonical reset", () => {
  const child = document.querySelector('[data-composition-child]'); child.dataset.compositionRevision = "r1";
  const image = document.querySelector("img"), anchor = document.createElement("a"); anchor.href = "/index.html";
  image.before(anchor); anchor.append(image);
  const native = new Event("dragstart", { bubbles: true, cancelable: true }); image.dispatchEvent(native); expect(native.defaultPrevented).toBe(true);
  pointer("pointerdown", 120, 170, image); pointer("pointermove", 220, 270);
  controller.reconcile(undefined, { a: "r1" }); expect(controller.active).toBe(true);
  pointer("pointerup", 220, 270);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0].frame.x).toBeCloseTo(220 / 1200, 5);
});

it("consumes capture-retargeted release clicks before background selection, but permits intentional later clicks", () => {
  const select = vi.fn();
  document.addEventListener("click", select, true);
  try {
    pointer("pointerdown", 120, 170, document.querySelector("img"));
    pointer("pointerup", 220, 270);
    document.querySelector("[data-composition-id]").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    expect(select).not.toHaveBeenCalled();
    pointer("pointerdown", 20, 60, document.querySelector("[data-composition-id]"));
    document.querySelector("[data-composition-id]").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    expect(select).toHaveBeenCalledTimes(1);
  } finally { document.removeEventListener("click", select, true); }
});
it("keeps repeated gestures independent and suppresses cancellation release without changing stack order", () => {
  const child = document.querySelector("[data-composition-child]"); child.style.zIndex = "1";
  const select = vi.fn(); document.addEventListener("click", select, true);
  try {
    for (let i = 0; i < 2; i++) {
      pointer("pointerdown", 120, 170, document.querySelector("img"));
      pointer("pointerup", 220, 270);
      document.querySelector("[data-composition-id]").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    }
    expect(commit).toHaveBeenCalledTimes(2);
    pointer("pointerdown", 120, 170, document.querySelector("img"));
    pointer("pointermove", 220, 270); pointer("pointercancel", 220, 270);
    document.querySelector("[data-composition-id]").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    expect(select).not.toHaveBeenCalled();
    expect(child.style.zIndex).toBe("1");
    expect(commit).toHaveBeenCalledTimes(2);
  } finally { document.removeEventListener("click", select, true); }
});
it("gates image-body dragging by temporary mode while retaining the movement grip", () => {
  controller.destroy(); let enabled = false;
  controller = createCompositionMoveController({ document, selected: () => "a", isEnabled: () => enabled, onPreview: vi.fn(), onCommit: commit });
  pointer("pointerdown", 120, 170, document.querySelector("img")); pointer("pointerup", 220, 270);
  expect(commit).not.toHaveBeenCalled();
  enabled = true;
  pointer("pointerdown", 120, 170, document.querySelector("img")); pointer("pointerup", 220, 270);
  expect(commit).toHaveBeenCalledTimes(1);
  enabled = false;
  pointer("pointerdown", 120, 170, grip); pointer("pointerup", 220, 270);
  expect(commit).toHaveBeenCalledTimes(2);
});

it("retains a stationary grip node for a real click toggle and delays pointer capture until movement", () => {
  controller.destroy();
  const preview = vi.fn(), start = vi.fn(), capture = vi.fn();
  document.querySelector("#wz-selection-overlay").setPointerCapture = capture;
  controller = createCompositionMoveController({ document, selected: () => "a", onPreview: preview, onStart: start, onCommit: commit });
  pointer("pointerdown", 120, 170, grip);
  expect(capture).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
  pointer("pointerup", 120, 170);
  expect(preview).not.toHaveBeenCalled(); expect(grip.isConnected).toBe(true);
  const click = vi.fn(); grip.addEventListener("click", click); grip.click(); expect(click).toHaveBeenCalledTimes(1);
  pointer("pointerdown", 120, 170, grip); pointer("pointermove", 220, 270);
  expect(capture).toHaveBeenCalledTimes(1); expect(start).toHaveBeenCalledTimes(1);
});

it("does not suppress unrelated keyboard activation after a movement", () => {
  pointer("pointerdown", 120, 170, document.querySelector("img")); pointer("pointerup", 220, 270);
  const select = vi.fn(), area = document.querySelector("[data-composition-id]");
  area.addEventListener("click", select); area.click(); expect(select).toHaveBeenCalledTimes(1);
});
it("accounts for nested scrolling in design coordinates during a scaled drag", () => {
  const area = document.querySelector("[data-composition-id]"); let top = 50;
  area.getBoundingClientRect = () => ({ left: 0, top, width: 600, height: 400 });
  document.querySelector("[data-widget-id]").getBoundingClientRect = () => ({ left: 60, top: 110, width: 150, height: 100 });
  pointer("pointerdown", 60, 110, document.querySelector("img"));
  top = -50;
  pointer("pointermove", 110, 160); pointer("pointerup", 110, 160);
  expect(commit.mock.calls[0][0].frame.x).toBeCloseTo(220 / 1200, 6);
  expect(commit.mock.calls[0][0].frame.y).toBeCloseTo(420 / 1200, 6);
});
