import { getPreviewExternalTarget, getStandalonePreviewTarget } from "./standalonePreviewTarget.js";

/** Apply the editor/standalone preview's click-only link behavior. */
export function handlePreviewLinkClick(event, { mode, baseUrl, standaloneSite, navigateInternal, openExternal, onEditorLink } = {}) {
  const linkElement = event.target?.closest?.("a");
  if (!linkElement) return false;

  if (mode === "standalone") {
    const href = linkElement.getAttribute("href");
    const internalTarget = getStandalonePreviewTarget(href, standaloneSite);
    event.preventDefault();
    event.stopPropagation();
    if (internalTarget) {
      navigateInternal?.(internalTarget);
    } else {
      const externalTarget = getPreviewExternalTarget(href, baseUrl);
      if (externalTarget) openExternal?.(externalTarget);
    }
    return true;
  }

  if (mode === "editor") {
    if (event.ctrlKey || event.metaKey) {
      const externalTarget = getPreviewExternalTarget(linkElement.getAttribute("href"), baseUrl);
      if (externalTarget) openExternal?.(externalTarget);
    }
    event.preventDefault();
    event.stopPropagation();
    onEditorLink?.(linkElement);
    return true;
  }

  return false;
}
