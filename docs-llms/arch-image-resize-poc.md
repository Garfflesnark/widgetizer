# Arch image resizing experiment (PR #1)

Development delivery update: use the [targeted automated synchronization command](dev-theme-sync.md), not the historical manual-copy procedure below. That guide records the authorized RESIZE LAB installation, browser verification and quick-Undo reconciliation fix. Original implementation test counts below are historical; current results are in the sync guide.

Experimental, requires human review. No freeform positioning, layers, dependency additions or global/project migrations.

## Root causes verified in source

1. `previewRuntime.renderOverlay` used the selected section's `getBoundingClientRect()`. The section remains full width in document flow while `.image-resize-target` narrows inside it, so the original selection outline never followed the image. The revised selection uses the actual image rectangle only for supported images; section bounds still anchor widget controls. Other widget selection behavior is unchanged.
2. `RangeInput` retains a local slider value and calls the settings callback on completion. `PreviewPanel` then waits 300 ms before asking the server to render changed widgets. Removing the debounce globally would cause network renders and history mutations during movement. The image-specific input instead sends transient DOM-only preview messages during slider or numeric edits and commits once at release, Enter or blur. The shared RangeInput and global render debounce are unchanged.
3. `fullwidth` controls the outer section/container, while `image_width_percent` controls the inner image wrapper. The controls were independent, so a previously narrowed image stayed narrow inside the newly expanded outer container.
4. The original Arch image schema already defaults `fullwidth` to false. That default is unchanged. Presets or saved pages can explicitly set it true and retain their value on load.
5. New-project creation does not copy directly from source `themes/arch`. See the distribution path below. The local installed `data/themes/arch/widgets/image/schema.json` was inspected read-only and lacked the width setting; there was no installed `latest/` image schema at the inspected default path. That explains why new projects still had the original image widget.

## Revised behavior and persisted data

- `image_width_percent`: integer 10–100, default 100; percentage of the available content container.
- `image_height_px`: integer 0–2000, default 0. Zero means Auto/natural proportions. Positive values set explicit image height in pixels and stretch with `object-fit: fill`; they do not crop.
- Four corner and four side handles are shown when both the loaded schema and template support height. East/west affect width; north/south affect height; corners affect both. Width-only schemas/templates from the original experiment retain width-only support until explicitly updated.
- The dashed image outline has the same pink color as the handles and excludes captions. The widget label and reorder buttons stay anchored above the section. Neither overlay nor handles affect document layout.
- The image stays horizontally centered and vertically anchored at the normal-flow top. West/east adjust centered width; north/south adjust height without moving the section. Thus dragging the north edge changes height while its top remains anchored, rather than repositioning the widget.
- Height defaults to Auto. Explicit height intentionally allows distorted proportions, as requested for independent stretching. Auto restores proportional sizing. Linked and unlinked images fill the selected width; captions remain in the flow below the image.
- Turning Full Width from off to on resets Width to 100% atomically, leaves Height unchanged and makes one undo step. Both sliders remain available afterwards. Turning it off changes only the outer container. Merely loading an old `fullwidth: true` plus a narrower width does not reset anything; the transition must be a user edit. The sidebar explains this rule.
- Mouse and sidebar previews change only transient iframe styles. Completed dimension edits use the existing widget/page/save stores, dirty tracking and Zundo history. A corner commits both settings in one step. No-op edits do not create history entries; rapid separate gestures remain separate undo steps.
- Escape, pointer cancellation, lost capture, window focus loss, selection changes, input unmount and widget replacement restore drafts. The sidebar rejects a late slider-release callback after cancellation. The numeric input previews live and commits the exact bounded integer on Enter/blur.
- Parent/iframe communication validates source, exact origin, current widget/block selection, schema support, starting values and bounds. Live sidebar messages use the same trusted iframe route. No backend render is requested while either slider or a mouse handle is moving. After commit, temporary styling remains until normal server-rendered markup replaces it.

## Project creation and correct distribution

The verified path is:

`projectController.createProject` → `scaffoldProjectContent` (`utils/projectScaffold.js`) → `ensureThemesDirectory` → `copyThemeToProject` → `readThemeSourceMetadata` / `getThemeSourceDir` (`controllers/themeController.js`).

`config.js` distinguishes shipped seed roots (`THEMES_ROOT`, optional higher-priority `THEMES_EXTRA_ROOTS`, otherwise repo `themes/`) from installed themes (`DATA_ROOT/themes`, otherwise `data/themes/`). `ensureThemesDirectory` copies a seed theme only if that installed theme directory is absent. It deliberately does not replace installed themes on every startup. `getThemeSourceDir` prefers installed `<theme>/latest/` when it contains `theme.json`, otherwise installed theme root. Its results are cached. Project creation copies that effective installed source, excluding updates/latest/presets directories, then separately initializes page/menu content from the chosen preset.

Consequently, editing `themes/arch/widgets/image/` does not refresh an already installed Arch theme, and a restart alone cannot repair stale installed files. An existing valid latest snapshot also takes precedence over root-file edits. Higher-priority extra seed roots can shadow the bundled Arch theme wholesale.

For an authorized development refresh, stop the server, resolve the actual installed/effective source, back up and compare its image schema/template, and copy or merge only the two revised source files into that effective installed `widgets/image/` directory. Restart the server to clear cached source metadata. A new disposable project should then receive the files. If a latest snapshot exists, updating only the installed root is insufficient. This is an explicit opt-in development operation; no installed theme has been refreshed by this task.

`npm run theme:sync -- --theme arch` copies the source theme into the installed root, but is a broader authoring tool, can replace unrelated theme files, and does not by itself guarantee that an existing latest snapshot receives current root edits. `--project` additionally writes project theme files. Neither command is automatically run here.

For distribution to users, prepare a new versioned Arch theme update containing the schema/template changes through the existing `theme:update-delta` packaging flow (after choosing the release/base versions). The theme install/update path calls `buildLatestSnapshot`, layering the versioned updates on installed base files and invalidating the theme source cache. New projects then copy the updated latest snapshot. Existing projects require their separate explicit theme update/opt-in. This experiment does not bump theme/app versions, retrofit an already released delta or force updates on users.

An isolated regression test demonstrates that changing an already seeded source does not refresh installed project copies, then creates a real versioned delta and builds latest, proving that subsequent project copies receive the update while prior copies remain unchanged.

## Existing-project opt-in and compatibility

The initial image implementation did not migrate user projects. The subsequent authorized development sync updated only RESIZE LAB's approved image schema/template; TEST/PIZZA and unrelated project content remain unchanged. No automatic migration occurs. Saved full-width flags and percentages remain intact on load. Missing width means 100%; missing height means Auto. The Full Width default remains false. Old installed/project files continue rendering as before.

To opt an explicitly chosen project in after review:

1. Save pending edits and close the editor. Confirm the project's actual folder under `data/projects/`.
2. Back up that project's `widgets/image/schema.json` and `widgets/image/widget.liquid` separately. Compare with `themes/arch/widgets/image/` on this branch; merge customized files instead of overwriting them blindly.
3. Copy/merge only those two revised files. Do not copy pages, menus, uploads, global widgets, other widgets or theme settings. Updating only the schema gives incomplete export support; updating only the template does not enable the new sidebar/handle capability.
4. Restart the backend and reload the editor. Old pages need no JSON rewrite. The new height control starts at Auto. Confirm ordinary images remain container-constrained unless their saved/preset Full Width setting is explicitly true.
5. To roll back, close the editor, restore only the two backups, restart and reload. Unused settings may remain in page JSON; older templates ignore height. Full Width resets made by the user are real saved width changes, so undo them before saving if they should not persist.

Updated templates ensure linked images also fill the wrapper. Small linked images that previously rendered at intrinsic width can therefore appear larger after this explicit template opt-in. Check those cases during manual acceptance. Positive pixel height remains fixed across viewport sizes; use Auto for proportional responsive images. Image `sizes` hints remain conservative and can download larger variants than necessary when narrowed.

## Required manual acceptance

Use a fresh Arch project from an explicitly refreshed installed source, or opt an experimental project in with the two-file procedure above. Verify both schema and template actually reached the project.

1. Select a linked/unlinked image, placeholder and image with caption. Check the pink dashed outline follows actual image bounds and excludes the caption. All eight handles should be visible and label/reorder controls should still work. Unrelated widgets and globals must retain their existing outlines and have no image handles.
2. Drag every side and corner. Check continuous width/height feedback and correct axis changes. Horizontal resizing stays centered; vertical resizing keeps the section's normal-flow top. Confirm following content moves naturally, the image stretches rather than crops, and no overlapping layers or saved positions appear.
3. Check width 10/100% and height 1/2000 px boundaries. Escape, focus loss, pointer cancellation, selecting another widget and leaving the editor during a gesture should leave no saved change. Check pointer capture when releasing outside the iframe.
4. Drag Width and Height sliders continuously. Check the image and dashed outline track immediately, the numeric field agrees, and browser network tools show no preview request during movement. Release: one Undo reverts the whole gesture, Redo restores it. Repeat rapid gestures and corner drags to confirm separate undo steps.
5. Type exact numeric dimensions and commit with Enter or blur. Cancel a draft with Escape. Select another widget and return; ensure no abandoned styling survives. Resize with a mouse handle and confirm the sidebar values synchronize.
6. Set a narrow width and fixed height, then enable Full Width. Width must become 100%, Height must remain unchanged and one Undo must restore the prior values. Resize again while Full Width stays on, then toggle it off: the percentage should remain. Test an already-saved Full Width+narrow combination on reload; it must not reset itself.
7. Use Height Auto to restore proportions. Save, refresh, export and compare the actual image width/height with preview. Export must contain no editor outline or handles. Check desktop, tablet, mobile and narrow exported browser windows; explicitly fixed heights can distort the image and should remain fixed.
8. Create a second fresh disposable Arch project after an authorized installed-source refresh. Verify it receives both settings without manually copying into its project directory. Confirm the original TEST and prior projects remain untouched.

## Automated commands and results

```powershell
npm run test:frontend -- packages/core/src/runtime/__tests__/imageResize.test.js packages/core/src/runtime/__tests__/previewRuntimeImageResize.test.js packages/editor-ui/src/lib/__tests__/imageResizeBridge.test.js packages/editor-ui/src/components/pageEditor/__tests__/ImageDimensionInput.test.jsx packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelImageSize.test.jsx packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelPagination.test.jsx packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelLinkPicker.test.jsx packages/editor-ui/src/stores/__tests__/widgetStore.test.js packages/editor-ui/src/stores/__tests__/pageStore.test.js packages/editor-ui/src/stores/__tests__/saveStore.test.js
node --test packages/builder-server/src/tests/imageResize.test.js packages/builder-server/src/tests/rendering.test.js packages/builder-server/src/tests/preview.test.js packages/builder-server/src/tests/pages.test.js packages/builder-server/src/tests/export.test.js packages/builder-server/src/tests/themes.test.js packages/builder-server/src/tests/themeSourceCache.test.js packages/builder-server/src/tests/themeSeedRoots.test.js
npm run build
node scripts/validate-theme.js themes/arch
node scripts/validate-theme-locales.js arch
git diff --check
```

The focused frontend run passed 317 tests in ten files. The backend run passed 378 tests, with one existing POSIX-permissions test skipped on Windows (379 total). Production build passed with Vite's bundle-size advisory. Focused ESLint and diff checks passed. Locale validation passed; theme validation reported zero errors and the existing screenshot-size warning. Component/DOM tests do not substitute for native browser pointer-capture and visual acceptance. No new browser manual acceptance run has been performed for these revisions.

## Exact files changed by the acceptance revisions

- `packages/core/src/runtime/imageResize.js`: bounded height, eight handle directions, actual-image selection bounds, shared transient previews/cancellation and width-only fallback.
- `packages/core/src/runtime/previewRuntime.js`: image-only dashed outline, section-anchored controls and trusted live-preview messages.
- `packages/editor-ui/src/components/pageEditor/SelectionOverlay.jsx`: width/height capability and transient preview relay.
- `packages/editor-ui/src/components/pageEditor/SettingsPanel.jsx`: scoped dimension controls and Full Width explanation.
- `packages/editor-ui/src/components/pageEditor/ImageDimensionInput.jsx`: new image-only live slider/numeric control with single commits and cancellation.
- `packages/editor-ui/src/lib/imageResizeBridge.js`: validates and commits both axes atomically; validates/routes sidebar previews.
- `packages/editor-ui/src/stores/widgetStore.js`: height validation, no-op filtering, gesture undo boundaries and atomic Full Width reset.
- `themes/arch/widgets/image/schema.json`: optional Height setting; Full Width default remains false.
- `themes/arch/widgets/image/widget.liquid`: bounded height shared by preview/export; Auto or explicit stretch; linked images fill width.
- `packages/core/src/runtime/__tests__/imageResize.test.js`
- `packages/core/src/runtime/__tests__/previewRuntimeImageResize.test.js`
- `packages/editor-ui/src/lib/__tests__/imageResizeBridge.test.js`
- `packages/editor-ui/src/components/pageEditor/__tests__/ImageDimensionInput.test.jsx` (new)
- `packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelImageSize.test.jsx` (new)
- `packages/builder-server/src/tests/imageResize.test.js`
- `docs-llms/arch-image-resize-poc.md`

The root `package.json` retains its pre-existing local `allowScripts` modification and is excluded from this implementation commit.
