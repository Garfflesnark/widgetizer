import { useState } from "react";
import CompositionNumberInput from "./CompositionNumberInput";
import WyrmetizerCompatibility from "./WyrmetizerCompatibility";
import { compositionFor, compositionRevision } from "@widgetizer/core/composition";
import { compositionAdapters } from "@widgetizer/core/compositionImage";
import usePageStore from "../../stores/pageStore";
import useWidgetStore from "../../stores/widgetStore";
import {
  convertImages,
  layerImage,
  returnCompositionToFlow,
  compositionHeightValue,
  setCompositionHeight,
  rotateCompositionImage,
  switchPairedCompositionMode,
  compositionInteractionContext,
} from "../../lib/compositionActions";

export default function CompositionControls({ widgetId, blockSelected = false }) {
  const page = usePageStore((s) => s.page),
    schemas = useWidgetStore((s) => s.schemas);
  const context = useWidgetStore((s) => s.compositionContext);
  const [ids, setIds] = useState([]),
    [height, setHeight] = useState(() => compositionFor(page, widgetId)?.[1].profiles.desktop.height.valuePx || 1000),
    [error, setError] = useState("");
  const found = compositionFor(page, widgetId);
  const paired = Object.entries(page?.wyrmetizerEditorLayout?.areas || {}).find(([, area]) => area.members.includes(widgetId));
  const eligible = Object.entries(page?.widgets || {}).filter(
    ([id, w]) =>
      !compositionFor(page, id) &&
      schemas[w.type]?.compositionCapability === "image.v1" &&
      compositionAdapters[w.type]?.supports(w),
  );
  const run = (action) => {
    try {
      const result = action();
      setError("");
      return result;
    } catch (e) {
      setError(e.message);
      return false;
    }
  };
  const preview = (field, value, phase = value === null ? "cancel" : "preview") => {
    if (!found) return;
    window.dispatchEvent(new CustomEvent("wyrmetizer:numeric-preview", { detail: {
      field, value: field === "height" && value !== null ? compositionHeightValue(found[0], value) : value, phase, widgetId,
      context: compositionInteractionContext(), revision: compositionRevision(page.widgets[widgetId], found[1].placements[widgetId].frames.desktop),
    } }));
  };
  const button = "shadow-sm shadow-slate-100 hover:shadow-lg hover:shadow-slate-100 aria-pressed:ring-2 aria-pressed:ring-pink-200 aria-pressed:shadow-lg aria-pressed:shadow-pink-100 border rounded px-2 py-1 text-xs text-pink-700 hover:bg-pink-50 disabled:opacity-40";
  if (paired && paired[1].activeMode === "flow") return (
    <section className="p-3 border-b space-y-2" aria-label="Composition Area controls">
      <strong className="text-sm">Composition Area</strong>
      <p className="text-xs">Flow arrangement active. Your Composition arrangement is preserved.</p>
      <button className={button} disabled={context !== "desktop"} onClick={() => run(() => switchPairedCompositionMode(paired[0], "composition"))}>Switch to Composition</button>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </section>
  );
  if (!found && !eligible.some(([id]) => id === widgetId)) return null;
  return (
    <section className="p-3 border-b space-y-2" aria-label="Composition Area controls">
      <strong className="text-sm">{found ? "Composition Area" : "Create Composition Area"}</strong>
      {found && !paired && <WyrmetizerCompatibility page={page} />}
      {found ? (
        <>
          <p className="text-xs">
            {context === "desktop"
              ? "Desktop source · Proportional"
              : `${context}: generated Proportional${found[1].placements[widgetId].responsive.mode === "custom" || found[1].responsive.defaultMode === "custom" ? " (Custom not initialized)" : ""} · geometry read-only`}
          </p>
          <p className="text-xs">
            Dimensions are desktop design units. Proportional scales both dimensions and positions on smaller screens.
          </p>
          {context !== "desktop" && (
            <p className="text-xs">
              Return to Desktop to edit image properties. Custom/Reflow authoring is not included yet.
            </p>
          )}
          <button className={button} onClick={() => useWidgetStore.getState().setSelectedCompositionId(found[0])}>Select Composition Area</button>
          <p className="text-xs">Child reading order (copies enter normal flow):</p>
          <div className="flex flex-col gap-1">
            {found[1].childrenOrder.map((id) => (
              <button
                key={id}
                className={button}
                aria-pressed={!blockSelected && id === widgetId}
                onClick={() => useWidgetStore.getState().setSelectedWidgetId(id)}
              >
                {page.widgets[id].settings?.name || id}
              </button>
            ))}
          </div>
          {!blockSelected && <div className="flex gap-1">
            <button
              className={button}
              disabled={found[1].stackOrder.at(-1) === widgetId}
              onClick={() => run(() => layerImage(widgetId, "forward"))}
            >
              Bring Forward
            </button>
            <button
              className={button}
              disabled={found[1].stackOrder[0] === widgetId}
              onClick={() => run(() => layerImage(widgetId, "backward"))}
            >
              Send Backward
            </button>
          </div>}
          {!blockSelected && <p className="text-xs text-slate-500">Use ↑ ↓ to adjust values</p>}
          {!blockSelected && <label className="block text-xs">
            Rotation (° clockwise)
            <CompositionNumberInput key={`${widgetId}:${context}`}
              label="Image rotation angle" value={found[1].placements[widgetId].frames.desktop.rotation || 0} step={0.1} disabled={context !== "desktop"}
              onPreview={(value, phase) => preview("rotation", value, phase)} onCommit={angle => rotateCompositionImage(widgetId, angle)} />
            Drag the circular handle; Shift snaps to 15°. Rotation rebases retained pins.
          </label>}
          <label className="block text-xs">
            Canvas height (px)
            <CompositionNumberInput key={`${found[0]}:${context}`}
              label="Canvas height" value={found[1].profiles.desktop.height.valuePx} min={1} max={10000} clampMin keyboardFrameRepeat normalizeValue={value => compositionHeightValue(found[0], value)} disabled={context !== "desktop"}
              onPreview={(value, phase) => preview("height", value, phase)} onCommit={value => run(() => setCompositionHeight(found[0], value))} />
          </label>
          <p className="text-xs text-slate-500">
            Image flow spacing is retained for Return to Flow. It does not position composition children.
          </p>
          <button className={button} onClick={() => run(() => returnCompositionToFlow(found[0]))}>
            Return Composition to Flow
          </button>
        </>
      ) : (
        <>
          <p className="text-xs">
            Opt in selected v2 Images. Initial arrangement overlaps; current image sizes are retained. Legacy images
            must first use the accepted sizing controls.
          </p>
          {eligible.map(([id, w]) => (
            <label key={id} className="block text-xs">
              <input
                type="checkbox"
                checked={ids.includes(id)}
                onChange={(e) => setIds(e.target.checked ? [...ids, id] : ids.filter((v) => v !== id))}
              />{" "}
              {w.settings?.name || id}
            </label>
          ))}
          <label className="block text-xs">
            Initial height (px)
            <input
              aria-label="Initial composition height"
              type="number"
              className="border w-full"
              min="1"
              max="10000"
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
            />
          </label>
          <button
            className={button}
            disabled={!ids.length || context !== "desktop"}
            onClick={() => run(() => convertImages(ids, height))}
          >
            Create Composition Area
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
