# Development theme synchronization

## One command for the acceptance environment

From the repository root, after pulling the Contractor's branch:

```powershell
node scripts/dev-theme-sync.js --development --project resize-lab --profile arch-image --installed --apply
```

This updates only the image schema/template approved in `scripts/dev-theme-profiles/arch-image.json`. It targets the registered project whose **folder** is `resize-lab`, not whichever project happens to be active. It also updates those same two files in the installed Arch root and in any valid installed `latest/` snapshot. No manual file location or copying is necessary. Subsequent new projects copy the updated installed theme through the normal project-creation path.

Save/discard pending editor edits and reload the editor after the command. Vite deliberately ignores `data/` and `themes/` and the editor retains its loaded schema, so file synchronization is not a browser reload. The command never reloads another tab or discards its edits. The Contractor must perform the reload and browser verification before delivering a ready-for-testing build. If the dev servers are not running, start the usual local development environment first.

Omit `--apply` for a read-only preflight. Omit `--installed` to update only the selected project. `--data-root <absolute-local-path>` handles a non-default development data directory; otherwise the command honors `DATA_ROOT` from the environment/.env, falling back to this checkout's `data/`. The source is explicitly the approved theme under this checkout's `themes/`, not a silently selected extra seed root.

## Safety and conflicts

- Requires `--development`, an explicit `--project <folder-or-ID>` and an explicit approved `--profile`. Display names, paths, missing/ambiguous IDs and implicit active-project selection are rejected.
- Requires a local Git checkout; refuses `NODE_ENV=production`, the original `test` folder even if renamed, projects with a configured public site URL and a project/theme mismatch. These are conservative guards, not a substitute for deliberately selecting an unpublished development project. There is no watcher, automatic startup hook or background migration.
- The approved Arch image profile contains exactly `widgets/image/schema.json` and `widgets/image/widget.liquid`. Pages, uploads, menus, globals, other widgets, project/theme metadata and database rows are not written. Source JSON is validated before any write. Junctions, symbolic links and hard-linked files are refused.
- A destination must equal current source, a reviewed Git baseline listed in the profile, or the last successfully managed version. Only BOM/CRLF differences are normalized for matching; exact original bytes are backed up. Unknown customization is a conflict, not permission to overwrite it. There is deliberately no `--force` option.
- All selected project/installed/snapshot files are preflighted before any theme write. One conflicting snapshot blocks the whole operation. The command prints the conflicting path and hashes; the Contractor must review/merge that customization deliberately rather than asking the Director to copy files or bypass the guard.
- A single local lock serializes sync/rollback. The command checks for concurrent changes, writes atomically per file, verifies post-write hashes and restores already-written files on an ordinary write failure. Abrupt machine/process termination can require recovery from the retained receipt/backups; a stale lock is reported rather than silently removed.
- An unchanged rerun is a no-op. No dependency installation or broad theme copying occurs.

## Backups and rollback

Before writing, the command stores original bytes and a manifest under:

`<data-root>/.dev-theme-sync/<project-ID>/<run-ID>/`

The manifest records source revision, absolute source/destination paths, unchanged base theme versions, SHA-256 hashes, previous managed entries and operation status. `verifiedHash` confirms the bytes actually written. The global state file tracks managed content for later Contractor revisions. Backups and state stay in ignored local data, outside project content and Git commits. Keep them if rollback is required.

```powershell
node scripts/dev-theme-sync.js --development --project resize-lab --profile arch-image --rollback latest
```

An explicit run ID may replace `latest`. Rollback restores every changed target recorded by that run, including installed/snapshot files if they changed, without changing unrelated files. It verifies backup integrity and refuses to overwrite a customization or a subsequent sync. If overlapping targets were updated by a later run, roll back that later operation first. Reload the editor afterwards. Base theme version strings remain unchanged; development file identity is the recorded revision plus hashes, not an invented released theme version.

## Verified local diagnosis (26 October 2026)

This Contractor session directly accesses the Windows checkout at `H:\Widgetizer\widgetizer`; it is not an isolated cloud filesystem. The script remains reproducible for a future cloud Contractor: cloud work can implement/test/commit the tool, but must report local installation as pending until this command is actually run on Windows.

The local read-only project database identified:

| Role | Registered project | Folder | ID | Theme version |
| --- | --- | --- | --- | --- |
| Active acceptance project | RESIZE LAB | `resize-lab` | `53f6b4e8-6e6a-4b5d-8554-cf3c7c3940a8` | Arch 0.9.10 |
| Original protected TEST project, since renamed | PIZZA | `test` | `89306180-7666-48e9-a62e-7427e0082964` | Arch 0.9.10 |

The acceptance project contains `pages/test.json`, whose display name is TEST. The original project's `pages/resize-lab.json` is a different page, not the acceptance project. Names alone were misleading.

The acceptance project's two image files matched the first PR prototype (`0542e0f2`) after line-ending normalization: width only, no Height setting and no `data-image-height` template marker. Source and installed image files already matched the later two-axis implementation (`2ea6d235`); there was no valid installed `latest/` snapshot locally. The fresh local browser loaded the newer frontend and runtime but rendered the older project schema/template, reproducing the dotted outline and live Width control with one handle and no Height control.

The server's `/runtime/imageResize.js` and `/runtime/previewRuntime.js` were compared against checkout bytes after newline normalization, not inferred from unit tests. The served Vite dimension-input module also contained the live sizing/Auto-height implementation. After synchronization and reload, the project files matched source bytes and the browser exposed Height/Auto and eight handles.

There was also a real frontend bug, not a synchronization issue: immediate Undo before `PreviewPanel`'s 300 ms render debounce returned the store to its already-rendered baseline, so no backend morph was requested and committed temporary styles could remain. The resize-support relay now includes canonical store dimensions. The runtime reconciles changed canonical dimensions even when no morph occurs, while preserving active drafts when canonical values have not changed. Two focused regressions cover this race.

## Why installed root and latest both matter

`createProject` calls `scaffoldProjectContent`, which calls `ensureThemesDirectory` and `copyThemeToProject`. Seeding skips already installed themes. `getThemeSourceDir` prefers an installed `latest/` directory containing `theme.json`, otherwise installed root. Copying only source files or only the installed root can therefore leave project creation stale.

The narrow `--installed` mode updates the approved files in both existing locations, never creates/rebuilds a broad snapshot and never changes release metadata. An incomplete latest directory without `theme.json` is inactive and left alone. Missing installed/project directories fail with an actionable path instead of being silently scaffolded. A later theme update can rebuild latest; rerun the command after such an update. Newly created projects receive these development files because the effective installed source contains them, not because old project directories were migrated.

This is a local development overlay, not release distribution. Production still uses the normal versioned theme-update packaging/install process. Future changes to other files need a separately reviewed approved profile, not an expansion to whole-directory copying.

## Validation and delivery reporting

```powershell
npm run test:frontend -- scripts/__tests__/dev-theme-sync.test.js packages/core/src/runtime/__tests__/imageResize.test.js packages/core/src/runtime/__tests__/previewRuntimeImageResize.test.js packages/editor-ui/src/lib/__tests__/imageResizeBridge.test.js packages/editor-ui/src/components/pageEditor/__tests__/ImageDimensionInput.test.jsx packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelImageSize.test.jsx packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelPagination.test.jsx packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelLinkPicker.test.jsx packages/editor-ui/src/stores/__tests__/widgetStore.test.js packages/editor-ui/src/stores/__tests__/pageStore.test.js packages/editor-ui/src/stores/__tests__/saveStore.test.js
node --test packages/builder-server/src/tests/imageResize.test.js packages/builder-server/src/tests/rendering.test.js packages/builder-server/src/tests/preview.test.js packages/builder-server/src/tests/pages.test.js packages/builder-server/src/tests/export.test.js packages/builder-server/src/tests/themes.test.js packages/builder-server/src/tests/themeSourceCache.test.js packages/builder-server/src/tests/themeSeedRoots.test.js
npm run build
```

The synchronization suite uses disposable directories/databases. It covers explicit target selection, TEST protection, approved-file scope, exact backups, unknown/post-sync conflicts, repeat revisions, idempotence, rollback, checksum tampering, missing paths, invalid inputs, production/development guards, link rejection and installed/latest compatibility. Existing backend coverage exercises actual project copying from latest snapshots.

Recorded results: **350 frontend/tooling tests passed**, including **31 sync tests**; **378 backend tests passed**, with one existing Windows-specific skip. Production build, focused ESLint and diff checks passed. Vite retains its bundle-size advisory.

The local apply completed with run ID `2026-10-27T05-43-55-423Z-162634a0` (UTC in receipt names). Only the acceptance project's two image files required replacement. Installed root already matched source; no latest snapshot existed. The backup is under `data/.dev-theme-sync/53f6b4e8-6e6a-4b5d-8554-cf3c7c3940a8/2026-10-27T05-43-55-423Z-162634a0/`. A repeat apply returned `unchanged`. Project and theme metadata still report 0.9.10.

An integrity comparison covered all **274 original TEST/PIZZA files** and all **275 non-target RESIZE LAB files**, with identical before/after aggregate content hashes. Browser test edits were undone without saving.

Browser evidence is from a fresh local in-app browser at `http://localhost:3000/page-editor?pageId=test` with RESIZE LAB active, not an inspection of every pre-existing Chrome tab. Verified: Height/Auto appears, eight handles are exposed, a numeric Height edit rendered at 347 px, a native corner gesture changed both dimensions to 58%/370 px during the initial verification, and Height-slider keyboard input rendered at 1 px and was undone. The quick-Undo race was then fixed and rechecked: Auto height and equal image width/height returned in the actual DOM. Post-restart native drag automation did not reliably reach the handle; its locator click did reach the correct pointer handler. A complete post-fix manual pass of all eight drag directions, outside-iframe capture, cancellation and export remains human acceptance work, not a claim based on tests.

Both dev services stopped during the investigation. They were restarted with `npm --ignore-scripts run dev:all` to avoid dependency-rebuild hooks. The final runtime endpoints were rechecked against checkout bytes with temporary diagnostics removed. Normal save/discard and reload remains necessary for other already-open editor tabs.

Every future implementation report must separate:

1. **Source completed:** branch/commit, exact changed files and automated test results.
2. **Available on GitHub:** pushed head and PR; do not equate local commits with a successful push.
3. **Installed locally:** exact project ID/folder, sync run ID, verified file hashes, backup location and whether installed/latest files changed. If execution was cloud-only, say not installed and provide the command.
4. **Browser verified:** browser/URL, reload, observed controls, actual interactions and unresolved checks. Passing tests or successful copying alone must never be described as locally working.

For acceptance, check all eight visible handles, Width and Height controls, real resizing, immediate Undo/Redo, Auto height, cancellation and export parity. Test edits should be undone without saving unless content changes are explicitly wanted. Do not refresh another tab containing pending edits. Keep PR #1 draft and unmerged until human acceptance.
