import { useState } from "react";
import ConfirmationModal from "../ui/ConfirmationModal";
import { createWyrmetizerCopy } from "@widgetizer/core/wyrmetizerLayouts";
import { compositionAdapters } from "@widgetizer/core/compositionImage";
import { editorFetchJson } from "../../lib/apiFetch";

export default function WyrmetizerCompatibility({ page, incompatible = false }) {
  const [open, setOpen] = useState(incompatible), [busy, setBusy] = useState(false), [result, setResult] = useState(null), [error, setError] = useState("");
  let supported = false;
  try { if (page && (page.layout == null || page.layout.version === 1)) { createWyrmetizerCopy(page, compositionAdapters); supported = true; } } catch { /* Invalid files have no conversion path. */ }
  const convert = async () => {
    if (!supported || busy) return;
    setBusy(true); setError("");
    try {
      const copy = await editorFetchJson(`/pages/${encodeURIComponent(page.id)}/convert-wyrmetizer`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page, language: page.language }),
      }, { fallbackMessage: "Conversion failed. The original page remains available." });
      setResult(copy);
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  };
  return <div className="space-y-2 text-xs">
    <button type="button" className="text-pink-700 underline disabled:opacity-40" disabled={busy} onClick={() => setOpen(true)}>
      {busy ? "Creating converted copy…" : incompatible ? "Open with Compatible Layout" : "Create a paired-layout copy"}
    </button>
    <ConfirmationModal isOpen={open} onClose={() => setOpen(false)} onConfirm={convert} confirmDisabled={!supported || busy}
      title="Open with Compatible Layout" confirmText="Convert" cancelText="Cancel" variant="warning"
      message={<span className="whitespace-pre-line">{"This file is not compatible with Wyrmetizer.\n\nConvert this file to work with Wyrmetizer?\n\nWARNING: Conversion may corrupt, alter or distort current work."}
        <span className="block mt-3">{supported ? "A separately named copy will be created. The original remains unchanged. Flow starts from current dimensions because historical Flow geometry was not stored. Keep the new copy out of older installations." : "No validated conversion path exists. A compatible application version is required; this file will not be changed."}</span>
      </span>} />
    {result && <p role="status">Converted copy ready: <a className="text-pink-700 underline" href={`?pageId=${encodeURIComponent(result.id)}${result.language ? `&language=${encodeURIComponent(result.language)}` : ""}`}>{result.name}</a>. Original preserved.</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
