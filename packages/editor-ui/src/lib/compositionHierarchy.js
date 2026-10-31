import { openWyrmetizerEditorPage, serializeWyrmetizerEditorPage, resolveWyrmetizerPage } from "@widgetizer/core/wyrmetizerLayouts";
import { compositionAdapters } from "@widgetizer/core/compositionImage";
import usePageStore from "../stores/pageStore";
import useWidgetStore from "../stores/widgetStore";
import { commitCompositionPage } from "./compositionActions";

// Reorder within one ownership scope; moving between scopes is explicit membership.
export function moveHierarchyItem({ kind, id, areaId }, direction) {
  const page = usePageStore.getState().page;
  if (!page?.wyrmetizerEditorLayout || ![-1, 1].includes(direction) ||
      useWidgetStore.getState().compositionContext !== "desktop") return false;
  const next = serializeWyrmetizerEditorPage(page, compositionAdapters);
  const area = areaId && next.layout.areas[areaId];
  if (areaId && !area?.members.includes(id)) return false;
  const order = area ? (area.activeMode === "flow" ? area.flow.order : area.composition.geometry.childrenOrder) : next.layout.contentOrder;
  const index = area ? order.indexOf(id) : order.findIndex(entry => entry.kind === kind && entry.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return false;
  [order[index], order[target]] = [order[target], order[index]];
  next.widgetsOrder = resolveWyrmetizerPage(next).widgetsOrder;
  return commitCompositionPage(openWyrmetizerEditorPage(next, compositionAdapters));
}
