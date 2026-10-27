import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const contentDigest = (bytes) =>
  digest(
    bytes
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n"),
  );
const segment = (value) => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const exists = async (file) =>
  fs.lstat(file).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );

// Reject junctions/symlinks all the way down, not only at the final filename.
async function safePath(base, relative, allowMissing = false) {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.split(/[\\/]/).some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Invalid relative path: ${relative}`);
  }
  const absolute = path.resolve(base, relative);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    if (!(await exists(current))) {
      if (allowMissing) continue;
      throw new Error(`Missing path: ${current}`);
    }
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlink/junction: ${current}`);
    if (stat.isFile() && stat.nlink > 1) throw new Error(`Refusing hard-linked file: ${current}`);
  }
  return absolute;
}

export async function selectProject(dataRoot, target) {
  if (!segment(target))
    throw new Error("An explicit project folder or ID is required; paths and display names are not accepted.");
  const database = await safePath(dataRoot, "widgetizer.db");
  const db = new Database(database, { readonly: true, fileMustExist: true });
  try {
    const matches = db
      .prepare(
        `SELECT id, name, folder_name AS folderName, theme, theme_version AS themeVersion,
      site_url AS siteUrl FROM projects WHERE id = ? OR folder_name = ?`,
      )
      .all(target, target);
    if (matches.length !== 1) throw new Error(`Project target must identify exactly one registered project: ${target}`);
    return matches[0];
  } finally {
    db.close();
  }
}

async function readState(dataRoot) {
  const file = await safePath(dataRoot, ".dev-theme-sync/state.json", true);
  const state = (await exists(file)) ? await json(file) : { format: 1, targets: {}, projects: {} };
  if (state.format !== 1 || !state.targets || !state.projects)
    throw new Error("Invalid development sync state; refusing to replace it.");
  return state;
}

function validateProfile(profile) {
  if (
    !segment(profile.theme) ||
    !Array.isArray(profile.files) ||
    !profile.files.length ||
    new Set(profile.files).size !== profile.files.length
  )
    throw new Error("Invalid approved-file profile.");
  for (const file of profile.files) {
    if (!/^widgets\/[a-zA-Z0-9_-]+\/(schema\.json|widget\.liquid)$/.test(file)) {
      throw new Error(`Profile file is outside the approved widget schema/template scope: ${file}`);
    }
    if (!Array.isArray(profile.trustedBaselines?.[file])) throw new Error(`Missing trusted baseline for ${file}`);
  }
}

async function context(options) {
  const { root, dataRoot, project, profile, development, environment = process.env.NODE_ENV } = options;
  if (!development || environment === "production")
    throw new Error("Development sync requires --development and refuses NODE_ENV=production.");
  if (!(await exists(path.join(root, ".git"))))
    throw new Error("Development sync requires a local Git checkout; packaged applications are not supported.");
  validateProfile(profile);
  if (!project || !segment(project.id) || !segment(project.folderName)) throw new Error("Invalid project identity.");
  if (project.folderName.toLowerCase() === "test")
    throw new Error("The original TEST project (folder test) is protected.");
  if (project.siteUrl?.trim())
    throw new Error(
      "Refusing a project with a configured public site URL. Use a dedicated unpublished development project.",
    );
  if (project.theme !== profile.theme)
    throw new Error(`Theme mismatch: project=${project.theme}, profile=${profile.theme}`);
  const projectThemeFile = await safePath(dataRoot, `projects/${project.folderName}/theme.json`);
  const projectTheme = await json(projectThemeFile);
  const targets = [{ key: "project", relative: `projects/${project.folderName}`, version: projectTheme.version }];
  if (options.installed) {
    const installedTheme = await json(await safePath(dataRoot, `themes/${profile.theme}/theme.json`));
    targets.push({ key: "installed", relative: `themes/${profile.theme}`, version: installedTheme.version });
    const latestThemeFile = await safePath(dataRoot, `themes/${profile.theme}/latest/theme.json`, true);
    if (await exists(latestThemeFile)) {
      const latestTheme = await json(latestThemeFile);
      targets.push({ key: "latest", relative: `themes/${profile.theme}/latest`, version: latestTheme.version });
    }
  }
  return { ...options, targets };
}

export async function planSync(options) {
  const ctx = await context(options);
  const state = await readState(ctx.dataRoot);
  const files = [];
  const conflicts = [];
  for (const file of ctx.profile.files) {
    const source = await safePath(ctx.root, `themes/${ctx.profile.theme}/${file}`);
    const sourceBytes = await fs.readFile(source);
    if (file.endsWith("schema.json")) {
      let schema;
      try {
        schema = JSON.parse(sourceBytes.toString("utf8").replace(/^\uFEFF/, ""));
      } catch {
        throw new Error(`Invalid source schema JSON: ${source}`);
      }
      if (schema?.type !== file.split("/")[1] || !Array.isArray(schema.settings)) {
        throw new Error(`Invalid source widget schema: ${source}`);
      }
    }
    for (const target of ctx.targets) {
      const relative = `${target.relative}/${file}`;
      const destination = await safePath(ctx.dataRoot, relative);
      const before = await fs.readFile(destination);
      const sourceHash = contentDigest(sourceBytes);
      const beforeHash = contentDigest(before);
      const previous = state.targets[relative];
      const trusted = ctx.profile.trustedBaselines[file].some((baseline) => baseline.sha256 === beforeHash);
      const unchanged = sourceHash === beforeHash;
      if (!unchanged && !trusted && previous?.contentHash !== beforeHash) {
        conflicts.push({
          destination,
          file,
          actualHash: digest(before),
          contentHash: beforeHash,
          reason:
            "Destination differs from source, reviewed Git baselines and the last managed version. No force overwrite is available.",
        });
      }
      files.push({
        file,
        target: target.key,
        relative,
        source,
        destination,
        baseThemeVersion: target.version,
        sourceHash: digest(sourceBytes),
        sourceContentHash: sourceHash,
        beforeHash: digest(before),
        beforeContentHash: beforeHash,
        changed: !unchanged,
        previous: previous || null,
      });
    }
  }
  const effective =
    ctx.targets.find((target) => target.key === "latest") || ctx.targets.find((target) => target.key === "installed");
  return {
    project: ctx.project,
    effectiveInstalledSource: effective ? path.join(ctx.dataRoot, effective.relative) : undefined,
    profileTheme: ctx.profile.theme,
    revision: options.revision || "unknown",
    files,
    conflicts,
    state,
  };
}

async function atomicWrite(file, bytes) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, bytes, { flag: "wx" });
    await fs.rename(temporary, file);
  } finally {
    await fs.unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
const encode = (value) => JSON.stringify(value, null, 2) + "\n";

async function withLock(dataRoot, action) {
  const home = await safePath(dataRoot, ".dev-theme-sync", true);
  await fs.mkdir(home, { recursive: true });
  const lock = path.join(home, "sync.lock");
  let handle;
  try {
    handle = await fs.open(lock, "wx");
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        `Another development sync is running, or a prior process left ${lock}. Inspect it before recovery.`,
      );
    throw error;
  }
  try {
    await handle.writeFile(encode({ pid: process.pid, at: new Date().toISOString() }));
    return await action();
  } finally {
    await handle.close();
    await fs.unlink(lock);
  }
}

function conflictError(conflicts) {
  const error = new Error(`Theme conflicts; no theme files were changed:\n${encode(conflicts)}`);
  error.conflicts = conflicts;
  return error;
}

export async function synchronize(options) {
  const initial = await planSync(options);
  if (initial.conflicts.length) throw conflictError(initial.conflicts);
  if (!options.apply) return { mode: "plan", ...initial, state: undefined };
  return withLock(options.dataRoot, async () => {
    const plan = await planSync(options);
    if (plan.conflicts.length) throw conflictError(plan.conflicts);
    const changed = plan.files.filter((file) => file.changed);
    if (!changed.length) return { mode: "unchanged", ...plan, state: undefined };
    const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const runRelative = `.dev-theme-sync/${plan.project.id}/${runId}`;
    const runDir = await safePath(options.dataRoot, runRelative, true);
    await fs.mkdir(runDir, { recursive: true });
    const manifest = {
      format: 1,
      runId,
      status: "prepared",
      project: plan.project,
      profileTheme: plan.profileTheme,
      revision: options.revision || "unknown",
      createdAt: new Date().toISOString(),
      previousProjectRun: plan.state.projects[plan.project.id] || null,
      files: changed,
    };
    for (const file of changed) {
      const backup = path.join(runDir, "before", file.target, file.file);
      await fs.mkdir(path.dirname(backup), { recursive: true });
      const bytes = await fs.readFile(file.destination);
      if (digest(bytes) !== file.beforeHash)
        throw new Error(`Destination changed during preflight: ${file.destination}`);
      await fs.writeFile(backup, bytes, { flag: "wx" });
    }
    const manifestFile = path.join(runDir, "manifest.json");
    await fs.writeFile(manifestFile, encode(manifest), { flag: "wx" });
    const written = [];
    try {
      for (const file of changed) {
        await safePath(options.dataRoot, file.relative);
        const bytes = await fs.readFile(file.source);
        if (digest(bytes) !== file.sourceHash || digest(await fs.readFile(file.destination)) !== file.beforeHash) {
          throw new Error(`Source/destination changed during sync: ${file.destination}`);
        }
        await atomicWrite(file.destination, bytes);
        written.push(file);
        file.verifiedHash = digest(await fs.readFile(file.destination));
        if (file.verifiedHash !== file.sourceHash) throw new Error(`Post-write checksum mismatch: ${file.destination}`);
      }
      const nextState = structuredClone(plan.state);
      for (const file of changed)
        nextState.targets[file.relative] = {
          runId,
          hash: file.sourceHash,
          contentHash: file.sourceContentHash,
          revision: manifest.revision,
        };
      nextState.projects[plan.project.id] = runId;
      manifest.status = "applied";
      await atomicWrite(manifestFile, encode(manifest));
      await atomicWrite(path.join(options.dataRoot, ".dev-theme-sync/state.json"), encode(nextState));
    } catch (error) {
      const recoveryConflicts = [];
      for (const file of written.reverse()) {
        if (digest(await fs.readFile(file.destination)) !== file.sourceHash) {
          recoveryConflicts.push(file.destination);
          continue;
        }
        await atomicWrite(file.destination, await fs.readFile(path.join(runDir, "before", file.target, file.file)));
      }
      manifest.status = "failed";
      manifest.recoveryConflicts = recoveryConflicts;
      await atomicWrite(manifestFile, encode(manifest));
      throw new Error(
        `${error.message}. Originals retained in ${runDir}${recoveryConflicts.length ? `; concurrent edits prevented restoration: ${recoveryConflicts.join(", ")}` : "; written theme files restored"}`,
      );
    }
    return { mode: "applied", runId, backup: runDir, revision: manifest.revision, ...plan, state: undefined };
  });
}

export async function rollback(options) {
  await context({ ...options, installed: false });
  return withLock(options.dataRoot, async () => {
    const state = await readState(options.dataRoot);
    const runId = options.rollback === "latest" ? state.projects[options.project.id] : options.rollback;
    if (typeof runId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(runId))
      throw new Error("No valid rollback run; supply a run ID or latest.");
    const runRelative = `.dev-theme-sync/${options.project.id}/${runId}`;
    const manifestFile = await safePath(options.dataRoot, `${runRelative}/manifest.json`);
    const manifest = await json(manifestFile);
    if (
      manifest.format !== 1 ||
      manifest.status !== "applied" ||
      manifest.project?.id !== options.project.id ||
      manifest.project.folderName !== options.project.folderName ||
      manifest.profileTheme !== options.profile.theme ||
      !Array.isArray(manifest.files) ||
      !manifest.files.length
    )
      throw new Error("Invalid or already rolled-back manifest.");
    const conflicts = [];
    const restores = [];
    const destinations = new Set();
    for (const file of manifest.files) {
      if (!options.profile.files.includes(file.file) || !["project", "installed", "latest"].includes(file.target)) {
        throw new Error("Rollback manifest contains an unapproved file/target.");
      }
      const base =
        file.target === "project"
          ? `projects/${options.project.folderName}`
          : `themes/${options.profile.theme}${file.target === "latest" ? "/latest" : ""}`;
      const relative = `${base}/${file.file}`;
      if (destinations.has(relative)) throw new Error("Duplicate rollback target.");
      destinations.add(relative);
      const destination = await safePath(options.dataRoot, relative);
      const backupFile = await safePath(options.dataRoot, `${runRelative}/before/${file.target}/${file.file}`);
      const before = await fs.readFile(backupFile);
      if (digest(before) !== file.beforeHash) throw new Error(`Backup checksum mismatch: ${backupFile}`);
      if (state.targets[relative]?.runId !== runId || digest(await fs.readFile(destination)) !== file.sourceHash) {
        conflicts.push({
          destination,
          reason: "Changed since sync (or superseded by a later sync); rollback will not overwrite it.",
        });
      }
      restores.push({ relative, destination, before, previous: file.previous });
    }
    if (conflicts.length) throw conflictError(conflicts);
    const restored = [];
    try {
      for (const restore of restores) {
        await safePath(options.dataRoot, restore.relative);
        const after = await fs.readFile(restore.destination);
        const expected = manifest.files.find((file) => file.relative === restore.relative)?.sourceHash;
        if (digest(after) !== expected) throw new Error(`Destination changed during rollback: ${restore.destination}`);
        await atomicWrite(restore.destination, restore.before);
        restored.push({ ...restore, after });
      }
    } catch (error) {
      for (const restore of restored.reverse()) {
        await safePath(options.dataRoot, restore.relative);
        if (digest(await fs.readFile(restore.destination)) === digest(restore.before)) {
          await atomicWrite(restore.destination, restore.after);
        }
      }
      throw new Error(`Rollback stopped: ${error.message}. Backups remain at ${path.dirname(manifestFile)}`);
    }
    for (const restore of restores) {
      if (restore.previous) state.targets[restore.relative] = restore.previous;
      else delete state.targets[restore.relative];
    }
    if (manifest.previousProjectRun) state.projects[options.project.id] = manifest.previousProjectRun;
    else delete state.projects[options.project.id];
    manifest.status = "rolled-back";
    await atomicWrite(manifestFile, encode(manifest));
    await atomicWrite(path.join(options.dataRoot, ".dev-theme-sync/state.json"), encode(state));
    return {
      mode: "rolled-back",
      runId,
      project: options.project,
      files: restores.map(({ relative, destination, before }) => ({
        relative,
        destination,
        restoredHash: digest(before),
      })),
    };
  });
}

export function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (["--development", "--installed", "--apply", "--help"].includes(flag)) {
      const key = flag.slice(2);
      if (result[key]) throw new Error(`Duplicate flag: ${flag}`);
      result[key] = true;
    } else if (["--project", "--profile", "--data-root", "--rollback"].includes(flag)) {
      const key = flag.slice(2);
      if (result[key] !== undefined || !args[i + 1] || args[i + 1].startsWith("--"))
        throw new Error(`Missing/duplicate argument: ${flag}`);
      result[key] = args[++i];
    } else throw new Error(`Unknown argument: ${flag}`);
  }
  if (result.rollback && (result.apply || result.installed))
    throw new Error("Rollback cannot be combined with --apply or --installed.");
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Development only: node scripts/dev-theme-sync.js --development --project <folder-or-id> --profile arch-image [--installed] [--apply]\nOmit --apply for a read-only plan. Roll back: same project/profile with --rollback latest (or a run ID).\nOnly profile-approved schema/templates are written; unknown customizations are conflicts, never forced.",
    );
    return;
  }
  if (!segment(args.profile)) throw new Error("An explicit approved --profile is required (arch-image).");
  const dataRoot = path.resolve(args["data-root"] || process.env.DATA_ROOT || path.join(ROOT, "data"));
  const profile = await json(await safePath(ROOT, `scripts/dev-theme-profiles/${args.profile}.json`));
  const project = await selectProject(dataRoot, args.project);
  let revision = "unknown";
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    /* reported as unknown */
  }
  const options = {
    root: ROOT,
    dataRoot,
    profile,
    project,
    revision,
    development: args.development,
    installed: args.installed,
    apply: args.apply,
    rollback: args.rollback,
  };
  const result = args.rollback ? await rollback(options) : await synchronize(options);
  console.log(encode(result));
  console.log(
    "Theme metadata versions are unchanged; SHA-256 values above identify the development files. Reload the editor after saving/discarding pending edits to refresh its schemas and iframe. Browser functionality is not verified by this command.",
  );
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
