// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import GeometryRecorderPanel from "../GeometryRecorderPanel";
import { getPreviewTargetOrigin } from "../../../lib/previewBase";

let iframe, post, session, recording, retained, downloaded;
beforeEach(() => {
  vi.useFakeTimers();
  session = "first"; recording = false; retained = 0;
  iframe = document.createElement("iframe"); document.body.append(iframe);
  post = vi.spyOn(iframe.contentWindow, "postMessage");
  downloaded = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:fixture"), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(downloaded);
});
afterEach(() => { cleanup(); iframe.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
function reply(overrides = {}) {
  const data = post.mock.lastCall[0];
  if (data.command === "start") { recording = true; retained = 0; }
  if (data.command === "stop") recording = false;
  act(() => window.dispatchEvent(new MessageEvent("message", { source: iframe.contentWindow, origin: getPreviewTargetOrigin(),
    data: {
      type: "WZ_COMPOSITION_GEOMETRY_RECORDER_STATUS", requestId: data.requestId, session,
      status: { hasCapture: data.command !== "status" || recording || retained > 0, recording, retained, dropped: 0, maxEvents: 300,
        frameCaptureEnabled: false, retainedFrames: 0, maxFrames: 1800 },
      ...(data.command === "export" ? { report: { events: [], frames: [], buffer: { retained }, frameBuffer: { retained: 0, dropped: 0 } } } : {}),
      ...overrides,
    } })));
}
function mount() { render(<GeometryRecorderPanel iframeRef={{ current: iframe }} />); reply(); }

it("shows disabled-by-default state, accurate counts, and start/stop/download controls without navigating the iframe", () => {
  mount();
  expect(post.mock.calls[0][0].command).toBe("status");
  expect(screen.getByRole("button", { name: "Stop Recording" }).disabled).toBe(true);
  fireEvent.click(screen.getByText("Start Recording")); reply();
  expect(screen.getByRole("checkbox", { name: "Capture pivot frames" }).disabled).toBe(false);
  retained = 5; act(() => vi.advanceTimersByTime(750)); reply();
  expect(screen.getByText("Recording · 5/300 events · 0 dropped · 0/1800 frames")).toBeTruthy();
  fireEvent.click(screen.getByText("Stop Recording")); reply();
  expect(screen.getByText("Stopped · 5/300 events · 0 dropped · 0/1800 frames")).toBeTruthy();
  fireEvent.click(screen.getByText("Export JSON")); reply();
  expect(downloaded).toHaveBeenCalledOnce();
  expect(iframe.getAttribute("src")).toBeNull();
  expect(post.mock.calls.every(([, origin]) => origin === getPreviewTargetOrigin())).toBe(true);
});

it("sends explicit frame-capture opt-in and includes frame data in exported JSON", () => {
  mount(); fireEvent.click(screen.getByText("Start Recording")); reply();
  fireEvent.click(screen.getByRole("checkbox", { name: "Capture pivot frames" }));
  expect(post.mock.lastCall[0]).toMatchObject({ command: "frame-capture", enabled: true });
  reply({ status: { hasCapture: true, recording: true, retained: 1, dropped: 0, maxEvents: 300,
    frameCaptureEnabled: true, retainedFrames: 2, maxFrames: 1800 } });
  fireEvent.click(screen.getByText("Stop Recording")); reply();
  fireEvent.click(screen.getByText("Export JSON")); reply();
  expect(downloaded).toHaveBeenCalledOnce();
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
  expect(URL.createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
});

it("reports loss on preview load and session replacement", () => {
  mount(); fireEvent.click(screen.getByText("Start Recording")); reply();
  act(() => iframe.dispatchEvent(new Event("load")));
  expect(screen.queryByText(/^Recording ·/)).toBeNull();
  expect(screen.getByText(/previous capture was lost/)).toBeTruthy();
  session = "second"; recording = false; reply();
  fireEvent.click(screen.getByText("Start Recording")); reply();
  session = "third"; recording = false;
  act(() => vi.advanceTimersByTime(750)); reply();
  expect(screen.getByText(/previous capture was lost/)).toBeTruthy();
  expect(screen.queryByText(/^Recording ·/)).toBeNull();
});

it("ignores foreign responses and reports timeout and runtime failures", () => {
  mount(); fireEvent.click(screen.getByText("Start Recording"));
  const requestId = post.mock.lastCall[0].requestId;
  act(() => window.dispatchEvent(new MessageEvent("message", { source: iframe.contentWindow, origin: "https://foreign.test",
    data: { type: "WZ_COMPOSITION_GEOMETRY_RECORDER_STATUS", requestId, status: { recording: true } } })));
  act(() => vi.advanceTimersByTime(3000));
  expect(screen.getByText(/did not respond/)).toBeTruthy();
  fireEvent.click(screen.getByText("Start Recording")); reply({ error: "Recorder unavailable" });
  expect(screen.getByText("Recorder unavailable")).toBeTruthy();
});

it("mounts the controls only in a local development Page Editor", () => {
  const source = readFileSync(`${process.cwd()}/packages/editor-ui/src/components/pageEditor/PreviewPanel.jsx`, "utf8");
  expect(source).toMatch(/import.meta.env.DEV && runtimeMode === "editor" && \["localhost", "127.0.0.1", "::1", "\[::1\]"\].includes\(window.location.hostname\) &&\s*<GeometryRecorderPanel/);
});

it("allows export of an empty stopped capture", () => {
  mount(); fireEvent.click(screen.getByText("Start Recording")); reply();
  fireEvent.click(screen.getByText("Stop Recording")); reply();
  expect(screen.getByText("Export JSON").disabled).toBe(false);
  fireEvent.click(screen.getByText("Export JSON")); reply();
  expect(downloaded).toHaveBeenCalledOnce();
});
