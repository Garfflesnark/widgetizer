import { compositionFor } from "./composition.js";

export function orderingControls(page, { widgetId, compositionId } = {}) {
  const parent = widgetId && compositionFor(page, widgetId);
  if (parent) {
    const order = parent[1].stackOrder,
      index = order.indexOf(widgetId);
    return {
      scope: "image",
      id: widgetId,
      up: index < order.length - 1,
      down: index > 0,
      upLabel: "Bring Forward",
      downLabel: "Send Backward",
    };
  }
  const scope = compositionId ? "composition" : "widget",
    id = compositionId || widgetId;
  if (!id || (compositionId ? !page?.layout?.compositions?.[id] : !page?.widgets?.[id])) return null;
  const order = page.layout?.contentOrder?.map((entry) => entry.id) || page.widgetsOrder || [],
    index = order.indexOf(id);
  if (index < 0) return null;
  return {
    scope,
    id,
    up: index > 0,
    down: index < order.length - 1,
    upLabel: "Move Block Up",
    downLabel: "Move Block Down",
  };
}
