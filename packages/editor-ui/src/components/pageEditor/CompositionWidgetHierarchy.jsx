import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, EllipsisVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import WidgetItem from "./widgets/WidgetItem";
import WidgetInsertionZone from "./WidgetInsertionZone";
import useWidgetStore from "../../stores/widgetStore";
import { moveHierarchyItem } from "../../lib/compositionHierarchy";
import { removeImageFromComposition } from "../../lib/compositionActions";

export default function CompositionWidgetHierarchy({ page, widgetSchemas, onAddWidgetClick,
  isWidgetSelectorOpen, activeWidgetTriggerPosition, onOpenCompositionMenu, modifiedWidgets = new Set(), ...widgetProps }) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState({});
  const [error, setError] = useState("");
  const { selectedWidgetId, selectedCompositionId, compositionContext, compositionSelection } = useWidgetStore();
  const selectedImages = useWidgetStore.getState().getCompositionSelection(compositionSelection);
  const candidates = useWidgetStore.getState().getCompositionCandidates();
  const layout = page.wyrmetizerEditorLayout;
  const ownerId = Object.keys(layout.areas).find(id => layout.areas[id].members.includes(selectedWidgetId));
  useEffect(() => {
    // Selection from the preview or Undo must reveal a previously collapsed child.
    if (ownerId) setCollapsed(previous => previous[ownerId] ? { ...previous, [ownerId]: false } : previous);
  }, [ownerId, selectedWidgetId]);
  const run = action => {
    try { action(); setError(""); } catch (e) { setError(e.message); }
  };
  const movement = (target, index, length, name) => <div className="flex justify-end gap-1">
    <button type="button" className="p-1 text-slate-500 disabled:opacity-30" aria-label={`Move ${name} up`}
      disabled={index === 0 || compositionContext !== "desktop"} onClick={() => run(() => moveHierarchyItem(target, -1))}><ArrowUp size={12} /></button>
    <button type="button" className="p-1 text-slate-500 disabled:opacity-30" aria-label={`Move ${name} down`}
      disabled={index === length - 1 || compositionContext !== "desktop"} onClick={() => run(() => moveHierarchyItem(target, 1))}><ArrowDown size={12} /></button>
  </div>;
  const widgetRow = (id, areaId) => {
    const widget = page.widgets[id];
    const name = widget.settings?.name || id;
    return <div id={`sidebar-widget-${id}`} key={id}>
      <WidgetItem {...widgetProps} widgetId={id} widget={widget} widgetSchema={widgetSchemas[widget.type] || {}}
        draggable={false} isSelected={selectedWidgetId === id} isModified={modifiedWidgets.has(id)}
        onBlockDragEnd={({ active, over }) => {
          const order = [...(widget.blocksOrder || [])], from = order.indexOf(active.id), to = order.indexOf(over?.id);
          if (from < 0 || to < 0 || from === to) return;
          order.splice(to, 0, order.splice(from, 1)[0]);
          widgetProps.onBlocksReorder?.(id, order);
        }}
        onWidgetSelect={(widgetId, event) => {
          if ((event?.ctrlKey || event?.metaKey) && useWidgetStore.getState().toggleCompositionImage(widgetId)) return;
          widgetProps.onWidgetSelect?.(widgetId);
        }} />
      {!areaId && candidates.includes(id) && <label className="flex gap-1 p-1 text-xs text-slate-500">
        <input type="checkbox" aria-label={`Include ${name} in Composition`} checked={selectedImages.includes(id)}
          disabled={compositionContext !== "desktop"} onChange={() => useWidgetStore.getState().toggleCompositionImage(id)} />Include in Composition
      </label>}
      {areaId && <button type="button" className="p-1 text-xs text-pink-700" disabled={compositionContext !== "desktop"}
        aria-label={`Remove ${name} from Composition`} onClick={() => run(() => removeImageFromComposition(areaId, id))}>Remove from Composition</button>}
    </div>;
  };
  const insertion = index => <WidgetInsertionZone position={index} onAddClick={onAddWidgetClick}
    isWidgetSelectorOpen={isWidgetSelectorOpen} activeWidgetTriggerPosition={activeWidgetTriggerPosition} />;
  return <div aria-label="Widget hierarchy">
    {insertion(0)}
    {layout.contentOrder.map((entry, index) => {
      const area = entry.kind === "area" && layout.areas[entry.id];
      const children = area && (area.activeMode === "flow" ? area.flow.order : area.composition.geometry.childrenOrder);
      return <div key={`${entry.kind}:${entry.id}`}>
        {area ? <section aria-label={`Composition Area ${entry.id}`} id={`sidebar-area-${entry.id}`}
          className="rounded border border-slate-200 p-1">
          <div className="flex items-center gap-1 group widget-item" onContextMenu={event => {
            event.preventDefault(); event.stopPropagation();
            onOpenCompositionMenu?.(entry.id, event.clientX, event.clientY);
          }}>
            <button type="button" aria-label={collapsed[entry.id] ? "Expand Composition Area" : "Collapse Composition Area"}
              aria-expanded={!collapsed[entry.id]} aria-controls={`area-children-${entry.id}`}
              onClick={() => setCollapsed(previous => ({ ...previous, [entry.id]: !previous[entry.id] }))}>
              {collapsed[entry.id] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
            <button type="button" aria-pressed={selectedCompositionId === entry.id}
              className="flex-1 rounded p-2 text-left text-xs font-medium aria-pressed:bg-pink-50 aria-pressed:ring-2 aria-pressed:ring-pink-300"
              onClick={() => useWidgetStore.getState().setSelectedCompositionId(entry.id)}>Composition Area</button>
            <span className="text-xs text-slate-500">{children.length}</span>
            <div className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
              <button type="button" className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-white/80 transition-colors"
                title={t("pageEditor.actions.widgetActions")} aria-label={t("pageEditor.actions.widgetActions")}
                onClick={event => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  onOpenCompositionMenu?.(entry.id, rect.left, rect.bottom + 2);
                }}><EllipsisVertical size={14} /></button>
            </div>
          </div>
          {movement(entry, index, layout.contentOrder.length, `Composition Area ${entry.id}`)}
          <div id={`area-children-${entry.id}`} hidden={!!collapsed[entry.id]} className="ml-3 space-y-1 border-l border-slate-200 pl-2">
            {children.length ? children.map((id, childIndex) => <div key={id}>
              {widgetRow(id, entry.id)}
              {movement({ kind: "widget", id, areaId: entry.id }, childIndex, children.length, page.widgets[id].settings?.name || id)}
            </div>) : <p className="p-2 text-xs text-slate-500">Empty Composition Area</p>}
          </div>
        </section> : <>{widgetRow(entry.id)}{movement(entry, index, layout.contentOrder.length, page.widgets[entry.id].settings?.name || entry.id)}</>}
        {insertion(index + 1)}
      </div>;
    })}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
