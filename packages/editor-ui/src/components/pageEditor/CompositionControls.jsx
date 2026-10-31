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
      !Object.values(page?.wyrmetizerEditorLayout?.areas || {}).some(area => area.members.includes(id)) &&
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
  const button =
    "shadow-sm shadow-slate-100 hover:shadow-lg hover:shadow-slate-100 aria-pressed:ring-2 aria-pressed:ring-pink-200 aria-pressed:shadow-lg aria-pressed:shadow-pink-100 border border-slate-200 rounded-md px-3 py-2 text-xs text-pink-700 hover:bg-pink-50 focus-visible:outline-2 focus-visible:outline-pink-600 aria-pressed:bg-pink-50 aria-pressed:border-pink-500 disabled:opacity-40 break-words";
  if (paired && paired[1].activeMode === "flow")
    return (
      <section
        className="page-editor-settings py-4 border-b border-slate-200 space-y-4 min-w-0"
        aria-label="Composition Area controls"
      >
        <strong className="block text-sm font-semibold text-slate-900">Composition Area</strong>
        <p className="form-description">Flow arrangement active. Your Composition arrangement is preserved.</p>
        <button
          className={button}
          disabled={context !== "desktop"}
          onClick={() => run(() => switchPairedCompositionMode(paired[0], "composition"))}
        >
          Switch to Composition
        </button>
        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
      </section>
    );
  if (!found && !eligible.some(([id]) => id === widgetId)) return null;
  return (
    <section
      className="page-editor-settings py-4 border-b border-slate-200 space-y-4 min-w-0"
      aria-label="Composition Area controls"
    >
      <strong className="block text-sm font-semibold text-slate-900">
        {found ? "Composition Area" : "Create Composition Area"}
      </strong>
      {!page?.wyrmetizerEditorLayout && <WyrmetizerCompatibility page={page} />}
      {found ? (
        <>
          <p className="form-description">
            {context === "desktop"
              ? "Desktop source · Proportional"
              : `${context}: generated Proportional${found[1].placements[widgetId].responsive.mode === "custom" || found[1].responsive.defaultMode === "custom" ? " (Custom not initialized)" : ""} · geometry read-only`}
          </p>
          <p className="form-description">
            Dimensions are desktop design units. Proportional scales both dimensions and positions on smaller screens.
          </p>
          {context !== "desktop" && (
            <p className="form-description">
              Return to Desktop to edit image properties. Custom/Reflow authoring is not included yet.
            </p>
          )}
          <button className={button} onClick={() => useWidgetStore.getState().setSelectedCompositionId(found[0])}>
            Select Composition Area
          </button>
          <div className="space-y-2">
            <p className="form-label">Child reading order (copies enter normal flow):</p>
            <div className="flex flex-col gap-2">
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
          </div>
          {!blockSelected && (
            <div className="flex flex-wrap gap-2">
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
            </div>
          )}
          <div className="space-y-4 border-t border-slate-200 pt-4">
            {!blockSelected && <p className="form-description">Use ↑ ↓ to adjust values</p>}
            {!blockSelected && (
              <div>
                <span className="form-label">Rotation (° clockwise)</span>
                <CompositionNumberInput
                  key={`${widgetId}:${context}`}
                  label="Image rotation angle"
                  value={found[1].placements[widgetId].frames.desktop.rotation || 0}
                  step={0.1}
                  disabled={context !== "desktop"}
                  onPreview={(value, phase) => preview("rotation", value, phase)}
                  onCommit={(angle) => rotateCompositionImage(widgetId, angle)}
                />
                <p className="form-description">
                  Drag the circular handle; Shift snaps to 15°. Rotation rebases retained pins.
                </p>
              </div>
            )}
            <div>
              <span className="form-label">Canvas height (px)</span>
              <CompositionNumberInput
                key={`${found[0]}:${context}`}
                label="Canvas height"
                value={found[1].profiles.desktop.height.valuePx}
                min={1}
                max={10000}
                clampMin
                keyboardFrameRepeat
                normalizeValue={(value) => compositionHeightValue(found[0], value)}
                disabled={context !== "desktop"}
                onPreview={(value, phase) => preview("height", value, phase)}
                onCommit={(value) => run(() => setCompositionHeight(found[0], value))}
              />
            </div>
          </div>
          {paired && <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="form-description">
              Your Flow and Composition arrangements are preserved independently.
            </p>
            <button className={button} onClick={() => run(() => returnCompositionToFlow(found[0]))}>
              Switch to Flow
            </button>
          </div>}
        </>
      ) : page?.wyrmetizerEditorLayout ? (
        <>
          <p className="form-description">
            Opt in selected v2 Images. Initial arrangement overlaps; current image sizes are retained. Legacy images
            must first use the accepted sizing controls.
          </p>
          {eligible.map(([id, w]) => (
            <label key={id} className="flex items-start gap-2 text-xs font-medium text-slate-700 break-words">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0 accent-pink-600"
                checked={ids.includes(id)}
                onChange={(e) => setIds(e.target.checked ? [...ids, id] : ids.filter((v) => v !== id))}
              />
              <span className="min-w-0">{w.settings?.name || id}</span>
            </label>
          ))}
          <label className="block">
            <span className="form-label">Initial height (px)</span>
            <input
              aria-label="Initial composition height"
              type="number"
              className="form-input"
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
      ) : <p className="form-description">Create a paired-layout copy to keep independent Flow and Composition arrangements. The original page stays unchanged.</p>}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
