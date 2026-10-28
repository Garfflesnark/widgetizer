# Fruitform M1 — Human QA Bugs 1–3

Branch: `feature/dragonfruit-freeform-positioning`; Draft PR #2 remains unmerged. Baseline: `5d4178d7`. No content/schema migration or new dependency.

## Diagnosis and correction

**Selection after movement.** Image-body gestures capture the pointer on the Composition Area; grip gestures capture on the stable overlay. The browser can retarget its compatibility click to that capture target. The prior capture-phase click handler called `stopPropagation()`, which does not stop another capture listener on the same document: the selection listener could interpret the release as an intentional Composition background click. Its zero-delay reset also made the suppression fragile.

The controller now consumes only the pending gesture's pointer click in its area/capture surface, using `stopImmediatePropagation()`. The guard expires, clears on the next pointer-down, permits keyboard activation, and also handles moved/cancelled gestures. Intentional subsequent background clicks still select the Composition. No selection, placement or published stacking promotion is added to movement commits. Same-widget parent selection echoes normalize null fields and preserve active controls; the existing parent store retains a surviving widget through Undo/Redo.

**Move toggle.** `compositionMoveModeFor` is iframe editor state only. Click Move to enable selected-image body dragging; click again to disable. Active colour is the same `#00e676` as resize pins, with `aria-pressed` and enable/disable tooltips. The existing button can still be dragged as a grip regardless of mode; a stationary press retains the original button for its click. Grip pointer capture and resize cancellation begin only after the movement threshold, avoiding replacement of the click target. Repeated body gestures retain enabled mode. Changing selected Image, choosing the Composition, changing project/page/responsive editing context, or losing editable Composition membership clears the mode. Page content, pins, export and Undo history never store this state. Reload starts with Move off.

**Scroll attachment.** The fixed overlay correctly uses viewport-relative `getBoundingClientRect()` coordinates. The defect was explicit `Math.max(0, y)` handle clamping and `Math.max(2, toolbarTop)` toolbar clamping, which pinned those elements at the viewport top. Remove those clamps rather than introducing scroll offsets. Resize nodes now remain at their exact corners/midpoints, including negative/offscreen coordinates; their physical hit sizes still account for iframe zoom. The toolbar remains a measured row above its Image, with existing horizontal narrow-viewport fitting. Capture-phase scroll observation also responds to nested scrollports. Movement deltas account for changes in the area's viewport origin during a scaled/nested-scroll gesture.

## Exact changed files

- `packages/core/src/runtime/compositionMove.js`
- `packages/core/src/runtime/previewRuntime.js`
- `packages/core/src/runtime/imageResize.js`
- `packages/core/src/runtime/overlayToolbarPlacement.js`
- `packages/core/src/runtime/__tests__/compositionMove.test.js`
- `packages/core/src/runtime/__tests__/previewRuntimeImageResize.test.js`
- `packages/core/src/runtime/__tests__/overlayToolbarPlacement.test.js`
- `packages/editor-ui/src/lib/__tests__/compositionActions.test.js`
- `docs-llms/fruitform-m1-bugs123.md`

No theme, saved page, rendering/export model, Block ordering or layer ordering implementation changed.

## Automated validation

```powershell
npx vitest run packages/editor-ui/src/stores/__tests__ packages/editor-ui/src/lib/__tests__/imageResizeBridge.test.js packages/editor-ui/src/lib/__tests__/compositionActions.test.js packages/editor-ui/src/lib/__tests__/compositionPreview.test.js packages/core/src/runtime/__tests__/orderingControls.test.js packages/core/src/runtime/__tests__/compositionMove.test.js packages/core/src/runtime/__tests__/overlayToolbarPlacement.test.js packages/core/src/runtime/__tests__/imageResize.test.js packages/core/src/runtime/__tests__/previewRuntimeImageResize.test.js packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelImageSize.test.jsx packages/render-engine/src/__tests__/compositionRenderer.test.js
node --test packages/builder-server/src/tests/imageResize.test.js
npm run lint:all
npm run build
git diff --check
```

Results: **493 frontend tests across 18 files; 12 backend storage/preview/export tests passed**. Lint, build and diff check passed; the existing large-bundle advisory remains. This is the relevant regression set, not a claim that the full repository suite passed.

Added checks cover captured release vs intentional background/keyboard clicks, repeated movement, cancellation, linked images, unchanged synchronization echoes, temporary mode gating, real-click grip retention, green pressed state, hierarchy/context deactivation, same-widget refresh echoes, Image controls remaining after movement, nested-scroll movement under scaling, negative/offscreen handle hit coordinates, and toolbar geometry independent of scroll position. Store assertions check selected Image identity after movement and Undo/Redo. Existing save/reload/export integration verifies independent positions, dimensions, pins, Block order and stack order.

## Local installation and actual browser evidence

RESIZE LAB: project `53f6b4e8-6e6a-4b5d-8554-cf3c7c3940a8`, `data/projects/resize-lab`, page `test`. The similarly named protected TEST/PIZZA project is `data/projects/test` and was not edited. A RESIZE LAB snapshot and protected-file checksum were recorded in `data/.acceptance-backups/fruitform-bugs123-20261027-233417/` before checks.

```powershell
node scripts/dev-theme-sync.js --development --project resize-lab --profile arch-image --installed --apply
```

Guarded synchronization reported **unchanged**, no conflicts: approved source, project and installed theme files already match. The corrections are shared runtime files served directly from this checkout. The local development server is running. No production/global theme migration was applied.

Actually verified in the working Codex application preview: Move off/on/off with green pressed appearance; selected TREE and its eight handles/contextual arrows retained while scrolling; toolbar/image moved together (Image top 536.27 → 194.27 CSS px, toolbar remained 28 px above the selection edge including its border); changing to LIMINAL starts with Move off; Mobile context removes movement controls; returning to Desktop keeps Image selection with Move off. Final preview leaves TREE selected with Move enabled. These are application observations, not a mockup.

Native drag acceptance is **pending**: the tool rejected fractional iframe input coordinates, and unscaled coordinate-drag attempts returned without a committed frame change or history entry. They are not reported as successful drags. Offscreen/nested-scroll/scaled hit-geometry checks and post-release selection are covered automatically, but need the human pointer pass below. No current native-browser evidence establishes the complete drag/release/cancellation matrix.

## Human acceptance checklist

1. In RESIZE LAB select TREE, click Move: green/pressed. Drag the Image body twice without reselecting; handles, indicator, Move mode and layer arrows must remain on TREE after each release. Each movement is one Undo step. Repeat with linked LIMINAL and with the Move grip.
2. Click Move again: inactive; body clicks select without moving. Grip dragging remains available. Switch Images, select intentional empty Composition background/Block indicator, then switch back: previous mode must be off. Confirm alignment, resize and layer buttons still act independently.
3. Move into overlap, select the obscured child through right-side child controls and move it with its grip. Published `stackOrder` must remain unchanged. Cancel a gesture with Escape/pointer cancellation; confirm selection, previous geometry and history.
4. Scroll before selection, with selection, during movement and after release. Scroll past the Image top and entirely out of view. Toolbar and all eight nodes must stay attached or leave view with the Image, with no detached top controls. Repeat at scaled Desktop, narrow editor viewport and a nested scrollport if present.
5. Undo/Redo completed moves; selection stays on the existing Image. Save, change a real content setting to trigger preview refresh, then drag again. Save/reload retains geometry/order/pins, with the temporary Move mode off after reload. Export/preview must show identical saved geometry; no Move toggle or overlays in exported HTML.
6. Recheck Desktop/Mobile Proportional output, normal-flow Image controls, Default Scale, units, alignment, Shift resizing, green resize pins and Composition Block/layer arrows.

Human acceptance is required before merging Draft PR #2.
