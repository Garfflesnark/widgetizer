import { describe, expect, it } from "vitest";
import { getWyrmetizerLayoutIdentity, getWyrmetizerRuntimeIdentity } from "../wyrmetizerBuildIdentity.js";

describe("Wyrmetizer build identity", () => {
  it("reads the authored v1 envelope and editor-preserved v2/v3 envelopes", () => {
    expect(getWyrmetizerLayoutIdentity({ layout: { version: 1, compositions: { canvas: {} } } }).label).toBe("v1");
    expect(getWyrmetizerLayoutIdentity({ layout: { version: 1, contentOrder: [] }, wyrmetizerEditorLayout: { version: 2 } }).label).toBe("v2");
    expect(getWyrmetizerLayoutIdentity({ layout: { version: 1, contentOrder: [] }, wyrmetizerEditorLayout: { version: 3 } }).label).toBe("v3");
  });

  it("distinguishes a known non-Wyrmetizer page from missing or unsupported data", () => {
    expect(getWyrmetizerLayoutIdentity({ id: "plain" }).label).toBe("Non-Wyrmetizer");
    expect(getWyrmetizerLayoutIdentity(null)).toMatchObject({ label: "Unknown", detail: "Page data unavailable" });
    expect(getWyrmetizerLayoutIdentity({ layout: { version: 4 } })).toMatchObject({ label: "Unknown", detail: "Unsupported layout version: 4" });
  });

  it("only reports local development on a local host with a development build", () => {
    expect(getWyrmetizerRuntimeIdentity({ dev: true, hostname: "localhost" })).toMatchObject({ isLocalDevelopment: true, buildMode: "Development" });
    expect(getWyrmetizerRuntimeIdentity({ dev: true, hostname: "editor.example.test" }).isLocalDevelopment).toBe(false);
    expect(getWyrmetizerRuntimeIdentity({ dev: false, hostname: "localhost" })).toMatchObject({ isLocalDevelopment: false, buildMode: "Production" });
  });
});
