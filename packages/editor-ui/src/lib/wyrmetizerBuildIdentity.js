export function getWyrmetizerLayoutIdentity(page) {
  if (!page || typeof page !== "object") return { label: "Unknown", detail: "Page data unavailable" };

  // v2/v3 are canonical in `layout` on disk, but the editor uses a disposable
  // v1 rendering projection. Its editor-only envelope preserves the authored version.
  const layout = page.wyrmetizerEditorLayout || page.layout;
  if (layout == null) return { label: "Non-Wyrmetizer", detail: "No Wyrmetizer layout envelope" };

  if (layout.version === 2 || layout.version === 3) {
    return { label: `v${layout.version}`, detail: `Wyrmetizer layout v${layout.version}` };
  }
  if (layout.version === 1 && layout.compositions && typeof layout.compositions === "object" &&
      !Array.isArray(layout.compositions) && Object.keys(layout.compositions).length > 0) {
    return { label: "v1", detail: "Wyrmetizer layout v1" };
  }
  if (layout.version === 1 && (!layout.compositions || Object.keys(layout.compositions).length === 0)) {
    return { label: "Non-Wyrmetizer", detail: "No Wyrmetizer Composition data" };
  }
  return { label: "Unknown", detail: `Unsupported layout version: ${String(layout.version ?? "missing")}` };
}

export function getWyrmetizerRuntimeIdentity({ dev, hostname }) {
  const localHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
  return {
    isLocalDevelopment: Boolean(dev && localHost),
    buildMode: dev ? "Development" : "Production",
  };
}
