// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

const sent = [];
window.history.replaceState({}, "", `/?parentOrigin=${encodeURIComponent(window.location.origin)}`);
document.body.innerHTML = '<script data-preview-mode="editor" data-geometry-recorder-available="true"></script><button data-rotation-pivot="fixture"></button>';
window.matchMedia = () => ({ matches: false });
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
window.parent.postMessage = data => sent.push(data);
await import("../previewRuntime.js");
let sequence = 0;
async function command(command, overrides = {}) {
  const requestId = String(++sequence);
  window.dispatchEvent(new MessageEvent("message", { source: window.parent, origin: window.location.origin,
    ...overrides, data: { type: "WZ_COMPOSITION_GEOMETRY_RECORDER_CONTROL", command, requestId } }));
  await vi.waitFor(() => expect(sent.some(item => item.requestId === requestId)).toBe(true));
  return sent.find(item => item.requestId === requestId);
}
function pivot() { document.querySelector("[data-rotation-pivot=fixture]").dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); }

it("starts on the existing preview, captures, stops without data loss, and exports the bounded report", async () => {
  const before = document.body.innerHTML;
  expect((await command("status")).status).toMatchObject({ recording: false, retained: 0 });
  expect(sent.some(item => item.type === "WZ_COMPOSITION_GEOMETRY_RECORDER_READY")).toBe(false);
  await command("start");
  pivot(); await Promise.resolve();
  expect((await command("status")).status).toMatchObject({ recording: true, retained: 1, maxEvents: 300 });
  expect((await command("stop")).status).toMatchObject({ recording: false, retained: 1 });
  pivot(); await Promise.resolve();
  const result = await command("export");
  expect(result.report.events.map(event => event.label)).toEqual(["pivot-pointerdown"]);
  expect(result.report.buffer).toEqual({ retained: 1, dropped: 0 });
  expect(document.body.innerHTML).toBe(before);
  expect(sent.filter(item => item.type === "PREVIEW_READY")).toHaveLength(1);
  await command("start");
  expect((await command("status")).status.retained).toBe(0);
  await command("stop");
});

it("rejects foreign messages and unavailable production/standalone previews", async () => {
  for (const overrides of [{ origin: "https://foreign.test" }, { source: null }]) {
    window.dispatchEvent(new MessageEvent("message", { source: window.parent, origin: window.location.origin,
      ...overrides, data: { type: "WZ_COMPOSITION_GEOMETRY_RECORDER_CONTROL", command: "start", requestId: "foreign" } }));
  }
  await Promise.resolve();
  expect(sent.some(item => item.requestId === "foreign")).toBe(false);
  document.querySelector("script").dataset.geometryRecorderAvailable = "false";
  expect((await command("start")).error).toContain("unavailable");
  document.querySelector("script").dataset.geometryRecorderAvailable = "true";
  expect((await command("invalid")).error).toContain("Unknown");
});
