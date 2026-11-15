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
