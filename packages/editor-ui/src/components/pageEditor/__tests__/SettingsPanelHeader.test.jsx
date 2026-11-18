// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import headerSchema from "../../../../../../themes/arch/updates/0.9.11/widgets/global/header/schema.json";
import currentHeaderSchema from "../../../../../../themes/arch/widgets/global/header/schema.json";
import headerLocale from "../../../../../../themes/arch/locales/en.json";

vi.mock("../../../hooks/useThemeLocale", () => ({
  useThemeLocale: () => ({
    tTheme: (key) => key?.startsWith("tTheme:")
      ? key.slice("tTheme:".length).split(".").reduce((value, part) => value?.[part], headerLocale) ?? key
      : key,
  }),
}));
vi.mock("../../../hooks/useCollections", () => ({ default: () => ({ schemas: [] }) }));
vi.mock("../../../lib/activeProjectId", () => ({ getActiveProjectId: () => "header-update-project" }));
vi.mock("../../../queries/previewManager", () => ({
  getProjectWidgets: vi.fn(),
  saveGlobalWidget: vi.fn().mockResolvedValue({}),
}));

import pageStore from "../../../stores/pageStore";
import widgetStore from "../../../stores/widgetStore";
import saveStore from "../../../stores/saveStore";
import { getProjectWidgets, saveGlobalWidget } from "../../../queries/previewManager";
import SettingsPanel from "../SettingsPanel";

const legacyHeader = {
  type: "header",
  settings: {
    logoText: "Existing Brand",
    headerNavigation: "main-navigation",
    ctaButtonLink: { href: "/contact", text: "Contact", target: "_self" },
    color_scheme: "standard-primary",
  },
};

beforeEach(() => {
  pageStore.setState({ page: { id: "index", widgets: {} }, globalWidgets: { header: structuredClone(legacyHeader) } });
  widgetStore.setState({ schemas: {}, selectedGlobalWidgetId: "header", selectedBlockId: null, activeLoadId: 0 });
  getProjectWidgets.mockReset().mockResolvedValue([headerSchema]);
  saveGlobalWidget.mockReset().mockResolvedValue({});
  saveStore.setState({ modifiedWidgets: new Set(), structureModified: false, runningSave: null, queuedFollowUp: null });
  pageStore.temporal.getState().clear();
});

afterEach(() => {
  cleanup();
  saveStore.getState().stopAutoSave();
});

function HeaderPanel() {
  const schemas = widgetStore((state) => state.schemas);
  return <SettingsPanel selectedGlobalWidgetId="header" widgetSchemas={schemas} />;
}

it("loads and renders updated Header settings for the selected global Header and preserves legacy settings", async () => {
  await widgetStore.getState().loadSchemas("");
  expect(getProjectWidgets).toHaveBeenCalledOnce();

  render(
    <HeaderPanel />,
  );

  expect(screen.getByText("Three-region layout")).toBeTruthy();
  const enabled = screen.getByRole("switch", { name: "Use three-region Header" });
  expect(enabled.getAttribute("aria-checked")).toBe("false");
  expect(screen.getByRole("switch", { name: "Show logo image" })).toBeTruthy();
  expect(screen.getByRole("switch", { name: "Show logo text" })).toBeTruthy();
  expect(screen.getByLabelText("Logo group region")).toBeTruthy();
  expect(screen.getByLabelText("Navigation region")).toBeTruthy();
  expect(screen.getByLabelText("Social links region")).toBeTruthy();
  expect(screen.getByText("Visible navigation items")).toBeTruthy();
  expect(screen.getByText("Social links")).toBeTruthy();

  fireEvent.click(enabled);
  expect(pageStore.getState().globalWidgets.header.settings.three_region_enabled).toBe(true);
  expect(pageStore.getState().globalWidgets.header.settings).toMatchObject(legacyHeader.settings);

  const savedHeader = structuredClone(pageStore.getState().globalWidgets.header);
  act(() => pageStore.setState({ globalWidgets: { header: savedHeader } }));
  expect(screen.getByRole("switch", { name: "Use three-region Header" }).getAttribute("aria-checked")).toBe("true");
  expect(pageStore.getState().globalWidgets.header.settings).toMatchObject({
    ...legacyHeader.settings,
    three_region_enabled: true,
  });
});

it("shows shared typography before the navigation table and applies edits to Header settings", async () => {
  getProjectWidgets.mockResolvedValue([currentHeaderSchema]);
  await widgetStore.getState().loadSchemas("");
  render(<HeaderPanel />);

  const navigationTypography = screen.getByText("Navigation Typography");
  const logoTypography = screen.getByText("Logo Text Typography");
  const navigationItems = screen.getByText("Visible navigation items");
  expect(navigationTypography).toBeTruthy();
  expect(logoTypography).toBeTruthy();
  expect(navigationTypography.compareDocumentPosition(navigationItems) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(logoTypography.compareDocumentPosition(navigationItems) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  const fontSize = document.getElementById("navigation_font_size");
  expect(fontSize).toBeTruthy();
  expect(screen.getByText("Social Icon Colour")).toBeTruthy();
  expect(screen.getByText("Social Icon Hover Colour")).toBeTruthy();
  const headerBeforeEdit = structuredClone(pageStore.getState().globalWidgets.header);
  pageStore.setState({ originalPage: { id: "index", widgets: {} }, originalGlobalWidgets: { header: headerBeforeEdit, footer: null } });
  fireEvent.change(fontSize, { target: { value: "23" } });
  fireEvent.change(document.getElementById("social_icon_color"), { target: { value: "225577" } });
  fireEvent.change(document.getElementById("social_icon_hover_color"), { target: { value: "cc4488" } });
  expect(pageStore.getState().globalWidgets.header.settings.navigation_font_size).toBe(23);
  expect(pageStore.getState().globalWidgets.header.settings.social_icon_color).toBe("#225577");
  expect(pageStore.getState().globalWidgets.header.settings.social_icon_hover_color).toBe("#cc4488");
  expect(pageStore.getState().globalWidgets.header.settings.logoText).toBe("Existing Brand");
  await saveStore.getState().save();
  expect(saveGlobalWidget).toHaveBeenCalledWith("header", expect.objectContaining({
    settings: expect.objectContaining({
      navigation_font_size: 23,
      social_icon_color: "#225577",
      social_icon_hover_color: "#cc4488",
      logoText: "Existing Brand",
    }),
  }), undefined);
});
