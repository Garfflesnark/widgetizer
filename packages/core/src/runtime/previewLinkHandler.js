import { getPreviewExternalTarget, getStandalonePreviewTarget } from "./standalonePreviewTarget.js";

/** Apply the editor/standalone preview's click-only link behavior. */
export function handlePreviewLinkClick(event, { mode, baseUrl, standaloneSite, navigateInternal, openExternal, onEditorLink } = {}) {
  const linkElement = event.target?.closest?.("a");
  if (!linkElement) return false;

  if (mode === "standalone") {
    const href = linkElement.getAttribute("href");
    const internalTarget = getStandalonePreviewTarget(href, standaloneSite);
    if (internalTarget) {
      event.preventDefault();
      event.stopPropagation();
      navigateInternal?.(internalTarget);
    } else {
      const externalTarget = getPreviewExternalTarget(href, baseUrl);
      if (externalTarget) {
        // Keep the browser's trusted click activation for sandboxed Preview
        // popups, including SVG social links, instead of relying on window.open.
        linkElement.href = externalTarget;
        linkElement.target = "_blank";
        linkElement.rel = "noopener noreferrer";
        event.stopPropagation();
      } else {
        event.preventDefault();
        event.stopPropagation();
      }
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
