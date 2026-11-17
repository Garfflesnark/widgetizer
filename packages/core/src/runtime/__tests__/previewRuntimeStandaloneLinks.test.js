// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sent = [];
const openWindow = vi.fn(() => null);

beforeAll(async () => {
  window.history.replaceState({}, "", `/?parentOrigin=${encodeURIComponent(window.location.origin)}`);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  window.open = openWindow;
  window.parent.postMessage = (data) => sent.push(data);
  document.body.innerHTML = '<script data-preview-mode="standalone"></script>';
  await import("../previewRuntime.js");
});

afterAll(() => vi.unstubAllGlobals());

function click(target) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("standalone preview navigation", () => {
  it("keeps Preview social SVG activation in a safe separate tab for either saved preference", () => {
    document.body.insertAdjacentHTML("beforeend", `
      <div data-widget-id="header" data-widget-type="header">
        <a data-social="same" href="https://social.example/same" aria-label="Same-tab social">
          <svg><path d="M0 0"></path></svg>
        </a>
        <a data-social="new" href="https://social.example/new" target="_blank" rel="noopener noreferrer" aria-label="New-tab social">
          <svg><path d="M0 0"></path></svg>
        </a>
      </div>`);

    const sameTabEvent = click(document.querySelector('[data-social="same"] path'));
    const newTabEvent = click(document.querySelector('[data-social="new"] path'));

    expect(sameTabEvent.defaultPrevented).toBe(false);
    expect(newTabEvent.defaultPrevented).toBe(false);
    expect(document.querySelector('[data-social="same"]').target).toBe("_blank");
    expect(document.querySelector('[data-social="same"]').rel).toBe("noopener noreferrer");
    expect(document.querySelector('[data-social="new"]').target).toBe("_blank");
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("continues routing internal links inside the standalone preview", () => {
    document.body.insertAdjacentHTML("beforeend", '<a data-internal href="about.html">About</a>');
    const event = click(document.querySelector("[data-internal]"));
    expect(event.defaultPrevented).toBe(true);
    expect(sent.findLast((entry) => entry.type === "NAVIGATE_PREVIEW")?.payload.url).toBe("/preview/page/en/about");
  });

  it("keeps internal new-tab preferences inside the Preview shell", () => {
    document.body.insertAdjacentHTML("beforeend", '<a data-internal-new href="about.html" target="_blank" rel="noopener noreferrer">About</a>');
    const event = click(document.querySelector("[data-internal-new]"));
    expect(event.defaultPrevented).toBe(true);
    expect(sent.findLast((entry) => entry.type === "NAVIGATE_PREVIEW")?.payload.url).toBe("/preview/page/en/about");
  });

  it("forces external navigation and social links into safe new tabs in Preview", () => {
    document.body.insertAdjacentHTML("beforeend", `
      <a data-external-nav-same href="https://example.com/page">Visit same-tab preference</a>
      <a data-external-nav-new href="https://example.com/new" target="_blank" rel="noopener noreferrer">Visit new-tab preference</a>
      <a data-external-social-same href="https://social.example/profile" aria-label="Social same-tab preference"><svg><path></path></svg></a>
      <a data-external-social-new href="https://social.example/other" target="_blank" rel="noopener noreferrer" aria-label="Social new-tab preference"><svg><path></path></svg></a>`);
    for (const selector of ["[data-external-nav-same]", "[data-external-nav-new]", "[data-external-social-same]", "[data-external-social-new]"]) {
      const event = click(document.querySelector(selector));
      const link = document.querySelector(selector);
      expect(event.defaultPrevented).toBe(false);
      expect(link.target).toBe("_blank");
      expect(link.rel).toBe("noopener noreferrer");
    }
    expect(openWindow).not.toHaveBeenCalled();
  });
});
