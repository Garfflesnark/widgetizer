# Fruitform M1 — Image Movement Lock

Branch: `feature/dragonfruit-freeform-positioning`; Draft PR #2 remains unmerged. Source baseline: commit `636e7800`.

## Behaviour

Each selected eligible Composition Image begins unlocked (pink, open-lock icon). Body drag works immediately. The adjacent drag grip works too. The separate lock button is pink and says **Lock Image Position**. Locking colors it DragonFruit green (`#00e676`), sets `aria-pressed=true`, changes its accessible label and tooltip to **Unlock Image Position**, and disables both body movement and the grip. Resize nodes/pins, alignment, layer arrows and dimension controls remain independent. Unlocking restores pink and movement resumes without reselection.

The lock belongs to that Image and the current local editor session. Selecting another Image or Composition, switching desktop/mobile context, or refreshing the preview iframe keeps each Image's lock. Reloading the editor starts unlocked. Returning the containing Composition to Flow clears all its locks. Locks live in transient editor-store state, are validated by the parent against the selected Image, Composition ID and editing context, and are not part of page history/content, save payloads or exported HTML. The parent also rejects a locked movement message, so an attempted body/grip movement cannot create a geometry history entry.

## Root causes addressed

The previous Move mode made unlocked selected Images require activation before body dragging, and it used the same button as both toggle and drag grip. That made click vs drag semantics ambiguous and let one active mode clear on selection changes. The replacement has two separate controls: a per-Image lock button and a dedicated grip. The iframe keeps an immediate transient lock map for hit testing and feedback; trusted messages update the editor-only parent store, which re-sends it after preview/context updates. The core movement controller checks the lock for both body and grip entry. The parent movement bridge checks the lock again before applying a frame. Flow conversion removes that Composition's lock entries.

## Tests and results

Focused checks cover unlocked default, pink/green state, accessible names and pressed semantics, disabling both body and grip while locked, no pointer commit while locked, unlocking without reselection, selection switching with per-Image state, responsive context retention, trusted lock messages, no page/history mutation on lock, rejecting stale/foreign attempts, movement after unlock, selection-preserving undo/redo, and lock removal on Return to Flow. Existing DragonFruit handle/pin, layer, size, scroll, save/reload and export suites were included.

Commands:

```powershell
npx vitest run packages/editor-ui/src/stores/__tests__ packages/editor-ui/src/lib/__tests__/imageResizeBridge.test.js packages/editor-ui/src/lib/__tests__/compositionActions.test.js packages/editor-ui/src/lib/__tests__/compositionPreview.test.js packages/core/src/runtime/__tests__/orderingControls.test.js packages/core/src/runtime/__tests__/compositionMove.test.js packages/core/src/runtime/__tests__/overlayToolbarPlacement.test.js packages/core/src/runtime/__tests__/imageResize.test.js packages/core/src/runtime/__tests__/previewRuntimeImageResize.test.js packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelImageSize.test.jsx packages/render-engine/src/__tests__/compositionRenderer.test.js
node --test packages/builder-server/src/tests/imageResize.test.js
npm run lint:all
npm run build
git diff --check
```

This round passed **496 frontend tests across 18 files** and **12 backend storage/preview/export integration tests**. Lint, production build and diff check passed. The existing build emits the known large JavaScript bundle advisory.

## Local and browser status

The `RESIZE LAB` project is the acceptance target. Guarded sync command:

```powershell
node scripts/dev-theme-sync.js --development --project resize-lab --profile arch-image --installed --apply
```

It reports no theme-file changes; this correction is editor/runtime code. `data/projects/test` (protected TEST/PIZZA) checksum remains the previously recorded `06a3a79ac2910d6fa958ac9c1d8e79a25f36cd3b1f0e2a4b263bdd62786a6ee4`. RESIZE LAB's page was snapshotted before browser checks.

Actually verified in the working app: TREE begins pink/unlocked, becomes green/pressed on lock, its grip becomes disabled, layer arrows and all eight resize nodes remain available; switching to LIMINAL shows pink/unlocked, returning to TREE restores its lock. The browser tool could not deliver reliable continuous drag input into its scaled iframe. Automated body/grip movement blocks are tested, but native pointer acceptance of immediate unlocked dragging and blocked locked attempts remains for the Creative Director. Browser checks did not modify the saved RESIZE LAB page.

Manual check: select TREE and drag immediately; lock it and try both image body and grip; confirm no position/Undo change, while resize/alignment/layer remain usable; unlock and drag twice; repeat with linked LIMINAL and its selection state; resize with a green pin while locked; change responsive view and return; refresh the editor and confirm unlocked; return Composition to Flow in a disposable copy to verify lock cleanup. Do not merge until human acceptance.
