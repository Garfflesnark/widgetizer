// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import WyrmetizerCompatibility from "../WyrmetizerCompatibility";
import { fixture } from "../../../../../core/src/runtime/__tests__/compositionFixture.js";
import { editorFetchJson } from "../../../lib/apiFetch";
vi.mock("../../../lib/apiFetch", () => ({ editorFetchJson: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: key => key }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("offers explicit copy-first conversion for older Flow-only pages without converting on open", () => {
  const page = fixture();
  delete page.layout;
  render(<WyrmetizerCompatibility page={page} />);
  expect(editorFetchJson).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Create a paired-layout copy"));
  expect(screen.getByRole("button", { name: "Convert" }).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(editorFetchJson).not.toHaveBeenCalled();
});
it("defaults to Cancel and makes no request when cancelled", () => {
  render(<WyrmetizerCompatibility page={{ ...fixture(), id: "test" }} />);
  fireEvent.click(screen.getByText("Create a paired-layout copy"));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(editorFetchJson).not.toHaveBeenCalled();
});
it("disables conversion for unknown formats", () => {
  render(<WyrmetizerCompatibility page={{ layout: { version: 99 } }} incompatible />);
  expect(screen.getByRole("button", { name: "Convert" }).disabled).toBe(true);
  expect(screen.getByText(/A compatible application version is required/)).toBeTruthy();
  fireEvent.keyDown(document.activeElement, { key: "Tab" });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
});
it("does not offer an editable result when conversion fails", async () => {
  editorFetchJson.mockRejectedValue(new Error("Conversion failed. Original preserved."));
  render(<WyrmetizerCompatibility page={{ ...fixture(), id: "test" }} />);
  fireEvent.click(screen.getByText("Create a paired-layout copy"));
  fireEvent.click(screen.getByRole("button", { name: "Convert" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Original preserved"));
  expect(screen.queryByRole("link")).toBeNull();
});
it("offers the new copy only after successful conversion", async () => {
  editorFetchJson.mockResolvedValue({ id: "test-wyrmetizer", name: "Test (Wyrmetizer copy)" });
  render(<WyrmetizerCompatibility page={{ ...fixture(), id: "test" }} />);
  fireEvent.click(screen.getByText("Create a paired-layout copy"));
  fireEvent.click(screen.getByRole("button", { name: "Convert" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "Test (Wyrmetizer copy)" })).toBeTruthy());
  expect(editorFetchJson).toHaveBeenCalledTimes(1);
});
