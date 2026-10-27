# DragonFruit — Round 5 delivery

DragonFruit is the working feature/project name. The existing `experiment/arch-image-resize` branch and draft PR #1 remain in place, targeting `feature/freeform-canvas`; no branch rename or merge. The Creative Director pre-approved the suggested extensions. [The design and persistence review](dragonfruit-round5-design.md) was recorded before implementation.

## Changes and semantics

- **Shift scaling:** all eight v2 handles support proportional scaling of the current visible aspect ratio, including intentionally stretched images. Corners preserve their opposite corner; sides scale both axes about the opposite midpoint, unless explicit pins constrain the pivot. All four unit combinations retain their units. Modifier transitions rebase from the current rectangle and pointer without snapping; the entire gesture remains one history step.
- **Pins:** optional `image_transform.anchors` contains unique node names, not coordinates. Missing means unpinned. Double-clicking a node toggles it in one history step, green/pink with accessible pressed state and explanatory tooltips. Click pairing survives overlay redraws and ignores actual drag attempts. Existing saved transform dimensions/insets supply persistence; legacy/v1 field meanings are unchanged.
- **Conflicts:** one distinct anchor fraction supplies a fixed pivot on that axis. Multiple fractions lock that axis; incompatible diagonal pins can lock the entire object. Shift cannot proportionally scale when an axis is locked. Pins are never silently moved or removed to satisfy a conflicting gesture. Bounds and pixel rounding apply. At another viewport pins refer to the responsive object's nodes, not absolute screen coordinates.
- **Independent actions:** alignment, unit switches and Default Scale retain pin identities and explicitly rebase them on their resulting geometry. Numeric/slider dimension edits clear all pins together with that edit, atomically. Undo restores dimensions and pins together. Spacing does not clear pins or write resize flow insets.
- **Spacing:** Appearance retains Auto, Small and None, with a Pixels mode and separate Top/Bottom numeric/slider controls (0–2000px). Explicit spacing uses zero corresponding image-container margin and exact padding, avoiding collapsed-margin ambiguity. Zero/None adds no image-owned spacing. Transient feedback bypasses backend renders; only completion updates settings/history.
- **Slider ranges:** dimension sliders stop at 2000px or 111%; numeric/model validation remains 10000px/400%. Values beyond the convenient slider range stay displayed and saved until explicitly edited. Opening a saved 10000px image was verified to retain 10000 in the numeric field while its slider displayed the 2000 endpoint.

111% and 2000px are not equivalent. Percent dimensions use the intrinsic-fit reference: `1.11 * min(containerWidth, intrinsicWidth)` on width, with the corresponding aspect-derived reference height. Visible width is further container-constrained. A fitted 800×600 reference gives requested 888×666 at 111%, not 2000px. Larger saved px widths can remain wider than the visible container without being rewritten.

## None spacing investigation

The current source, installed and project base styles already set None to zero container margin/padding. In RESIZE LAB the first image had None/None and computed **0px margin, 0px padding**. The next image's Auto top margin was **64px**, explaining the remaining visible gap. Small computed **32px margin and 0px padding**. The new scoped template and live controls explicitly enforce image-owned zero/pixel values and preserve these preset meanings.

None does not erase a following widget's own margin, a caption, or a resize top inset. Removing those would change a separate layout property or unrelated content. No global footer/header styles were changed. Exact pixel controls operate on the image container, while anchor-aware `flowInset` remains on the inner image resize frame.

## Four delivery states

1. **Source:** DragonFruit geometry, pins, spacing, practical sliders, tests and documentation are implemented on the existing experimental branch.
2. **GitHub:** the delivery commit updates draft PR #1; it remains unmerged for human acceptance.
3. **Local installation:** Windows filesystem access is available. The existing guarded command updated only the approved image schema/template in RESIZE LAB and installed Arch, with backups and no conflicts. Metadata remains Arch 0.9.10; no valid local `latest/` exists. The sync profile now recognizes the verified Round 4 baseline for safe upgrades without prior local sync history. Receipt: `data/.dev-theme-sync/53f6b4e8-6e6a-4b5d-8554-cf3c7c3940a8/2026-10-27T11-07-17-930Z-c2f17504/`.
4. **Browser:** actual app checks verified corner/side double-click pinning, bright green feedback, pin Undo, dimension-edit unpinning and Undo restoration, pin/spacing save-reload, exact 23px top/0px bottom spacing without changing image flow insets, Auto/Small/None spacing sources, preserved out-of-slider numeric values, and settled mobile rendering. The real local export succeeded as `data/publish/resize-lab-v1/`. Its static `test.html` was opened in the browser and measured at 300×200px with 23px/0px container padding and saved `anchors: ["ne"]`, without editor handles. RESIZE LAB now has an existing `index` homepage, resolving the earlier export blocker; no homepage was created/renamed by this task.

**Browser limitation:** the available drag API cannot hold Shift through a drag. Shift proportions, modifier transitions, all pin constraints/conflicts and mixed-unit conversions are covered by geometry/controller tests; a physical Shift-drag and constrained-drag acceptance pass remains for the Creative Director. Automated checks are not claimed as manual browser proof. The interactive preview is the working app, not a mockup.

The protected original `data/projects/test` remains byte-identical (274 files; tree SHA-256 `f7a111301a95aac8bb5124140949f505a8090dbf2a16e3bd25f93813c66dfde7`). Experimental page settings were saved for acceptance checks, consistent with the Creative Director's authorization to use/discard the live test state. A pre-check page backup is `data/.acceptance-backups/dragonfruit-20261027-040806/test.json`. No unrelated project was updated.

## Validation

```powershell
npx vitest run packages/core/src/runtime/__tests__ packages/editor-ui/src/lib/__tests__/imageResizeBridge.test.js packages/editor-ui/src/components/pageEditor/__tests__/ImageDimensionInput.test.jsx packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelImageSize.test.jsx packages/editor-ui/src/components/pageEditor/__tests__/EditorTopBar.test.jsx scripts/__tests__/dev-theme-sync.test.js
node --test packages/builder-server/src/tests/imageResize.test.js
npm --ignore-scripts run build
```

Focused Vitest: **252 passed**. Real-storage/render/export tests: **11 passed**. Coverage includes every node/pin pairing, proportional sides/corners and bounds, modifier rebasing, locked axes, unit retention, double-click redraw/duplicate handling, pin clearing/history, exact spacing/cancellation, convenient slider bounds vs numeric bounds, trusted messages, original resizing/shortcuts and theme synchronization. ESLint and production build passed; Vite retains its existing bundle-size advisory.

Full bounded-worker Vitest: **2,013 tests; 2,008 passed, 5 failed** in unchanged Windows filesystem tests: four symlink `EPERM` cases in `safePath.test.js` and one concurrent rename `EPERM` case in `atomic.test.js`. No unrelated filesystem code was changed to hide them.

## Manual acceptance

Use the in-app browser at `http://localhost:3000/page-editor?pageId=test`, with RESIZE LAB active. Select an image and:

1. Shift-drag each corner and side. Side handles should scale both axes around the opposite midpoint. Press/release Shift mid-drag; no jump, one Undo entry. Repeat %/%, %/px, px/% and px/px.
2. Double-click a corner/side: green. Drag another node and verify the green point stays fixed. Add incompatible diagonal pins and verify resizing is constrained rather than moving pins. Double-click to unpin. Try Undo/Redo and save/reload.
3. Edit Width/Height manually and verify all pins clear in the same Undo step; Undo must restore them. Alignment, unit changes and Default Scale must retain pin identities according to the documented explicit-action semantics.
4. Try Auto/Small/None and exact Top/Bottom pixels, including 0. Inspect adjacent widgets separately from the image's own spacing. Ensure resizing insets and captions are not overwritten.
5. Open values beyond 2000px/111%, verify no automatic save/change, then use exact numeric entry. Drag/release sliders outside their bounds and over the preview iframe. Check shortcuts/native numeric editing, mobile layout, preview and export.

For subsequent revisions, install with one command, then reload after handling pending edits:

```powershell
node scripts/dev-theme-sync.js --development --project resize-lab --profile arch-image --installed --apply
```

`--rollback latest` in place of `--installed --apply` restores managed theme files, not independently edited page settings. No new dependencies or global migrations. Existing modern-CSS/intrinsic-metadata/LTR limitations remain documented in the earlier sizing contracts. Keep PR #1 draft and unmerged.

## Exact Round 5 files

```text
docs-llms/dragonfruit-round5-design.md
docs-llms/dragonfruit-round5-report.md
packages/core/package.json
packages/core/src/runtime/anchoredResize.js
packages/core/src/runtime/imageResize.js
packages/core/src/runtime/imageTransform.js
packages/core/src/runtime/imageSpacing.js
packages/core/src/runtime/__tests__/dragonfruit.test.js
packages/core/src/runtime/__tests__/imageResize.test.js
packages/editor-ui/src/components/pageEditor/ImageDimensionInput.jsx
packages/editor-ui/src/components/pageEditor/SettingsPanel.jsx
packages/editor-ui/src/components/pageEditor/SelectionOverlay.jsx
packages/editor-ui/src/components/pageEditor/__tests__/ImageDimensionInput.test.jsx
packages/editor-ui/src/lib/imageResizeBridge.js
packages/editor-ui/src/lib/__tests__/imageResizeBridge.test.js
packages/editor-ui/src/stores/widgetStore.js
packages/builder-server/src/tests/imageResize.test.js
scripts/dev-theme-profiles/arch-image.json
themes/arch/widgets/image/schema.json
themes/arch/widgets/image/widget.liquid
```

Pre-existing root `package.json` edits and untracked `scripts/__tests__/BACKUPS/` are excluded.
