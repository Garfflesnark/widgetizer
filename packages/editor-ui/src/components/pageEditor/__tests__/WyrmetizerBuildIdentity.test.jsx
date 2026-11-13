// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import usePageStore from "../../../stores/pageStore.js";
import WyrmetizerBuildIdentity from "../WyrmetizerBuildIdentity.jsx";

describe("WyrmetizerBuildIdentity", () => {
  beforeEach(() => usePageStore.setState({ page: null }));

  it("updates the displayed canonical page version when the selected page changes", () => {
    usePageStore.setState({ page: { layout: { version: 1, compositions: { canvas: {} } } } });
    render(<WyrmetizerBuildIdentity presentation="desktop" />);
    expect(screen.getByTestId("wyrmetizer-identity-summary")).toHaveTextContent("v1");

    act(() => usePageStore.setState({ page: {
      layout: { version: 1, contentOrder: [] },
      wyrmetizerEditorLayout: { version: 3, mobile: { referenceWidthPx: 390 } },
    } }));
    expect(screen.getByTestId("wyrmetizer-identity-summary")).toHaveTextContent("v3");
  });

  it("updates the active presentation and exposes the full build identity", () => {
    usePageStore.setState({ page: { layout: { version: 2, areas: {}, contentOrder: [] } } });
    const view = render(<WyrmetizerBuildIdentity presentation="desktop" />);
    expect(screen.getByTestId("wyrmetizer-identity-summary")).toHaveTextContent("Desktop");
    view.rerender(<WyrmetizerBuildIdentity presentation="mobile" />);
    expect(screen.getByTestId("wyrmetizer-identity-summary")).toHaveTextContent("Mobile");

    const summary = screen.getByTestId("wyrmetizer-identity-summary");
    summary.parentElement.open = true;
    expect(screen.getByText("Frontend commit")).toBeInTheDocument();
    expect(screen.getByText("Page layout")).toBeInTheDocument();
    expect(screen.getByText("Presentation")).toBeInTheDocument();
    expect(screen.getByText(__WYRMETIZER_BUILD_COMMIT__)).toBeInTheDocument();
  });
});
