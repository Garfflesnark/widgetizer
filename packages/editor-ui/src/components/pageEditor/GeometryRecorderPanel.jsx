import { useEffect, useRef, useState } from "react";
import { getPreviewTargetOrigin } from "../../lib/previewBase";

export default function GeometryRecorderPanel({ iframeRef }) {
  const [status, setStatus] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const sendRef = useRef(() => {});

  useEffect(() => {
    const pending = new Map();
    let sequence = 0, session = null, hadCapture = false;
    const send = (command, payload = {}) => {
      if (command === "status" && pending.size) return;
      const requestId = `recorder-${++sequence}`;
      const timeout = window.setTimeout(() => {
        pending.delete(requestId);
        setBusy(false);
        setStatus(null);
        setFeedback("Preview recorder did not respond. Check that the local development preview is ready, then try again.");
      }, 3000);
      pending.set(requestId, { command, timeout });
      if (command !== "status") setBusy(true);
      iframeRef.current?.contentWindow?.postMessage({ type: "WZ_COMPOSITION_GEOMETRY_RECORDER_CONTROL", command, requestId, ...payload }, getPreviewTargetOrigin());
    };
    sendRef.current = send;
    const receive = (event) => {
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== getPreviewTargetOrigin() ||
          event.data?.type !== "WZ_COMPOSITION_GEOMETRY_RECORDER_STATUS") return;
      const data = event.data, request = pending.get(data.requestId);
      if (!request) return;
      window.clearTimeout(request.timeout);
      pending.delete(data.requestId);
      if (request.command !== "status") setBusy(false);
      if (session && session !== data.session && hadCapture) {
        setFeedback("Preview regenerated: the previous capture was lost. Start Recording to begin a new capture.");
        hadCapture = false;
        if (request.command !== "start") {
          session = data.session;
          setStatus(data.status || null);
          return;
        }
      }
      session = data.session;
      if (data.error) { setStatus(null); setFeedback(data.error); return; }
      setStatus(data.status);
      if (request.command === "start") { hadCapture = true; setFeedback("New capture started. Reproduce the issue, then stop and export."); }
      if (request.command === "stop") setFeedback("Recording stopped. Captured events are preserved for export.");
      if (request.command === "export" && data.report) {
        try {
          const url = URL.createObjectURL(new Blob([JSON.stringify(data.report, null, 2)], { type: "application/json" }));
          const link = document.createElement("a");
          link.href = url; link.download = "composition-geometry-diagnostic.json"; link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 0);
          setFeedback("JSON report downloaded.");
        } catch { setFeedback("Download failed. The capture is preserved; try Export JSON again."); }
      }
    };
    let iframe = iframeRef.current;
    const loaded = () => {
      pending.forEach(({ timeout }) => window.clearTimeout(timeout));
      pending.clear();
      setBusy(false);
      setStatus(null);
      if (hadCapture) setFeedback("Preview regenerated: the previous capture was lost. Start Recording to begin a new capture.");
      hadCapture = false;
      send("status");
    };
    iframe?.addEventListener("load", loaded);
    window.addEventListener("message", receive);
    send("status");
    const interval = window.setInterval(() => {
      if (iframe !== iframeRef.current) {
        iframe?.removeEventListener("load", loaded);
        iframe = iframeRef.current;
        iframe?.addEventListener("load", loaded);
        loaded();
      } else send("status");
    }, 750);
    return () => {
      window.clearInterval(interval);
      pending.forEach(({ timeout }) => window.clearTimeout(timeout));
      iframe?.removeEventListener("load", loaded);
      window.removeEventListener("message", receive);
      sendRef.current = () => {};
    };
  }, [iframeRef]);

  return <details className="absolute bottom-2 left-2 z-30 max-w-[calc(100%-1rem)] rounded bg-slate-800 px-3 py-1 text-xs text-slate-200 shadow">
    <summary className="cursor-pointer">Geometry diagnostics (development only)</summary>
    <div className="flex flex-wrap items-center gap-3 py-2">
      <button className="rounded border border-slate-500 px-2 py-1 disabled:opacity-40" type="button" disabled={busy} onClick={() => sendRef.current("start")}>Start Recording</button>
      <button className="rounded border border-slate-500 px-2 py-1 disabled:opacity-40" type="button" disabled={busy || !status?.recording} onClick={() => sendRef.current("stop")}>Stop Recording</button>
      <button className="rounded border border-slate-500 px-2 py-1 disabled:opacity-40" type="button" disabled={busy || !status?.hasCapture} onClick={() => sendRef.current("export")}>Export JSON</button>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={status?.frameCaptureEnabled === true} disabled={busy || !status?.recording}
          onChange={event => sendRef.current("frame-capture", { enabled: event.target.checked })} />
        Capture pivot frames
      </label>
      <span role="status">{status ? `${status.recording ? "Recording" : "Stopped"} · ${status.retained}/${status.maxEvents} events · ${status.dropped} dropped · ${status.retainedFrames || 0}/${status.maxFrames || 1800} frames${status.frameCaptureTruncated ? " · frame limit reached" : ""}` : "Recorder status unavailable"}</span>
      <span role="status">{feedback}</span>
      <span>Frame capture is off by default and samples only active pivot drags. Start replaces the previous capture. Export before the preview regenerates.</span>
    </div>
  </details>;
}
