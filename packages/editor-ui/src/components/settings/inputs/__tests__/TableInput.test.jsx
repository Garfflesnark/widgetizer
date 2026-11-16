// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import TableInput from "../TableInput";
import userEvent from "@testing-library/user-event";

afterEach(cleanup);

it("renders select columns and commits the selected value", () => {
  const onChange = vi.fn();
  render(<TableInput value={[{ icon: "instagram", url: "https://example.com", label: "Instagram" }]}
    columns={[{ id: "icon", label: "Icon", type: "select", options: [
      { value: "instagram", label: "Instagram" }, { value: "facebook", label: "Facebook" },
    ] }, { id: "url", label: "URL", type: "text" }, { id: "label", label: "Label", type: "text" }]}
    onChange={onChange} />);

  const icon = screen.getByLabelText("Icon");
  expect(icon).toHaveValue("instagram");
  fireEvent.change(icon, { target: { value: "facebook" } });
  expect(onChange).toHaveBeenCalledWith([{ icon: "facebook", url: "https://example.com", label: "Instagram" }]);
});

it("adds, edits, and removes repeatable table rows", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<TableInput value={[]} columns={[{ id: "label", label: "Label", type: "text" }]} onChange={onChange} />);

  await user.click(screen.getByRole("button", { name: "Add row" }));
  await user.type(screen.getByLabelText("Label"), "About");
  expect(onChange).toHaveBeenLastCalledWith([{ label: "About" }]);
  await user.click(screen.getByTitle("Remove row"));
  expect(onChange).toHaveBeenLastCalledWith([]);
});

it("renames administrative rows without changing their published label and retains row metadata", () => {
  const onChange = vi.fn();
  render(<TableInput rowNames value={[{ label: "About", row_name: "Top row" }]}
    columns={[{ id: "label", label: "Label", type: "text" }]} onChange={onChange} />);

  fireEvent.change(screen.getByLabelText("Row 1 name"), { target: { value: "Main navigation" } });
  expect(onChange).toHaveBeenLastCalledWith([{ label: "About", row_name: "Main navigation" }]);
  expect(screen.getByLabelText("Label")).toHaveValue("About");
  expect(screen.getByRole("button", { name: "Reorder Main navigation" })).toBeInTheDocument();
});

it("shows the page selector for internal rows and retains the URL when destination type changes", () => {
  const onChange = vi.fn();
  const columns = [
    { id: "label", type: "text" },
    { id: "destination", type: "destination", destinationTypeColumn: "destination_type", pageUuidColumn: "destination_page_uuid", urlColumn: "destination_url" },
    { id: "destination_page_uuid", type: "hidden" }, { id: "destination_url", type: "hidden" },
    { id: "destination_type", type: "select", options: [{ value: "page", label: "Page" }, { value: "url", label: "URL" }] },
  ];
  render(<TableInput value={[{ label: "About", destination: "about", destination_type: "page", destination_url: "https://example.com", destination_page_uuid: "page-about" }]}
    columns={columns} pageOptions={[{ value: "page-about", slug: "about", label: "About" }]} onChange={onChange} />);

  expect(screen.getByRole("combobox", { name: "destination" })).toHaveValue("page-about");
  fireEvent.change(screen.getByRole("combobox", { name: "destination_type" }), { target: { value: "url" } });
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ destination: "https://example.com", destination_url: "https://example.com", destination_page_uuid: "page-about" })]);
  expect(screen.getByRole("textbox", { name: "destination" })).toHaveValue("https://example.com");
});

it("stores the selected project's page UUID and canonical slug", () => {
  const onChange = vi.fn();
  const columns = [
    { id: "label", type: "text" },
    { id: "destination", type: "destination", destinationTypeColumn: "destination_type", pageUuidColumn: "destination_page_uuid", urlColumn: "destination_url" },
    { id: "destination_page_uuid", type: "hidden" }, { id: "destination_url", type: "hidden" },
    { id: "destination_type", type: "select", options: [{ value: "page", label: "Page" }, { value: "url", label: "URL" }] },
  ];
  render(<TableInput value={[{ label: "Contact", destination: "old-contact", destination_type: "page" }]}
    columns={columns} pageOptions={[
      { value: "page-about", slug: "about", label: "About us" },
      { value: "page-contact", slug: "contact", label: "Contact" },
    ]} onChange={onChange} />);

  fireEvent.change(screen.getByRole("combobox", { name: "destination" }), { target: { value: "page-contact" } });
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ destination: "contact", destination_page_uuid: "page-contact" })]);
});
