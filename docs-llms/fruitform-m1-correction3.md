# Fruitform M1 — Revised Correction 3

Branch: `feature/dragonfruit-freeform-positioning`. Draft PR #2 remains unmerged. Started from `5d66d324` with a clean working tree; no separate Round 2 correction commit was present in this checkout.

## Root causes and changes

M1 routed every composition child's reorder arrows to its containing Block. There was no explicit Composition Area selection state, so its layer and page hierarchy could not own distinct arrows. The correction adds a transient `selectedCompositionId`, mutually exclusive with widget/global/theme selections. It is editor state, not a persistence migration.

- Image selected inside a composition: Up = **Bring Forward**, Down = **Send Backward**. Only `stackOrder` changes.
- Composition background, its indicator, or **Select Composition Area** selected: clear the child selection; Up = **Move Block Up**, Down = **Move Block Down**. Only page content order and its deterministic legacy projection change.
- Normal-flow widgets keep page ordering. No selected/applicable object means no active ordering controls.
- A shared pure ordering descriptor supplies scope, labels and boundaries. Trusted arrow messages are checked against the *current* selected owner before dispatch; stale scope, foreign origins, disabled boundaries and no-ops cannot create history entries or act on another hierarchy.
- Both indicators use a single unobstructed pink control row. The Image alignment menu and following-image position remain. Selecting a Composition Area removes child handles; child controls reliably select obscured images and clear the Block selection. No new left-side Page Structure/Layers panel was added.

The related M1 gesture issues had separate code paths: selected linked images were excluded from body dragging; native HTML image dragging could interrupt pointer capture; canonical reconciliation unconditionally cancelled movement; and a committed composition dimension change was classified as a structural preview refresh. These paths now prevent native drag for composition children, allow selected linked-image body gestures while preserving the normal link-selection/click rules, retain active movement for unchanged revision/context echoes, and reconcile composition position/layer/dimension/alignment changes directly without replacing the preview DOM. Real content, policy, canvas-height and Block-order changes still use the normal render path. A move-in-progress guard prevents resize-context refreshes from restoring canonical image geometry over a transient move.

This addresses the identified interruption/flicker/snapping causes. It does not claim a complete native-pointer human acceptance pass.

## Relevant files

- `packages/core/src/runtime/orderingControls.js`: shared hierarchy-sensitive action labels/boundaries.
- `packages/core/src/runtime/previewRuntime.js`: Composition background/indicator selection, exclusive contextual arrows and gesture reconciliation.
- `packages/core/src/runtime/compositionMove.js`, `imageResize.js`: linked-image/native-drag handling, unchanged-revision reconciliation and transient-move protection.
- `packages/editor-ui/src/stores/widgetStore.js`: mutually exclusive editor-only Composition selection.
- `packages/editor-ui/src/lib/compositionActions.js`: validated ordering message dispatch, independent history actions and explicit Block IDs.
- `packages/editor-ui/src/lib/compositionPreview.js`, `components/pageEditor/PreviewPanel.jsx`: geometry-only direct preview synchronization, including Undo/Redo, without morph/reload flicker.
- `packages/editor-ui/src/components/pageEditor/SelectionOverlay.jsx`: trusted selection/action relay and reload synchronization.
- `packages/editor-ui/src/components/pageEditor/CompositionControls.jsx`, `SettingsPanel.jsx`: Composition selection controls and child selection without hierarchy promotion.
- Corresponding core/editor regression tests; `packages/builder-server/src/tests/imageResize.test.js` additionally checks independent Block and layer orders through real storage and static export.

## Validation

Focused frontend regression command:

```powershell
npx vitest run packages/editor-ui/src/stores/__tests__ packages/editor-ui/src/lib/__tests__/imageResizeBridge.test.js packages/editor-ui/src/lib/__tests__/compositionActions.test.js packages/editor-ui/src/lib/__tests__/compositionPreview.test.js packages/core/src/runtime/__tests__/orderingControls.test.js packages/core/src/runtime/__tests__/compositionMove.test.js packages/core/src/runtime/__tests__/imageResize.test.js packages/core/src/runtime/__tests__/previewRuntimeImageResize.test.js packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelImageSize.test.jsx packages/render-engine/src/__tests__/compositionRenderer.test.js
node --test packages/builder-server/src/tests/imageResize.test.js
npm run lint:all
npm run build
git diff --check
```

Results: **480 frontend tests passed across 17 files; 12 backend integration tests passed**. Lint/build passed; the existing bundle-size advisory remains. Local logs: `data/fruitform-correction3-tests.log`, `data/fruitform-correction3-server.log`. The full frontend suite was not rerun for this correction; the prior M1 report documents five Windows filesystem failures.

Coverage includes image→Block→image selection precedence, background selection, exact scoped arrow messages, disabled boundaries, stale-scope rejection, independent one-step Undo/Redo, JSON persistence, generic/legacy store behavior, linked-image dragging/native drag suppression, unchanged-revision gesture preservation, eight resize handles and existing DragonFruit geometry. Backend coverage saves distinct `contentOrder` and `stackOrder`, reloads them, and renders/exports the same composition geometry.

Actually verified in the local browser: image arrows show Bring Forward/Send Backward with correct boundaries; a successful layer action retains the same iframe document; Undo restores it; Select Composition Area clears the child controls and displays only Block arrows; a Block action moves the whole composition; selecting a child from the right-side controls restores layering actions. The screenshot evidence distinguishes these two owners. No automated test is described as human acceptance of continuous pointer smoothness.

## Installation and protection

Use RESIZE LAB, UUID `53f6b4e8-6e6a-4b5d-8554-cf3c7c3940a8`. Its page title/slug is TEST/test; it is not the protected original project. The existing safe command was run:

```powershell
node scripts/dev-theme-sync.js --development --project resize-lab --profile arch-image --installed --apply
```

Result: **unchanged** (no theme file changes needed). Application changes run from the local source checkout; reload the editor/iframe to load them. No additional allowlist, dependency, global migration or protected-project edit is introduced.

Before browser checks, the RESIZE LAB page and protected-project checksum were backed up under `data/.acceptance-backups/fruitform-correction3-20261027-175120/`. The protected original TEST/PIZZA project is checked against that checksum before delivery.

## Human acceptance remaining

1. Select each image, including an entirely obscured one through child controls. Verify Up/Down change only its layer, with correct pink labels and boundary disabling.
2. Click empty Composition background and its indicator. Confirm child selection/handles clear and only whole-Block arrows remain. Switch repeatedly back to images.
3. Click arrows rapidly near indicators/resize nodes in narrow viewports. Confirm no image movement, menu opening, resize start, unintended selection or empty history.
4. Exercise two-image body/grip movement, including the linked image. Drag across overlap boundaries and release; check for flicker, unwanted native image ghosts and snapping. Repeat with a resized/pinned image and after Undo/Redo.
5. Save/reload and export; confirm independent stacking and Block order, unchanged coordinates/dimensions/reading order/pins, and the same mobile presentation.
6. Confirm ordinary flow Widget arrows and the accepted DragonFruit resizing/keyboard/input behavior remain correct.

Keep Draft PR #2 unmerged pending Creative Director acceptance.
