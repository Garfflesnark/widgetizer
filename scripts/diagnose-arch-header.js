#!/usr/bin/env node

import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HEADER_SETTING_IDS = [
  "three_region_enabled",
  "show_logo_image",
  "show_logo_text",
  "logo_region",
  "navigation_region",
  "social_region",
  "header_links",
  "header_social_links",
];

const exists = (filename) => {
  try {
    fs.accessSync(filename);
    return true;
  } catch {
    return false;
  }
};

const readJson = (filename) => {
  try {
    return JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch {
    return null;
  }
};

const digest = (filename) => {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
  } catch {
    return null;
  }
};

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function projectIsWithin(root, folderName) {
  const projectsRoot = path.resolve(root, "projects");
  const projectDir = path.resolve(projectsRoot, folderName);
  const relative = path.relative(projectsRoot, projectDir);
  return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
    ? projectDir
    : null;
}

function diagnoseProject({ dataRoot, project }) {
  const projectDir = projectIsWithin(dataRoot, project.folder_name);
  if (!projectDir) {
    return { projectId: project.id, status: "unsafe-project-folder", theme: project.theme };
  }

  const projectTheme = readJson(path.join(projectDir, "theme.json"));
  const installedSchemaPath = path.join(projectDir, "widgets", "global", "header", "schema.json");
  const installedSchema = readJson(installedSchemaPath);
  const installedThemeDir = path.join(dataRoot, "themes", project.theme || "");
  const latestThemeDir = path.join(installedThemeDir, "latest");
  const sourceDir = exists(path.join(latestThemeDir, "theme.json")) ? latestThemeDir : installedThemeDir;
  const sourceTheme = readJson(path.join(sourceDir, "theme.json"));
  const expectedSchemaPath = path.join(sourceDir, "widgets", "global", "header", "schema.json");
  const expectedSchema = readJson(expectedSchemaPath);
  const installedIds = new Set((installedSchema?.settings || []).map((setting) => setting?.id));
  const expectedIds = new Set((expectedSchema?.settings || []).map((setting) => setting?.id));
  const missingFromProject = [...expectedIds].filter((id) => !installedIds.has(id));
  const missingHeaderSettings = HEADER_SETTING_IDS.filter((id) => expectedIds.has(id) && !installedIds.has(id));
  const schemaMatchesSource = !!installedSchema && !!expectedSchema && stableJson(installedSchema) === stableJson(expectedSchema);
  const hasThreeRegion = installedIds.has("three_region_enabled");
  const sourceHasThreeRegion = expectedIds.has("three_region_enabled");

  let status = "current";
  if (project.theme !== "arch") status = "not-arch-project";
  else if (!installedSchema) status = "project-header-schema-missing-or-invalid";
  else if (!expectedSchema) status = "installed-theme-header-schema-missing-or-invalid";
  else if (sourceHasThreeRegion && !hasThreeRegion) status = "project-header-schema-stale";
  else if (!schemaMatchesSource) status = "project-header-schema-differs-from-theme";
  else if (project.theme_version !== sourceTheme?.version) status = "project-theme-version-behind-source";

  return {
    projectId: project.id,
    projectFolder: project.folder_name,
    theme: project.theme,
    themeVersion: {
      projectDatabase: project.theme_version ?? null,
      projectThemeFile: projectTheme?.version ?? null,
      installedThemeSource: sourceTheme?.version ?? null,
    },
    schema: {
      editorLoadsFrom: installedSchemaPath,
      source: expectedSchemaPath,
      project: installedSchemaPath,
      readable: !!installedSchema,
      sourceReadable: !!expectedSchema,
      sha256MatchesSource: schemaMatchesSource ? digest(installedSchemaPath) === digest(expectedSchemaPath) : false,
      hasThreeRegionEnabled: hasThreeRegion,
      sourceHasThreeRegionEnabled: sourceHasThreeRegion,
      missingFromProject,
      missingHeaderSettings,
    },
    status,
  };
}

/** Read-only audit of Arch project Header schemas in a Widgetizer data root. */
export function diagnoseArchHeader({ dataRoot, projectId } = {}) {
  const root = path.resolve(dataRoot || process.env.DATA_ROOT || path.join(process.cwd(), "data"));
  const dbPath = path.join(root, "widgetizer.db");
  if (!exists(dbPath)) throw new Error(`Widgetizer database not found: ${dbPath}`);

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = projectId
      ? db.prepare("SELECT id, folder_name, theme, theme_version FROM projects WHERE id = ?").all(projectId)
      : db.prepare("SELECT id, folder_name, theme, theme_version FROM projects WHERE lower(theme) = 'arch' ORDER BY folder_name").all();
    if (projectId && rows.length === 0) throw new Error(`Project not found in this data root: ${projectId}`);
    return {
      dataRoot: root,
      database: dbPath,
      projects: rows.map((project) => diagnoseProject({ dataRoot: root, project })),
      readOnly: true,
    };
  } finally {
    db.close();
  }
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--data-root") options.dataRoot = args[++index];
    else if (args[index] === "--project-id") options.projectId = args[++index];
    else if (args[index] === "--help") options.help = true;
    else throw new Error(`Unknown option: ${args[index]}`);
  }
  return options;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node scripts/diagnose-arch-header.js [--data-root <path>] [--project-id <uuid>]");
    } else {
      console.log(JSON.stringify(diagnoseArchHeader(options), null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
