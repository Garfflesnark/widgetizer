/**
 * Arch's newest update folder must ship the base theme's current files.
 *
 * A theme change lands in two places: the base theme (new projects) and the
 * newest `updates/<version>/` folder (existing projects applying the update).
 * Forgetting the second copy leaves existing projects on stale files with no
 * other test noticing, so every file in the newest update is compared byte for
 * byte with its base counterpart.
 *
 * Run with: node --test packages/builder-server/src/tests/themeUpdateCopies.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import path from "path";
import os from "node:os";
import { fileURLToPath } from "url";
import { applyThemeUpdateToDir } from "../services/themeUpdateService.js";
import { getProjectWidgets } from "../controllers/projectController.js";
import { LocalStorageAdapter } from "@widgetizer/adapters-local";
import { supportsImageUnits } from "@widgetizer/core/imageTransform";
import { createWyrmetizerCopy } from "@widgetizer/core/wyrmetizerLayouts";
import { compositionAdapters } from "@widgetizer/core/compositionImage";
import { fixture } from "../../../core/src/runtime/__tests__/compositionFixture.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const THEME_DIR = path.join(REPO_ROOT, "themes", "arch");

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let index = 0; index < Math.max(pa.length, pb.length); index++) {
    const diff = (pa[index] || 0) - (pb[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function filesUnder(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(full)));
    else files.push(full);
  }
  return files;
}

describe("Arch newest theme update", () => {
  it("exposes Header v1 in new projects and after updating an existing project without changing its Header data", async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "arch-header-update-"));
    t.after(() => fs.remove(root));
    const dataRoot = path.join(root, "data");
    const project = path.join(dataRoot, "projects", "arch-updated");
    const updateDir = path.join(THEME_DIR, "updates", "0.9.25");
    const newProjectSchema = await fs.readJson(path.join(THEME_DIR, "widgets/global/header/schema.json"));
    const updateSchema = await fs.readJson(path.join(updateDir, "widgets/global/header/schema.json"));
    const newBannerSchema = await fs.readJson(path.join(THEME_DIR, "widgets/banner/schema.json"));
    const updateBannerSchema = await fs.readJson(path.join(updateDir, "widgets/banner/schema.json"));
    const newFooterSchema = await fs.readJson(path.join(THEME_DIR, "widgets/global/footer/schema.json"));
    const updateFooterSchema = await fs.readJson(path.join(updateDir, "widgets/global/footer/schema.json"));
    const enabled = (schema) => schema.settings.some((setting) => setting.id === "three_region_enabled");
    assert.equal(enabled(newProjectSchema), true, "new Arch projects include the Header v1 controls");
    assert.equal(enabled(updateSchema), true, "the existing-project update includes the Header v1 controls");

    const previousTheme = await fs.readJson(path.join(THEME_DIR, "theme.json"));
    previousTheme.useCoreWidgets = false;
    previousTheme.version = "0.9.19";
    await fs.outputJson(path.join(project, "theme.json"), previousTheme);
    const authoredHeader = { type: "header", settings: {
      logoText: "My brand", menu: "main-menu", show_logo_image: false, show_contact_details: false,
      navigation_item_spacing: 20, social_icon_spacing: 16, horizontal_header_padding: 32,
      navigation_font_family: "heading", navigation_font_size: 21, navigation_font_weight: "600",
      navigation_text_color: "#224466", logo_font_family: "body", logo_font_size: 29,
      header_links: [{ label: "About", destination: "about", destination_type: "page", open_in_new_tab: "true" }],
      header_social_links: [{ icon: "instagram", url: "https://example.com/social", accessible_label: "Updates", open_in_new_tab: "false" }],
    } };
    await fs.outputJson(path.join(project, "pages/global/header.json"), authoredHeader);
    const authoredFooter = {
      type: "footer",
      settings: { copyright: "<p>Legacy footer stays</p>", layout: "equal", structured_footer_enabled: true, footer_logo_text: "Preserved unused data" },
      blocks: {
        legacy: { type: "logo_text", settings: { logo_text: "Old brand" } },
        social: { type: "social_block", settings: { footer_social_links: [{ icon: "instagram", url: "https://example.com" }] } },
      },
      blocksOrder: ["legacy", "social"],
    };
    await fs.outputJson(path.join(project, "pages/global/footer.json"), authoredFooter);
    await fs.outputJson(path.join(project, "widgets/global/footer/schema.json"), { type: "footer", settings: [] });
    await fs.outputFile(path.join(project, "widgets/global/footer/widget.liquid"), "legacy footer template");
    await fs.outputJson(path.join(project, "widgets/global/header/schema.json"), { type: "header", settings: [] });
    await fs.outputFile(path.join(project, "widgets/global/header/widget.liquid"), "legacy header template");

    const result = await applyThemeUpdateToDir({ themeSourceDir: updateDir, projectDir: project });
    const installedSchema = await fs.readJson(path.join(project, "widgets/global/header/schema.json"));
    const installedHeader = await fs.readJson(path.join(project, "pages/global/header.json"));
    const installedFooter = await fs.readJson(path.join(project, "pages/global/footer.json"));
    const installedFooterSchema = await fs.readJson(path.join(project, "widgets/global/footer/schema.json"));
    const installedBannerSchema = await fs.readJson(path.join(project, "widgets/banner/schema.json"));
    const installedTheme = await fs.readJson(path.join(project, "theme.json"));
    const installedIcons = await fs.readJson(path.join(project, "assets/icons.json"));
    assert.equal(result.newVersion, "0.9.25");
    assert.equal(installedTheme.version, "0.9.25");
    assert.equal(installedBannerSchema.blocks.find((block) => block.type === "button").settings.find((setting) => setting.id === "button_count").default, "2");
    assert.equal(await fs.pathExists(path.join(project, "widgets/banner/widget.liquid")), true);
    assert.ok(installedSchema.settings.find((setting) => setting.id === "header_social_links").columns[0].options.some((option) => option.value === "twitch"));
    assert.ok(installedFooterSchema.blocks.find((block) => block.type === "social_block").settings.find((setting) => setting.id === "footer_social_links").columns[0].options.some((option) => option.value === "twitch"));
    assert.ok(installedTheme.settings.global.social.some((setting) => setting.id === "twitch_url"));
    assert.ok(installedIcons.groups.Social.twitch.body.includes('fill="currentColor"'));
    assert.equal(await fs.pathExists(path.join(project, "snippets/social-icons.liquid")), true);
    assert.equal(enabled(installedSchema), true);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "three_region_enabled").default, false);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "header_links").pageOptions, true);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "header_social_links").rowNames, true);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "social_icon_size").default, 32);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "show_contact_details").default, true);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "show_bottom_border").default, true);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "horizontal_header_padding").default, 16);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "horizontal_header_padding").min, 0);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "horizontal_header_padding").max, 200);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "horizontal_header_padding").step, 2);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "header_links").columns.find((column) => column.id === "open_in_new_tab").default, "false");
    assert.equal(installedSchema.settings.find((setting) => setting.id === "navigation_item_spacing").default, 8);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "social_icon_spacing").default, 8);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "navigation_font_family").default, "body");
    assert.equal(installedSchema.settings.find((setting) => setting.id === "navigation_font_size").default, 16);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "social_icon_color").default, "#334155");
    assert.equal(installedSchema.settings.find((setting) => setting.id === "social_icon_hover_color").default, "#0f172a");
    const buttonBlock = (schema) => schema.blocks.find((block) => block.type === "button");
    for (const schema of [newBannerSchema, updateBannerSchema]) {
      const button = buttonBlock(schema);
      const countSetting = button.settings.find((setting) => setting.id === "button_count");
      assert.equal(countSetting.default, "2");
      assert.deepEqual(countSetting.options.map((option) => option.value), ["1", "2", "3", "4", "5"]);
      for (let number = 3; number <= 5; number += 1) {
        assert.ok(button.settings.some((setting) => setting.id === `link_${number}`));
        assert.ok(button.settings.some((setting) => setting.id === `style_${number}`));
      }
    }
    for (const schema of [newProjectSchema, updateSchema]) {
      assert.ok(schema.settings.find((setting) => setting.id === "header_social_links").columns[0].options.some((option) => option.value === "twitch"));
    }
    for (const schema of [newFooterSchema, updateFooterSchema]) {
      assert.ok(schema.blocks.find((block) => block.type === "social_block").settings.find((setting) => setting.id === "footer_social_links").columns[0].options.some((option) => option.value === "twitch"));
    }
    assert.ok(installedSchema.settings.findIndex((setting) => setting.id === "social_icon_color") >
      installedSchema.settings.findIndex((setting) => setting.id === "social_icon_spacing"));
    assert.ok(installedSchema.settings.findIndex((setting) => setting.id === "social_icon_hover_color") >
      installedSchema.settings.findIndex((setting) => setting.id === "social_icon_color"));
    const navigationTypographyIndex = installedSchema.settings.findIndex((setting) => setting.id === "navigation_typography_header");
    const navigationItemsIndex = installedSchema.settings.findIndex((setting) => setting.id === "header_links");
    assert.ok(navigationTypographyIndex >= 0 && navigationTypographyIndex < navigationItemsIndex,
      "Navigation Typography appears before the potentially long navigation items editor");
    assert.equal(installedSchema.settings.find((setting) => setting.id === "navigation_font_weight").default, "400");
    assert.equal(installedSchema.settings.find((setting) => setting.id === "navigation_hover_underline").default, false);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "logo_font_family").default, "body");
    assert.equal(installedSchema.settings.find((setting) => setting.id === "logo_font_size").default, 24);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "logo_font_weight").default, "700");
    assert.equal(installedSchema.settings.find((setting) => setting.id === "logo_text_transform").default, "none");
    assert.equal(installedSchema.settings.find((setting) => setting.id === "navigation_text_color").default, "#334155");
    assert.equal(installedSchema.settings.find((setting) => setting.id === "logo_text_color").default, "#0f172a");
    assert.deepEqual(
      installedSchema.settings.find((setting) => setting.id === "navigation_font_family").options.map((option) => option.value),
      ["body", "heading"],
    );
    assert.equal(installedSchema.settings.find((setting) => setting.id === "header_links").columns.filter((column) => column.type !== "hidden").map((column) => column.id).join(","), "label,open_in_new_tab,destination,destination_type,presentation");
    assert.equal(installedSchema.settings.find((setting) => setting.id === "header_links").columns.find((column) => column.id === "destination").layout, "full");
    assert.equal(installedSchema.settings.find((setting) => setting.id === "header_social_links").columns.map((column) => column.id).join(","), "icon,open_in_new_tab,accessible_label,url");
    assert.equal(installedSchema.settings.find((setting) => setting.id === "header_social_links").columns.find((column) => column.id === "accessible_label").layout, "full");
    assert.ok(installedSchema.settings.find((setting) => setting.id === "header_social_links").columns.some((column) => column.id === "open_in_new_tab"));
    assert.deepEqual(installedHeader, authoredHeader, "the saved Header settings remain untouched");
    assert.deepEqual(installedFooter, authoredFooter, "the saved Footer settings and blocks remain untouched");
    assert.equal(installedFooterSchema.settings.some((setting) => setting.id === "structured_footer_enabled"), false,
      "new editor schema no longer exposes the structured Footer UI");
    assert.equal(installedFooterSchema.settings.find((setting) => setting.id === "show_footer_horizontal_rule").default, true);
    assert.equal(installedFooterSchema.settings.find((setting) => setting.id === "copyright_line_height").default, 1.5);
    assert.equal(installedFooterSchema.settings.find((setting) => setting.id === "copyright_line_height").min, 0.0);
    assert.equal(installedFooterSchema.settings.find((setting) => setting.id === "copyright_line_height").max, 2.5);
    assert.equal(installedFooterSchema.settings.find((setting) => setting.id === "copyright_line_height").step, 0.1);
    const socialBlock = installedFooterSchema.blocks.find((block) => block.type === "social_block");
    assert.ok(socialBlock.settings.some((setting) => setting.id === "footer_social_links"));
    assert.equal(socialBlock.settings.find((setting) => setting.id === "footer_social_icon_size").default, 38);
    assert.equal(socialBlock.settings.find((setting) => setting.id === "footer_social_icon_color").default, "");
    assert.equal(installedFooter.settings.structured_footer_enabled, true,
      "legacy structured Footer values survive as inert saved data");
    assert.deepEqual(
      await fs.readFile(path.join(project, "widgets/global/footer/widget.liquid")),
      await fs.readFile(path.join(THEME_DIR, "widgets/global/footer/widget.liquid")),
    );
    assert.deepEqual(
      await fs.readFile(path.join(project, "widgets/global/header/widget.liquid")),
      await fs.readFile(path.join(THEME_DIR, "widgets/global/header/widget.liquid")),
    );

    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    const scope = { actor: { id: "fixture", kind: "local" }, projectId: "arch-updated", folderName: "arch-updated" };
    await getProjectWidgets({
      query: {},
      scope,
      activeProject: { id: scope.projectId, defaultLanguage: "en", languages: [] },
      adapters: { storage: new LocalStorageAdapter({ dataRoot }) },
    }, response);
    const editorHeaderSchema = response.body.find((schema) => schema.type === "header");
    assert.ok(editorHeaderSchema, "the editor schema endpoint returns the global Header schema");
    assert.equal(enabled(editorHeaderSchema), true, "the editor receives the Header v1 controls from the updated project");
    const editorFooterSchema = response.body.find((schema) => schema.type === "footer");
    assert.ok(editorFooterSchema, "the editor receives the global Footer schema from the updated project");
    assert.equal(editorFooterSchema.settings.some((setting) => setting.id === "structured_footer_enabled"), false);
    assert.ok(editorFooterSchema.blocks.find((block) => block.type === "social_block").settings.some((setting) => setting.id === "footer_social_links"));
  });

  it("delivers the Image schema and template while preserving authored content and customized theme settings", async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "arch-image-update-"));
    t.after(() => fs.remove(root));
    const source = path.join(root, "source"), project = path.join(root, "project");
    await fs.copy(path.join(THEME_DIR, "updates", "0.9.10"), source);
    const theme = await fs.readJson(path.join(source, "theme.json"));
    theme.version = "0.9.9";
    theme.settings.global.general.find((setting) => setting.id === "favicon").value = "/uploads/images/own.png";
    await fs.outputJson(path.join(project, "theme.json"), theme);
    const page = createWyrmetizerCopy(fixture(), compositionAdapters);
    const placement = page.layout.areas.canvas.composition.geometry.placements.a;
    placement.version = 3;
    Object.assign(placement.frames.desktop, { rotation: 20, rotationPivot: { x: 0.2, y: 0.8 } });
    page.layout.areas.canvas.composition.geometry.stackOrder.reverse();
    const authored = {
      "pages/index.json": JSON.stringify(page),
      "pages/global/header.json": JSON.stringify({ type: "header", settings: { title: "My header" } }),
      "menus/main.json": JSON.stringify({ id: "main", items: [{ label: "My menu", link: "/custom" }] }),
      "collections/news/authored.json": JSON.stringify({ title: "My story" }),
      "uploads/images/own.png": "authored-media-bytes",
    };
    for (const [file, bytes] of Object.entries(authored)) await fs.outputFile(path.join(project, file), bytes);
    await fs.outputFile(path.join(project, "widgets/image/widget.liquid"), "previous image template");
    const updated = await applyThemeUpdateToDir({ themeSourceDir: source, projectDir: project });
    assert.equal(updated.newVersion, "0.9.10");
    for (const file of ["schema.json", "widget.liquid"]) {
      assert.deepEqual(await fs.readFile(path.join(project, "widgets/image", file)),
        await fs.readFile(path.join(THEME_DIR, "widgets/image", file)));
    }
    const schema = await fs.readJson(path.join(project, "widgets/image/schema.json"));
    assert.equal(supportsImageUnits({ type: "image" }, schema), true);
    assert.equal(schema.compositionCapability, "image.v1");
    assert.equal(schema.imageSpacingVersion, 1);
    for (const [file, bytes] of Object.entries(authored)) {
      assert.equal(await fs.readFile(path.join(project, file), "utf8"), bytes, file);
    }
    const merged = await fs.readJson(path.join(project, "theme.json"));
    assert.equal(merged.settings.global.general.find((setting) => setting.id === "favicon").value,
      "/uploads/images/own.png");
  });

  it("ships every file identical to the base theme", async () => {
    const versions = (await fs.readdir(path.join(THEME_DIR, "updates"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^\d+(\.\d+)*$/.test(entry.name))
      .map((entry) => entry.name)
      .sort(compareVersions);
    const newest = versions.at(-1);
    assert.ok(newest, "Arch should have at least one update folder");

    const updateDir = path.join(THEME_DIR, "updates", newest);
    const mismatched = [];
    for (const file of await filesUnder(updateDir)) {
      const relative = path.relative(updateDir, file);
      const base = path.join(THEME_DIR, relative);
      if (!(await fs.pathExists(base))) continue;
      const [updateBytes, baseBytes] = await Promise.all([fs.readFile(file), fs.readFile(base)]);
      if (relative === "theme.json") {
        const [updateTheme, baseTheme] = [updateBytes, baseBytes].map((bytes) => JSON.parse(bytes.toString("utf8")));
        updateTheme.version = baseTheme.version;
        if (JSON.stringify(updateTheme) !== JSON.stringify(baseTheme)) mismatched.push(relative);
      } else if (!updateBytes.equals(baseBytes)) {
        mismatched.push(relative.split(path.sep).join("/"));
      }
    }

    assert.deepEqual(mismatched, [], `updates/${newest} differs from the base theme in: ${mismatched.join(", ")}`);
  });
});
