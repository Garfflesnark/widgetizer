import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diagnoseArchHeader } from "../diagnose-arch-header.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_ROOT = path.join(os.tmpdir(), `header-diagnostic-${Date.now()}`);
const PROJECTS = [
  { id: "current", folder: "current", version: "0.9.11", hasHeaderV1: true },
  { id: "stale", folder: "stale", version: "0.9.10", hasHeaderV1: false },
];

before(async () => {
  await fs.ensureDir(DATA_ROOT);
  const db = new Database(path.join(DATA_ROOT, "widgetizer.db"));
  db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, folder_name TEXT, theme TEXT, theme_version TEXT)");
  const insert = db.prepare("INSERT INTO projects (id, folder_name, theme, theme_version) VALUES (?, ?, 'arch', ?)");
  for (const project of PROJECTS) {
    insert.run(project.id, project.folder, project.version);
    const folder = path.join(DATA_ROOT, "projects", project.folder);
    await fs.ensureDir(path.join(folder, "widgets", "global", "header"));
    await fs.outputJson(path.join(folder, "theme.json"), { version: project.version });
  }
  db.close();

  const themeDir = path.join(DATA_ROOT, "themes", "arch");
  await fs.copy(path.join(REPO_ROOT, "themes", "arch"), themeDir, {
    filter: (src) => !src.includes(`${path.sep}preset-media${path.sep}`),
  });
  const sourceSchemaPath = path.join(themeDir, "updates", "0.9.11", "widgets", "global", "header", "schema.json");
  const currentDir = path.join(DATA_ROOT, "projects", "current", "widgets", "global", "header");
  const staleDir = path.join(DATA_ROOT, "projects", "stale", "widgets", "global", "header");
  await fs.copy(sourceSchemaPath, path.join(currentDir, "schema.json"));
  await fs.outputJson(path.join(staleDir, "schema.json"), { type: "header", settings: [{ id: "logoText", type: "text" }] });
  await fs.copy(path.join(themeDir, "updates", "0.9.11", "theme.json"), path.join(themeDir, "latest", "theme.json"));
  await fs.copy(path.join(themeDir, "updates", "0.9.11", "widgets", "global", "header", "schema.json"),
    path.join(themeDir, "latest", "widgets", "global", "header", "schema.json"));
});

after(async () => fs.remove(DATA_ROOT));

describe("diagnoseArchHeader", () => {
  it("identifies an updated project whose schema matches the effective theme source", () => {
    const report = diagnoseArchHeader({ dataRoot: DATA_ROOT, projectId: "current" });
    assert.equal(report.readOnly, true);
    assert.equal(report.projects[0].status, "current");
    assert.equal(report.projects[0].themeVersion.installedThemeSource, "0.9.11");
    assert.equal(report.projects[0].schema.hasThreeRegionEnabled, true);
    assert.equal(report.projects[0].schema.sha256MatchesSource, true);
  });

  it("identifies a stale project schema and reports missing Header v1 controls without exposing settings values", () => {
    const report = diagnoseArchHeader({ dataRoot: DATA_ROOT, projectId: "stale" });
    assert.equal(report.projects[0].status, "project-header-schema-stale");
    assert.equal(report.projects[0].themeVersion.projectDatabase, "0.9.10");
    assert.equal(report.projects[0].themeVersion.installedThemeSource, "0.9.11");
    assert.equal(report.projects[0].schema.hasThreeRegionEnabled, false);
    assert.deepEqual(report.projects[0].schema.missingHeaderSettings, [
      "three_region_enabled", "show_logo_image", "show_logo_text", "logo_region",
      "navigation_region", "social_region", "header_links", "header_social_links",
    ]);
    assert.equal(Object.hasOwn(report.projects[0], "settings"), false);
  });
});
