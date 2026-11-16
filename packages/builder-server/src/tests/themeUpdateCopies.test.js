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
    const updateDir = path.join(THEME_DIR, "updates", "0.9.13");
    const newProjectSchema = await fs.readJson(path.join(THEME_DIR, "widgets/global/header/schema.json"));
    const updateSchema = await fs.readJson(path.join(updateDir, "widgets/global/header/schema.json"));
    const enabled = (schema) => schema.settings.some((setting) => setting.id === "three_region_enabled");
    assert.equal(enabled(newProjectSchema), true, "new Arch projects include the Header v1 controls");
    assert.equal(enabled(updateSchema), true, "the existing-project update includes the Header v1 controls");

    const previousTheme = await fs.readJson(path.join(THEME_DIR, "theme.json"));
    previousTheme.useCoreWidgets = false;
    await fs.outputJson(path.join(project, "theme.json"), previousTheme);
    const authoredHeader = { type: "header", settings: { logoText: "My brand", menu: "main-menu" } };
    await fs.outputJson(path.join(project, "pages/global/header.json"), authoredHeader);
    await fs.outputJson(path.join(project, "widgets/global/header/schema.json"), { type: "header", settings: [] });
    await fs.outputFile(path.join(project, "widgets/global/header/widget.liquid"), "legacy header template");

    const result = await applyThemeUpdateToDir({ themeSourceDir: updateDir, projectDir: project });
    const installedSchema = await fs.readJson(path.join(project, "widgets/global/header/schema.json"));
    const installedHeader = await fs.readJson(path.join(project, "pages/global/header.json"));
    assert.equal(result.newVersion, "0.9.13");
    assert.equal(enabled(installedSchema), true);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "three_region_enabled").default, false);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "header_links").pageOptions, true);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "header_social_links").rowNames, true);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "social_icon_size").default, 32);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "show_contact_details").default, true);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "show_bottom_border").default, true);
    assert.equal(installedSchema.settings.find((setting) => setting.id === "header_links").columns.find((column) => column.id === "open_in_new_tab").default, "false");
    assert.ok(installedSchema.settings.find((setting) => setting.id === "header_social_links").columns.some((column) => column.id === "open_in_new_tab"));
    assert.deepEqual(installedHeader, authoredHeader, "the saved Header settings remain untouched");
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
