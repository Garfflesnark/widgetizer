import { validateCompositionLayout, compositionRevision, minimumCompositionHeight, containedRect } from "@widgetizer/core/composition";
import { compositionImageRenderer } from "./compositionImageRenderer.js";
import { escapeHtml } from "@widgetizer/core/escapeHtml";
import { resolveWyrmetizerPage, serializeWyrmetizerEditorPage } from "@widgetizer/core/wyrmetizerLayouts";
import { resolveWyrmetizerPresentation } from "@widgetizer/core/wyrmetizerPresentation";

export const compositionRenderAdapters = { image: compositionImageRenderer };

// Both preview and publish call this composer. The callback owns theme rendering;
// the planner has no filesystem, project resolver or storage dependency.
export async function renderPageContent(page, renderWidget, adapters = compositionRenderAdapters, { preview = false } = {}) {
  page = serializeWyrmetizerEditorPage(page, adapters);
  validateCompositionLayout(page, adapters);
  if (page.layout?.version === 3) return renderResponsiveWyrmetizerPage(page, renderWidget, adapters, { preview });
  const pairedLayout = page.layout?.version === 2 ? page.layout : null;
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
  for (const entry of pairedLayout?.contentOrder || page.layout.contentOrder) {
    if (entry.kind === "widget") {
      html += await renderWidget(entry.id, page.widgets[entry.id], ++index);
      continue;
    }
    const area = pairedLayout?.areas[entry.id];
    if (area?.activeMode === "flow") {
      let children = "";
      for (const id of area.flow.order) children += await renderWidget(id, page.widgets[id], ++index);
      html += `<section data-composition-id="${escapeHtml(entry.id)}" data-composition-mode="flow" aria-label="Composition Area" id="fruitform-${entry.id}" style="display:flow-root;min-height:${area.members.length ? 0 : 48}px">${children}</section>`;
      continue;
    }
    const c = page.layout.compositions[entry.id],
      profile = c.profiles.desktop;
    const prefix = `fruitform-${entry.id}`,
      w = profile.referenceWidthPx,
      savedHeight = profile.height.valuePx;
    let children = "",
      rules = "";
    const renderedChildren = [], heightItems = [];
    for (const id of c.childrenOrder) {
      const widget = page.widgets[id],
        frame = c.placements[id].frames.desktop;
      const rendered = adapters[widget.type].render(await renderWidget(id, widget, ++index), widget,
        preview ? { ...c, previewRecoverBounds: true } : c, frame);
      const selector = `#${prefix} > [data-composition-child="${id}"]`;
      renderedChildren.push({ rendered, selector, id });
      heightItems.push({ rect: rendered.rect, frame: { ...frame, rotationPivot: frame.rotationPivot ?? undefined }, version: c.placements[id].version });
      if (frame.rotation) rules += `${selector}{transform:rotate(${frame.rotation}deg);transform-origin:${100 * (frame.rotationPivot?.x ?? 0.5)}% ${100 * (frame.rotationPivot?.y ?? 0.5)}%}`;
      const effectiveMode =
        c.placements[id].responsive.mode === "inherit" ? c.responsive.defaultMode : c.placements[id].responsive.mode;
      children += `<div data-responsive-mode="${effectiveMode}" ${effectiveMode === "custom" ? 'data-responsive-fallback="proportional"' : ""} data-composition-child="${escapeHtml(id)}" data-composition-revision="${escapeHtml(compositionRevision(widget, frame))}" data-composition-frame="${escapeHtml(JSON.stringify(frame))}">${rendered.html}</div>`;
    }
    const requiredHeight = minimumCompositionHeight(heightItems, w);
    if (!pairedLayout && requiredHeight > savedHeight)
      throw new Error("Composition image exceeds canvas bounds. Enlarge the Composition Area or resize the image.");
    const h = pairedLayout ? Math.max(savedHeight, requiredHeight) : savedHeight;
    if (h > 10000) throw new Error(`Composition Area ${entry.id} requires a height greater than 10000px.`);
    const boundsErrors = renderedChildren.flatMap(({ rendered, id }) => {
      const frame = c.placements[id].frames.desktop;
      return containedRect(rendered.rect, w, h, frame.rotation, frame.rotationPivot)
        ? [] : [{ code: "child-out-of-bounds", areaId: entry.id, widgetId: id, presentation: "desktop" }];
    });
    if (boundsErrors.length && (!preview || !pairedLayout))
      throw new Error(`Composition child ${boundsErrors[0].widgetId} exceeds Area ${entry.id} bounds.`);
    for (const { rendered, selector, id } of renderedChildren) {
      const r = rendered.rect;
      rules += `${selector}{left:${(100 * r.left) / w}%;top:${(100 * r.top) / h}%;width:${(100 * r.width) / w}%;height:${(100 * r.height) / h}%;z-index:${c.stackOrder.indexOf(id) + 1}}`;
    }
    html += `${geometryErrorMarkup(boundsErrors, page.widgets, "desktop")}<section data-composition-id="${escapeHtml(entry.id)}" data-composition-width="${w}" data-composition-height="${h}"${boundsErrors.length ? ' data-composition-geometry-invalid="true"' : ""} aria-label="Composition Area" style="max-width:${w}px;margin-inline:auto;position:relative;isolation:isolate;aspect-ratio:${w}/${h};overflow:${boundsErrors.length ? "visible" : "clip"}" id="${prefix}"><style>
      #${prefix}>[data-composition-child]{position:absolute;box-sizing:border-box}
      #${prefix}>[data-composition-child] :is(.widget,.widget-container,.widget-content,.image-resize-target,.image-wrapper,.image-link,.image-figure){width:100%!important;max-width:none!important;height:100%!important;margin:0!important;padding:0!important;container-type:normal!important}
      #${prefix}>[data-composition-child] img{width:100%!important;max-width:100%!important;height:100%!important;object-fit:fill}
      #${prefix}>[data-composition-child] .reveal{opacity:1!important;transform:none!important;transition:none!important}
      ${rules}
      </style>${children}</section>`;
  }
  return html;
}

async function renderResponsiveWyrmetizerPage(page, renderWidget, adapters, { preview = false } = {}) {
  const desktopDraft = resolveWyrmetizerPresentation(page, 750, { adapters, deferBoundsValidation: true });
  const mobileDraft = resolveWyrmetizerPresentation(page, 390, { adapters, deferBoundsValidation: true });
  const desktopRendered = await renderVariantWidgets(desktopDraft, renderWidget);
  const mobileRendered = await renderVariantWidgets(mobileDraft, renderWidget);
  const imageDimensions = collectRenderedImageDimensions(desktopRendered, mobileRendered);
  // Theme output exposes the actual media dimensions. Resolve again with those
  // dimensions before generating Composition placement CSS so bounds failures
  // are accurate and leave the canonical page untouched.
  const desktop = resolveWyrmetizerPresentation(page, 750, { adapters, imageDimensions, recoverBoundsErrors: preview });
  const mobile = resolveWyrmetizerPresentation(page, 390, { adapters, imageDimensions, recoverBoundsErrors: preview });
  const desktopHtml = renderResolvedPresentation(desktop, desktopRendered, adapters);
  const mobileHtml = renderResolvedPresentation(mobile, mobileRendered, adapters);
  return `<style data-wyrmetizer-responsive-style>
    [data-wyrmetizer-responsive]>[data-wyrmetizer-presentation]{display:contents}
    [data-wyrmetizer-responsive]>[data-wyrmetizer-presentation="mobile"]{display:none}
    @media(max-width:749px){
      [data-wyrmetizer-responsive]>[data-wyrmetizer-presentation="desktop"]{display:none!important}
      [data-wyrmetizer-responsive]>[data-wyrmetizer-presentation="mobile"]{display:contents}
    }
  </style><div data-wyrmetizer-responsive>
    <div data-wyrmetizer-presentation="desktop">${desktopHtml}</div>
    <div data-wyrmetizer-presentation="mobile">${mobileHtml}</div>
  </div><script data-wyrmetizer-anchor-bridge>(function(){
    function targetFor(hash){var mode=window.matchMedia('(max-width: 749px)').matches?'mobile':'desktop';var id;try{id=decodeURIComponent(hash.slice(1))}catch(_){id=hash.slice(1)}var nodes=document.querySelectorAll('[data-wyrmetizer-original-id]');for(var i=0;i<nodes.length;i++){var node=nodes[i],presentation=node.closest('[data-wyrmetizer-presentation]');if(node.getAttribute('data-wyrmetizer-original-id')===id&&presentation&&presentation.getAttribute('data-wyrmetizer-presentation')===mode)return node}return null}
    function follow(hash){var target=hash&&targetFor(hash);if(target)target.scrollIntoView()}
    document.addEventListener('click',function(event){var link=event.target.closest&&event.target.closest('a[href^="#"]');if(!link)return;var target=targetFor(link.getAttribute('href'));if(!target)return;event.preventDefault();history.pushState(null,'',link.getAttribute('href'));target.scrollIntoView()});
    window.addEventListener('hashchange',function(){follow(location.hash)});window.addEventListener('popstate',function(){follow(location.hash)});if(location.hash)requestAnimationFrame(function(){follow(location.hash)})
  })();</script>`;
}

async function renderVariantWidgets(view, renderWidget) {
  const rendered = new Map();
  let index = 0;
  for (const entry of view.rootOrder) {
    if (entry.kind === "widget") {
      rendered.set(entry.id, scopeVariantStyles(scopeResponsiveIds(await renderWidget(entry.id, view.widgets[entry.id], ++index), view.presentation), view.presentation));
      continue;
    }
    const area = view.areas[entry.id];
    const order = area.mode === "flow" ? area.order : area.readingOrder;
    for (const id of order) rendered.set(id, scopeVariantStyles(scopeResponsiveIds(await renderWidget(id, view.widgets[id], ++index), view.presentation), view.presentation));
  }
  return rendered;
}

function scopeVariantStyles(html, presentation) {
  const media = presentation === "mobile" ? "max-width:749px" : "min-width:750px";
  return String(html).replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, `$1@media(${media}){$2}$3`);
}

function scopeResponsiveIds(html, presentation) {
  const source = String(html);
  const widgetId = source.match(/\bdata-widget-id\s*=\s*(["'])(.*?)\1/i)?.[2] || "widget";
  const suffix = `--wyrmetizer-${widgetId}-${presentation}`;
  const replacements = new Map();
  const ids = [...source.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2]);
  for (const id of ids) if (!replacements.has(id)) replacements.set(id, `${id}${suffix}`);
  if (!replacements.size) return source;

  const referenceAttributes = new Set([
    "for", "form", "list", "headers", "aria-activedescendant", "aria-controls", "aria-describedby",
    "aria-details", "aria-errormessage", "aria-flowto", "aria-labelledby", "aria-owns",
  ]);
  const occurrences = new Map();
  return source.replace(/<[A-Za-z][^<>]*>/g, (tag) => tag.replace(
    /\b([\w:-]+)\s*=\s*(["'])(.*?)\2/gi,
    (attribute, name, quote, value) => {
      const key = name.toLowerCase();
      let next = value;
      let marker = "";
      if (key === "id") {
        const occurrence = (occurrences.get(value) || 0) + 1;
        occurrences.set(value, occurrence);
        next = `${replacements.get(value) || value}${occurrence > 1 ? `--${occurrence}` : ""}`;
        marker = ` data-wyrmetizer-original-id=${quote}${value}${quote}`;
      }
      else if (referenceAttributes.has(key)) next = value.split(/\s+/).map((token) => replacements.get(token) || token).join(" ");
      else if ((key === "href" || key === "xlink:href") && value.startsWith("#")) next = `#${replacements.get(value.slice(1)) || value.slice(1)}`;
      else if (value.includes("url(#")) next = value.replace(/url\(#([^)]*)\)/g, (url, id) => `url(#${replacements.get(id) || id})`);
      return `${name}=${quote}${next}${quote}${marker}`;
    },
  ));
}

function collectRenderedImageDimensions(...variants) {
  const dimensions = {};
  for (const variant of variants) for (const [id, html] of variant) {
    const width = Number(html?.match(/data-image-natural-width="([0-9.]+)"/)?.[1]);
    const height = Number(html?.match(/data-image-natural-height="([0-9.]+)"/)?.[1]);
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)
      dimensions[id] = { width, height };
  }
  return dimensions;
}

function renderResolvedPresentation(view, renderedWidgets, adapters) {
  let html = "";
  for (const entry of view.rootOrder) {
    if (entry.kind === "widget") {
      html += renderedWidgets.get(entry.id) ?? "";
      continue;
    }
    const area = view.areas[entry.id];
    if (area.mode === "flow") {
      const children = area.order.map(id => renderedWidgets.get(id) ?? "").join("");
      html += `<section data-composition-id="${escapeHtml(entry.id)}" data-composition-mode="flow" aria-label="Composition Area" id="fruitform-${escapeHtml(entry.id)}--${view.presentation}" style="display:flow-root;min-height:${area.order.length ? 0 : 48}px">${children}</section>`;
      continue;
    }
    html += renderResolvedComposition(entry.id, area, view.widgets, renderedWidgets, adapters, view.presentation);
  }
  return html;
}

function renderResolvedComposition(areaId, area, widgets, renderedWidgets, adapters, presentation) {
  const { widthPx: width, heightPx: height, placements } = area.geometry;
  const prefix = `fruitform-${areaId}--${presentation}`;
  let children = "", rules = "";
  for (const id of area.readingOrder) {
    const widget = widgets[id], placement = placements[id];
    const frame = { x: placement.xPx / width, y: placement.yPx / width, pivot: placement.pivot,
      ...(placement.rotation ? { rotation: placement.rotation } : {}),
      ...(placement.rotationPivot ? { rotationPivot: placement.rotationPivot } : {}) };
    const composition = { profiles: { desktop: { referenceWidthPx: width, height: { valuePx: height } } },
      ...(area.boundsErrors?.length ? { previewRecoverBounds: true } : {}) };
    const rendered = adapters[widget.type].render(renderedWidgets.get(id) ?? "", widget, composition, frame);
    const rect = rendered.rect;
    const selector = `#${prefix} > [data-composition-child="${id}"]`;
    rules += `${selector}{left:${100 * rect.left / width}%;top:${100 * rect.top / height}%;width:${100 * rect.width / width}%;height:${100 * rect.height / height}%;z-index:${area.stackOrder.indexOf(id) + 1}}`;
    if (placement.rotation) rules += `${selector}{transform:rotate(${placement.rotation}deg);transform-origin:${100 * (placement.rotationPivot?.x ?? 0.5)}% ${100 * (placement.rotationPivot?.y ?? 0.5)}%}`;
    children += `<div data-composition-child="${escapeHtml(id)}" data-composition-revision="${escapeHtml(compositionRevision(widget, frame))}" data-composition-frame="${escapeHtml(JSON.stringify(frame))}">${rendered.html}</div>`;
  }
  const boundsErrors = area.boundsErrors ?? [];
  return `${geometryErrorMarkup(boundsErrors, widgets, presentation)}<section data-composition-id="${escapeHtml(areaId)}" data-composition-mode="composition" data-composition-width="${width}" data-composition-height="${height}"${boundsErrors.length ? ' data-composition-geometry-invalid="true"' : ""} aria-label="Composition Area" style="width:100%;max-width:${width}px;margin-inline:auto;position:relative;isolation:isolate;aspect-ratio:${width}/${height};overflow:${boundsErrors.length ? "visible" : "clip"}" id="${prefix}"><style>
    #${prefix}>[data-composition-child]{position:absolute;box-sizing:border-box}
    #${prefix}>[data-composition-child] :is(.widget,.widget-container,.widget-content,.image-resize-target,.image-wrapper,.image-link,.image-figure){width:100%!important;max-width:none!important;height:100%!important;margin:0!important;padding:0!important;container-type:normal!important}
    #${prefix}>[data-composition-child] img{width:100%!important;max-width:100%!important;height:100%!important;object-fit:fill}
    #${prefix}>[data-composition-child] .reveal{opacity:1!important;transform:none!important;transition:none!important}
    ${rules}
  </style>${children}</section>`;
}

function geometryErrorMarkup(errors, widgets, presentation) {
  return errors.map(({ areaId, widgetId }) => {
    const widgetName = widgets[widgetId]?.settings?.name || widgetId;
    return `<aside data-composition-geometry-error="${escapeHtml(widgetId)}" data-composition-geometry-area="${escapeHtml(areaId)}" data-composition-geometry-presentation="${escapeHtml(presentation)}" role="alert"><strong>Composition preview warning</strong><p>Widget “${escapeHtml(widgetName)}” in Area “${escapeHtml(areaId)}” extends beyond the ${escapeHtml(presentation)} Area bounds. Adjust its size or position in the editor. Its saved geometry is unchanged.</p></aside>`;
  }).join("");
}
