export function activePresentation(document) {
  const responsive = document?.querySelector("[data-wyrmetizer-responsive]");
  if (!responsive) return null;
  const mobile = document.defaultView?.matchMedia?.("(max-width: 749px)").matches ??
    (document.defaultView?.innerWidth ?? 750) < 750;
  return mobile ? "mobile" : "desktop";
}

export function isActivePresentation(element) {
  const presentation = element?.closest?.("[data-wyrmetizer-presentation]");
  return !presentation || presentation.dataset.wyrmetizerPresentation === activePresentation(element.ownerDocument);
}

export function activeWidget(document, widgetId) {
  if (!widgetId) return null;
  const responsive = !!document.querySelector("[data-wyrmetizer-responsive]");
  const matches = document.querySelectorAll("[data-widget-id]");
  let fallback = null;
  for (const element of matches) {
    if (element.dataset.widgetId !== widgetId) continue;
    fallback ??= element;
    if (isActivePresentation(element)) return element;
  }
  return responsive ? null : fallback;
}

export function activeArea(document, areaId) {
  if (!areaId) return null;
  const responsive = !!document.querySelector("[data-wyrmetizer-responsive]");
  const matches = document.querySelectorAll("[data-composition-id]");
  let fallback = null;
  for (const element of matches) {
    if (element.dataset.compositionId !== areaId) continue;
    fallback ??= element;
    if (isActivePresentation(element)) return element;
  }
  return responsive ? null : fallback;
}

export function activeWidgetForElement(element) {
  const widgetId = element?.dataset?.widgetId;
  return widgetId ? activeWidget(element.ownerDocument, widgetId) : null;
}

export function scopeInstanceIds(root, presentation) {
  if (!root || !presentation) return;
  const widgetId = root.dataset.widgetId || "widget";
  const suffix = `--wyrmetizer-${widgetId}-${presentation}`;
  const elements = [root, ...root.querySelectorAll("[id]")].filter((element) => element.hasAttribute("id"));
  const ids = new Map(elements.map((element) => [element.id, `${element.id}${suffix}`]));
  const occurrences = new Map();
  const references = ["for", "form", "list", "headers", "aria-activedescendant", "aria-controls", "aria-describedby",
    "aria-details", "aria-errormessage", "aria-flowto", "aria-labelledby", "aria-owns"];
  for (const element of [root, ...root.querySelectorAll("*")]) {
    if (element.id && ids.has(element.id)) {
      const original = element.id;
      const occurrence = (occurrences.get(original) || 0) + 1;
      occurrences.set(original, occurrence);
      element.id = `${ids.get(original)}${occurrence > 1 ? `--${occurrence}` : ""}`;
      element.dataset.wyrmetizerOriginalId = original;
    }
    for (const name of references) {
      const value = element.getAttribute(name);
      if (value) element.setAttribute(name, value.split(/\s+/).map((id) => ids.get(id) || id).join(" "));
    }
    for (const name of ["href", "xlink:href"]) {
      const value = element.getAttribute(name);
      if (value?.startsWith("#")) element.setAttribute(name, `#${ids.get(value.slice(1)) || value.slice(1)}`);
    }
    for (const attribute of element.attributes) {
      if (attribute.value.includes("url(#")) element.setAttribute(attribute.name, attribute.value.replace(/url\(#([^)]*)\)/g, (url, id) => `url(#${ids.get(id) || id})`));
    }
  }
}
