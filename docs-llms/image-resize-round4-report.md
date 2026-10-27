# Image resizing: acceptance round 4

The Creative Director approved [version 2](image-sizing-round4-proposal.md) on October 27, 2026. This revision preserves legacy/version 1 rendering and the accepted opposite-anchor geometry. It introduces no automatic migration or freeform positioning.

## Root causes and implemented behaviour

- **Default Scale:** the previous control was an action button, with no state indicator. It now uses Widgetizer's existing pink/gray `CheckboxInput` switch. Checked state is computed from rendered dimensions against the fitted intrinsic reference, not click history. Exact px or percentage values matching that size also show checked. Editing dimensions changes the state; clicking restores internal Auto/Auto and proportions in one undo step. Alignment is preserved. The switch cannot invent an off state while dimensions are still default.
- **Alignment and tag:** the section controls and visible image have distinct rectangles. Reorder controls retain their section anchor; the Image menu trigger has its own bar 30px above the actual image edge. It follows live top-edge movement, clear of the handles. Clicking it opens Left/Center/Right actions with outside-click and Escape dismissal. Alignment is persisted independently in version 2 and used by both runtime and exported CSS.
- **Units:** version 1 percentages cannot store exact independent px values. The approved opt-in version 2 stores `%`/`px` independently for each axis, with nullable values retaining internal Auto. Visible Auto buttons become native unit selectors. Untouched legacy/version 1 settings keep their original fields and meanings. First explicit new editing/alignment actions create version 2; Undo restores the exact previous object. The explicit Default Scale action restores the default %/% modes with internal Auto/Auto; ordinary pixel edits and handle drags retain px mode.
- **Conversion:** unit switching converts the chosen axis's visible size at the current viewport. Pixels round to whole CSS pixels; percentages round to two decimals. Typed px values are bounded whole pixels (1–10000); percentages remain 1–400. Switching preserves the other axis's stored unit/value. A conversion outside bounds is rejected with an explanation. A narrow container constrains visible width without rewriting the requested px value. Internal Auto remains available through Default Scale.
- **Anchoring:** the existing geometry helper remains independent of images, units and alignment. The v2 image adapter preserves axis units during handle drags and translates geometric bounds into dimension values plus bounded flow spacing. Alignment supplies the base horizontal position; signed inline residual spacing preserves opposite-edge anchoring. Explicit alignment clears that residual. Default Scale clears resizing insets while keeping alignment.
- **Sliders:** rc-slider listens for parent-document mouse release, which can be missed over an iframe. Image controls now own pointer capture and parent release handling, use a temporary transparent interaction shield above the iframe during a drag, cancel safely on lost capture/cancellation/blur, and reject late library callbacks after completion/cancellation. The shield is transient editor interaction UI, not persisted widget layering. Live movement stays in DOM styles; completion commits once. Keyboard slider editing remains available after cancellation.

## Four delivery states

1. **Source:** implemented on `experiment/arch-image-resize`; draft PR #1 targets `feature/freeform-canvas`.
2. **GitHub:** the Round 4 commit updates the existing draft PR. No merge is authorized.
3. **Local installation:** Windows access is available. The established image-only sync updated source → installed Arch and RESIZE LAB, with no conflicts. No valid local `latest/` snapshot exists; the script handles valid snapshots when present. Theme metadata remains 0.9.10. Backup receipt: `data/.dev-theme-sync/53f6b4e8-6e6a-4b5d-8554-cf3c7c3940a8/2026-10-27T09-50-21-970Z-90f74cb5/`. The profile now also recognizes the verified Round 3 Git baseline, so an installation without local sync history can upgrade safely.
4. **Actual browser:** verified all four unit combinations, exact 317px × 243px save/reload, Left/Center/Right positions, Default Scale preserving Right alignment, the computed toggle, all eight native handle drags with opposite edges anchored, image-tag movement (~20px for a 20px top drag), and both slider releases over the iframe. Each slider stayed disengaged on the next click and one Undo restored its prior value. Mobile presentation was checked after layout settled. The live application is the interactive preview; it is not a mockup.

The Creative Director explicitly allowed discarding current acceptance state and performing browser checks while playing with the app. RESIZE LAB page settings were intentionally saved to verify persistence. A pre-check page backup is at `data/.acceptance-backups/round4-20261027-025639/test.json`. Live values can subsequently change as the Creative Director tests. The protected original `data/projects/test` is untouched; its 274-file tree hash remains `f7a111301a95aac8bb5124140949f505a8090dbf2a16e3bd25f93813c66dfde7`.

## Validation

```powershell
npx vitest run packages/core/src/runtime/__tests__ packages/editor-ui/src/lib/__tests__/imageResizeBridge.test.js packages/editor-ui/src/components/pageEditor/__tests__/ImageDimensionInput.test.jsx packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelImageSize.test.jsx packages/editor-ui/src/components/pageEditor/__tests__/EditorTopBar.test.jsx scripts/__tests__/dev-theme-sync.test.js
node --test packages/builder-server/src/tests/imageResize.test.js
npm --ignore-scripts run build
```

Focused Vitest: **222 passed**. Backend real storage/render/export tests: **10 passed**, including every mixed-unit combination, exact pixel persistence, v2 metadata round trips, legacy/v1 rendering and preview/export CSS parity. ESLint and build passed; Vite retains its large-bundle advisory. The full bounded-worker suite has **1,983 tests**, with five failures in unchanged Windows filesystem tests: four symlink `EPERM` cases in `safePath.test.js` and one concurrent rename `EPERM` case in `atomic.test.js`. All other tests passed.

## Export and preview limits

A local export of RESIZE LAB was attempted through the real export endpoint with its explicit project ID. It failed with **“No homepage found”**: the project lacks a page with slug `index`. No page was renamed or created to bypass that validation. Static export parity is verified in isolated real-storage tests; a complete local export remains a manual check after an authorized homepage setup. Modern CSS container units are required for new-model output. Missing intrinsic metadata retains the shared 1600×900 fallback. The Arch adapter assumes normal left-to-right flow. Older builds cannot fully interpret v2; restoring an older theme/runtime requires restoring compatible experimental content as well.

## Manual acceptance and next revisions

Use the open in-app browser at `http://localhost:3000/page-editor?pageId=test` with RESIZE LAB active. It is the working local app. Click the Image tag for alignment; use each unit selector independently; enter exact px values; drag handles and sliders, including release over the iframe; try Undo/Redo and Default Scale. Save and refresh to check chosen values. Desktop/mobile buttons exercise responsive layout. Export requires a valid homepage first. Test additional linked/captioned, very small/large and metadata-free images across browsers before accepting the experiment.

For subsequent source revisions, use the same one-command installation workflow, then reload after pending edits are handled:

```powershell
node scripts/dev-theme-sync.js --development --project resize-lab --profile arch-image --installed --apply
```

Rollback the latest theme installation with `--rollback latest` in place of `--installed --apply`; this rolls back managed theme files, not independently edited page content. Do not target the protected original project. Keep PR #1 draft and unmerged until human acceptance.

## Exact Round 4 files

```text
docs-llms/dev-theme-sync.md
docs-llms/image-sizing-round4-proposal.md
docs-llms/image-resize-round4-report.md
packages/core/src/runtime/imageTransform.js
packages/core/src/runtime/imageResize.js
packages/core/src/runtime/previewRuntime.js
packages/core/src/runtime/__tests__/imageUnits.test.js
packages/core/src/runtime/__tests__/imageResize.test.js
packages/core/src/runtime/__tests__/previewRuntimeImageResize.test.js
packages/editor-ui/src/components/pageEditor/ImageDimensionInput.jsx
packages/editor-ui/src/components/pageEditor/SettingsPanel.jsx
packages/editor-ui/src/components/pageEditor/SelectionOverlay.jsx
packages/editor-ui/src/components/pageEditor/__tests__/ImageDimensionInput.test.jsx
packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelImageSize.test.jsx
packages/editor-ui/src/lib/imageResizeBridge.js
packages/editor-ui/src/lib/__tests__/imageResizeBridge.test.js
packages/editor-ui/src/stores/widgetStore.js
packages/builder-server/src/tests/imageResize.test.js
scripts/dev-theme-profiles/arch-image.json
themes/arch/widgets/image/schema.json
themes/arch/widgets/image/widget.liquid
```

The pre-existing root `package.json` customization and untracked `scripts/__tests__/BACKUPS/` are excluded.
