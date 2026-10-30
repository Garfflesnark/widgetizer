import { validateCompositionLayout, compositionRevision } from "@widgetizer/core/composition";
import { compositionImageRenderer } from "./compositionImageRenderer.js";
import { escapeHtml } from "@widgetizer/core/escapeHtml";
import { resolveWyrmetizerPage } from "@widgetizer/core/wyrmetizerLayouts";

export const compositionRenderAdapters = { image: compositionImageRenderer };

// Both preview and publish call this composer. The callback owns theme rendering;
// the planner has no filesystem, project resolver or storage dependency.
export async function renderPageContent(page, renderWidget, adapters = compositionRenderAdapters) {
  validateCompositionLayout(page, adapters);
  page = resolveWyrmetizerPage(page);
  let index = 0;
  if (!page.layout) {
    let html = "";
    for (const id of page.widgetsOrder || Object.keys(page.widgets || {})) {
      if (["header", "footer"].includes(id) || !page.widgets?.[id]) continue;
      html += await renderWidget(id, page.widgets[id], ++index);
    }
    return html;
  }
  let html = "";
  for (const entry of page.layout.contentOrder) {
    if (entry.kind === "widget") {
      html += await renderWidget(entry.id, page.widgets[entry.id], ++index);
      continue;
    }
    const c = page.layout.compositions[entry.id],
      profile = c.profiles.desktop;
    const prefix = `fruitform-${entry.id}`,
      w = profile.referenceWidthPx,
      h = profile.height.valuePx;
    let children = "",
      rules = "";
    for (const id of c.childrenOrder) {
      const widget = page.widgets[id],
        frame = c.placements[id].frames.desktop;
      const rendered = adapters[widget.type].render(await renderWidget(id, widget, ++index), widget, c, frame);
      const r = rendered.rect,
        selector = `#${prefix} > [data-composition-child="${id}"]`;
      rules += `${selector}{left:${(100 * r.left) / w}%;top:${(100 * r.top) / h}%;width:${(100 * r.width) / w}%;height:${(100 * r.height) / h}%;z-index:${c.stackOrder.indexOf(id) + 1}}`;
      if (frame.rotation) rules += `${selector}{transform:rotate(${frame.rotation}deg);transform-origin:${100 * (frame.rotationPivot?.x ?? 0.5)}% ${100 * (frame.rotationPivot?.y ?? 0.5)}%}`;
      const effectiveMode =
        c.placements[id].responsive.mode === "inherit" ? c.responsive.defaultMode : c.placements[id].responsive.mode;
      children += `<div data-responsive-mode="${effectiveMode}" ${effectiveMode === "custom" ? 'data-responsive-fallback="proportional"' : ""} data-composition-child="${escapeHtml(id)}" data-composition-revision="${escapeHtml(compositionRevision(widget, frame))}" data-composition-frame="${escapeHtml(JSON.stringify(frame))}">${rendered.html}</div>`;
    }
    html += `<section data-composition-id="${escapeHtml(entry.id)}" data-composition-width="${w}" data-composition-height="${h}" aria-label="Composition Area" style="max-width:${w}px;margin-inline:auto;position:relative;isolation:isolate;aspect-ratio:${w}/${h};overflow:clip" id="${prefix}"><style>
      #${prefix}>[data-composition-child]{position:absolute;box-sizing:border-box}
      #${prefix}>[data-composition-child] :is(.widget,.widget-container,.widget-content,.image-resize-target,.image-wrapper,.image-link,.image-figure){width:100%!important;max-width:none!important;height:100%!important;margin:0!important;padding:0!important;container-type:normal!important}
      #${prefix}>[data-composition-child] img{width:100%!important;max-width:100%!important;height:100%!important;object-fit:fill}
      #${prefix}>[data-composition-child] .reveal{opacity:1!important;transform:none!important;transition:none!important}
      ${rules}
      </style>${children}</section>`;
  }
  return html;
}
