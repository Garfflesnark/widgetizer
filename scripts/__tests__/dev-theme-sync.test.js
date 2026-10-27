import { afterEach, beforeEach, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import { contentDigest, parseArgs, planSync, rollback, selectProject, synchronize } from "../dev-theme-sync.js";

let root, dataRoot, options;
const files = ["widgets/image/schema.json", "widgets/image/widget.liquid"];
const old = ['{"type":"image","settings":[]}\n', "<img>\n"];
const current = ['{"type":"image","settings":[{"id":"image_height_px"}]}\n', '<img data-image-height="0">\n'];
const write = async (file, content) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
};
const read = (relative) => fs.readFile(path.join(dataRoot, relative), "utf8");
async function installed(latest = false) {
  await write(path.join(dataRoot, "themes/arch/theme.json"), '{"version":"0.9.10"}');
  for (let i = 0; i < files.length; i++) await write(path.join(dataRoot, "themes/arch", files[i]), old[i]);
  if (latest) {
    await write(path.join(dataRoot, "themes/arch/latest/theme.json"), '{"version":"0.9.11"}');
    for (let i = 0; i < files.length; i++) await write(path.join(dataRoot, "themes/arch/latest", files[i]), old[i]);
  }
}
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "widgetizer-dev-sync-"));
  dataRoot = path.join(root, "data");
  await fs.mkdir(path.join(root, ".git"));
  await fs.mkdir(dataRoot);
  const db = new Database(path.join(dataRoot, "widgetizer.db"));
  db.exec(
    "CREATE TABLE projects (id TEXT, name TEXT, folder_name TEXT, theme TEXT, theme_version TEXT, site_url TEXT)",
  );
  const add = db.prepare("INSERT INTO projects VALUES (?, ?, ?, 'arch', '0.9.10', '')");
  add.run("p-lab", "RESIZE LAB", "resize-lab");
  add.run("p-test", "PIZZA", "test");
  add.run("p-other", "Unrelated", "other");
  db.close();
  for (const folder of ["resize-lab", "test", "other"]) {
    await write(path.join(dataRoot, `projects/${folder}/theme.json`), '{"version":"0.9.10"}');
    await write(path.join(dataRoot, `projects/${folder}/pages/test.json`), '{"name":"User content"}');
    for (let i = 0; i < files.length; i++) await write(path.join(dataRoot, `projects/${folder}`, files[i]), old[i]);
  }
  for (let i = 0; i < files.length; i++) await write(path.join(root, "themes/arch", files[i]), current[i]);
  options = {
    root,
    dataRoot,
    development: true,
    environment: "development",
    apply: true,
    project: await selectProject(dataRoot, "resize-lab"),
    revision: "fixture-revision",
    profile: {
      theme: "arch",
      files,
      trustedBaselines: Object.fromEntries(
        files.map((file, i) => [file, [{ revision: "baseline", sha256: contentDigest(Buffer.from(old[i])) }]]),
      ),
    },
  };
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

it("requires an exact explicit ID/folder, never a display name or an implicit active project", async () => {
  expect((await selectProject(dataRoot, "p-lab")).folderName).toBe("resize-lab");
  expect((await selectProject(dataRoot, "resize-lab")).id).toBe("p-lab");
  for (const target of [undefined, "", "RESIZE LAB", "../test", "C:\\projects", "absent"]) {
    await expect(selectProject(dataRoot, target)).rejects.toThrow();
  }
});
it("rejects ambiguous identifiers", async () => {
  const db = new Database(path.join(dataRoot, "widgetizer.db"));
  db.prepare("INSERT INTO projects VALUES ('resize-lab', 'Other', 'different', 'arch', '0.9.10', '')").run();
  db.close();
  await expect(selectProject(dataRoot, "resize-lab")).rejects.toThrow(/exactly one/);
});
it("protects original TEST even when its display name has changed", async () => {
  await expect(synchronize({ ...options, project: await selectProject(dataRoot, "p-test") })).rejects.toThrow(
    /protected/,
  );
  expect(await read(`projects/test/${files[0]}`)).toBe(old[0]);
});
it("writes only selected approved image files; leaves pages, other projects and metadata unchanged", async () => {
  const result = await synchronize(options);
  expect(result.mode).toBe("applied");
  expect(result.files).toHaveLength(2);
  for (let i = 0; i < files.length; i++) {
    expect(await read(`projects/resize-lab/${files[i]}`)).toBe(current[i]);
    expect(await read(`projects/test/${files[i]}`)).toBe(old[i]);
    expect(await read(`projects/other/${files[i]}`)).toBe(old[i]);
  }
  expect(await read("projects/resize-lab/pages/test.json")).toBe('{"name":"User content"}');
  expect(await read("projects/resize-lab/theme.json")).toBe('{"version":"0.9.10"}');
  const db = new Database(path.join(dataRoot, "widgetizer.db"), { readonly: true });
  expect(db.prepare("SELECT theme_version FROM projects WHERE id='p-lab'").get().theme_version).toBe("0.9.10");
  db.close();
});
it("creates verified backups and reports exact versions and paths", async () => {
  const result = await synchronize(options);
  const manifest = JSON.parse(await fs.readFile(path.join(result.backup, "manifest.json")));
  expect(manifest.status).toBe("applied");
  expect(manifest.revision).toBe("fixture-revision");
  for (let i = 0; i < files.length; i++) {
    expect(await fs.readFile(path.join(result.backup, "before/project", files[i]), "utf8")).toBe(old[i]);
    expect(result.files[i].destination).toBe(path.join(dataRoot, "projects/resize-lab", files[i]));
    expect(result.files[i].source).toBe(path.join(root, "themes/arch", files[i]));
    expect(result.files[i].baseThemeVersion).toBe("0.9.10");
    expect(result.files[i].sourceHash).toMatch(/^[a-f0-9]{64}$/);
  }
});
it("normalizes only BOM/line endings for matching a reviewed baseline and restores original bytes", async () => {
  const raw = "\uFEFF" + old[1].replace(/\n/g, "\r\n");
  await write(path.join(dataRoot, "projects/resize-lab", files[1]), raw);
  await synchronize(options);
  await rollback({ ...options, apply: false, rollback: "latest" });
  expect(await read(`projects/resize-lab/${files[1]}`)).toBe(raw);
});
it("preflights all files and refuses customizations without partial writes or backups", async () => {
  await write(path.join(dataRoot, "projects/resize-lab", files[1]), '<img class="custom">\n');
  const plan = await planSync(options);
  expect(plan.conflicts).toHaveLength(1);
  await expect(synchronize(options)).rejects.toThrow(/Theme conflicts/);
  expect(await read(`projects/resize-lab/${files[0]}`)).toBe(old[0]);
  expect(await fs.stat(path.join(dataRoot, ".dev-theme-sync")).catch(() => null)).toBeNull();
});
it("supports subsequent contractor revisions using the last managed content hash", async () => {
  await synchronize(options);
  await write(path.join(root, "themes/arch", files[1]), '<img data-image-height="400">\n');
  const next = await synchronize(options);
  expect(next.mode).toBe("applied");
  expect(next.files.filter((file) => file.changed)).toHaveLength(1);
  expect(await read(`projects/resize-lab/${files[1]}`)).toContain('"400"');
});
it("does not overwrite a user customization made after a managed sync", async () => {
  await synchronize(options);
  await write(path.join(dataRoot, "projects/resize-lab", files[1]), "custom after sync");
  await expect(synchronize(options)).rejects.toThrow(/conflicts/);
  await expect(rollback({ ...options, apply: false, rollback: "latest" })).rejects.toThrow(/conflicts/);
  expect(await read(`projects/resize-lab/${files[1]}`)).toBe("custom after sync");
});
it("rolls back both files and permits a subsequent fresh sync", async () => {
  const sync = await synchronize(options);
  const restored = await rollback({ ...options, apply: false, rollback: sync.runId });
  expect(restored.mode).toBe("rolled-back");
  for (let i = 0; i < files.length; i++) expect(await read(`projects/resize-lab/${files[i]}`)).toBe(old[i]);
  await expect(rollback({ ...options, apply: false, rollback: sync.runId })).rejects.toThrow(/already rolled-back/);
  expect((await synchronize(options)).mode).toBe("applied");
});
it("is idempotent and a read-only plan creates no files", async () => {
  expect((await synchronize({ ...options, apply: false })).mode).toBe("plan");
  expect(await fs.stat(path.join(dataRoot, ".dev-theme-sync")).catch(() => null)).toBeNull();
  await synchronize(options);
  expect((await synchronize(options)).mode).toBe("unchanged");
});
it("handles installed root plus valid latest snapshots without altering theme versions", async () => {
  await installed(true);
  const sync = await synchronize({ ...options, installed: true });
  expect(sync.files).toHaveLength(6);
  for (const folder of ["themes/arch", "themes/arch/latest", "projects/resize-lab"]) {
    for (let i = 0; i < files.length; i++) expect(await read(`${folder}/${files[i]}`)).toBe(current[i]);
  }
  expect(await read("themes/arch/latest/theme.json")).toBe('{"version":"0.9.11"}');
  await rollback({ ...options, apply: false, rollback: "latest" });
  for (const folder of ["themes/arch", "themes/arch/latest", "projects/resize-lab"]) {
    for (let i = 0; i < files.length; i++) expect(await read(`${folder}/${files[i]}`)).toBe(old[i]);
  }
});
it("ignores incomplete latest directories and does not touch installed themes without --installed", async () => {
  await installed();
  await fs.mkdir(path.join(dataRoot, "themes/arch/latest"));
  expect((await synchronize({ ...options, installed: true })).files).toHaveLength(4);
  await rollback({ ...options, apply: false, rollback: "latest" });
  await synchronize(options);
  expect(await read(`themes/arch/${files[0]}`)).toBe(old[0]);
});
it("treats a customized installed snapshot as a conflict before any project write", async () => {
  await installed(true);
  await write(path.join(dataRoot, "themes/arch/latest", files[1]), "custom snapshot");
  await expect(synchronize({ ...options, installed: true })).rejects.toThrow(/conflicts/);
  expect(await read(`projects/resize-lab/${files[0]}`)).toBe(old[0]);
});
it.each(["pages/index.json", "../theme.json", "widgets/image/../../theme.json", "widgets/global/header/widget.liquid"])(
  "rejects unapproved profile scope %s",
  async (file) => {
    await expect(synchronize({ ...options, profile: { ...options.profile, files: [file] } })).rejects.toThrow();
  },
);
it.each(["no-development", "production", "public-site", "wrong-theme", "no-checkout"])(
  "refuses unsafe context %s",
  async (kind) => {
    if (kind === "no-development") options.development = false;
    if (kind === "production") options.environment = "production";
    if (kind === "public-site") options.project.siteUrl = "https://example.com";
    if (kind === "wrong-theme") options.project.theme = "other";
    if (kind === "no-checkout") await fs.rmdir(path.join(root, ".git"));
    await expect(synchronize(options)).rejects.toThrow();
  },
);
it.each(["source", "project", "installed"])("rejects a missing %s directory", async (kind) => {
  if (kind === "source") await fs.rename(path.join(root, "themes"), path.join(root, "not-themes"));
  if (kind === "project")
    await fs.rename(path.join(dataRoot, "projects/resize-lab"), path.join(dataRoot, "projects/not-lab"));
  if (kind === "installed") options.installed = true;
  await expect(synchronize(options)).rejects.toThrow(/Missing path/);
});
it("rejects a symlink/junction target", async () => {
  const widgetDir = path.join(dataRoot, "projects/resize-lab/widgets");
  const alternate = path.join(root, "custom-widgets");
  await fs.rename(widgetDir, alternate);
  await fs.symlink(alternate, widgetDir, process.platform === "win32" ? "junction" : "dir");
  await expect(synchronize(options)).rejects.toThrow(/symlink\/junction/);
});
it("rejects tampered backup bytes and rollback path traversal", async () => {
  const sync = await synchronize(options);
  await write(path.join(sync.backup, "before/project", files[0]), "tampered");
  await expect(rollback({ ...options, apply: false, rollback: sync.runId })).rejects.toThrow(/checksum/);
  await expect(rollback({ ...options, apply: false, rollback: "../../" })).rejects.toThrow(/valid rollback/);
});
it("refuses a concurrent sync lock", async () => {
  await write(path.join(dataRoot, ".dev-theme-sync/sync.lock"), "other process");
  await expect(synchronize(options)).rejects.toThrow(/Another development sync/);
});
it("rejects invalid source schemas before creating backups or touching project files", async () => {
  await write(path.join(root, "themes/arch", files[0]), "{invalid json");
  await expect(synchronize(options)).rejects.toThrow(/Invalid source schema JSON/);
  expect(await read(`projects/resize-lab/${files[0]}`)).toBe(old[0]);
  expect(await fs.stat(path.join(dataRoot, ".dev-theme-sync")).catch(() => null)).toBeNull();
});
it("parses explicit operations and refuses typo/force flags", () => {
  expect(
    parseArgs(["--project", "resize-lab", "--profile", "arch-image", "--development", "--installed", "--apply"]).apply,
  ).toBe(true);
  for (const args of [
    ["--force"],
    ["--project"],
    ["--project", "a", "--project", "b"],
    ["--rollback", "latest", "--apply"],
  ]) {
    expect(() => parseArgs(args)).toThrow();
  }
});
