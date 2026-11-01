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
      if (!updateBytes.equals(baseBytes)) mismatched.push(relative.split(path.sep).join("/"));
    }

    assert.deepEqual(mismatched, [], `updates/${newest} differs from the base theme in: ${mismatched.join(", ")}`);
  });
});
