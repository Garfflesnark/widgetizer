// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { handlePreviewLinkClick } from "../previewLinkHandler.js";

afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

function clickThroughPreview(href, mode, options = {}, modifiers = {}) {
  const wrapper = document.createElement("div");
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.textContent = "Destination";
  wrapper.append(anchor);
  document.body.append(wrapper);
  const navigation = vi.fn();
  const openWindow = vi.spyOn(window, "open").mockImplementation(() => null);
  const openExternal = vi.fn((url) => window.open(url, "_blank", "noopener,noreferrer"));
  const onEditorLink = vi.fn();
  document.addEventListener("click", (event) => handlePreviewLinkClick(event, {
    mode,
    baseUrl: "https://preview.local/preview/page/en/home",
    navigateInternal: navigation,
    openExternal,
    onEditorLink,
    ...options,
  }), { once: true });
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...modifiers });
  anchor.dispatchEvent(event);
  return { event, navigation, openExternal, openWindow, onEditorLink };
}

describe("preview link click behavior", () => {
  it("routes standalone internal links through the preview shell", () => {
    const result = clickThroughPreview("about.html", "standalone");
    expect(result.event.defaultPrevented).toBe(true);
    expect(result.navigation).toHaveBeenCalledWith("/preview/page/en/about");
    expect(result.openExternal).not.toHaveBeenCalled();
  });

  it("opens standalone navigation and social destinations in a separate tab", () => {
    for (const href of ["https://example.com/nav", "https://social.example/profile"]) {
      const result = clickThroughPreview(href, "standalone");
      expect(result.event.defaultPrevented).toBe(true);
      expect(result.openExternal).toHaveBeenCalledWith(href);
      expect(result.openWindow).toHaveBeenCalledWith(href, "_blank", "noopener,noreferrer");
      expect(result.navigation).not.toHaveBeenCalled();
    }
  });

  it("keeps editor selection clicks and allows modified external-link testing", () => {
    const normal = clickThroughPreview("https://example.com", "editor");
    expect(normal.event.defaultPrevented).toBe(true);
    expect(normal.onEditorLink).toHaveBeenCalledTimes(1);
    expect(normal.openExternal).not.toHaveBeenCalled();

    const modified = clickThroughPreview("https://example.com", "editor", {}, { ctrlKey: true });
    expect(modified.event.defaultPrevented).toBe(true);
    expect(modified.onEditorLink).toHaveBeenCalledTimes(1);
    expect(modified.openExternal).toHaveBeenCalledWith("https://example.com/");
    expect(modified.openWindow).toHaveBeenCalledWith("https://example.com/", "_blank", "noopener,noreferrer");
  });

  it("does not open unsafe or non-web destinations", () => {
    const unsafe = clickThroughPreview("javascript:alert(1)", "standalone");
    const mail = clickThroughPreview("mailto:test@example.com", "standalone");
    expect(unsafe.openExternal).not.toHaveBeenCalled();
    expect(mail.openExternal).not.toHaveBeenCalled();
  });
});
