# DragonFruit / Fruitform — Milestone 1

Experimental implementation on `feature/dragonfruit-freeform-positioning`, based on `feature/freeform-canvas` at `1f7cf968a5cbe0d6a8bab920fa270cd20b4f5a3d`. Remote base was checked and matches. This work belongs in a new draft PR; merged PR #1 is unchanged. Human acceptance and merge approval remain outstanding.

## Implemented scope

An explicit Create Composition Area action converts chosen compatible images into a platform Block in main-content flow. The Block owns membership, reading order, separate local stacking, normalized pivot frames, explicit design height and inherited responsive policy. Child overlap is unrestricted; there is no collision avoidance. Composition output is clipped and movements/resizes constrained to its bounds. Following Blocks occupy ordinary flow after the composition's reserved height.

The first adapter is Arch Image `image.v1`: valid accepted v2 dimensions, an uploaded image with media metadata, and no rendered media captions. Images remain in `page.widgets`; Composition Areas are not theme `widget.blocks`. Existing non-composition pages retain their rendering branch and are never converted on load. Text and Video are architectural targets, not advertised capabilities.

Desktop offers image-body dragging after selection and a Move grip for linked or obscured images. Green pins translate with movement and constrain resizing. Existing eight-node geometry, Shift proportional resizing, %/px units, alignment, Default Scale and flow spacing remain separate. A move commits placement only; a resize commits dimensions and placement together, retaining dormant flow insets. Manual dimension edits retain the accepted clear-pins rule. Placement and stacking participate in page Undo/Redo and save/reload.

Bring Forward and Send Backward swap adjacent entries in `stackOrder` only. Child buttons provide selection even when an image is fully hidden. The arrows are context-sensitive: selecting a child activates Bring Forward/Send Backward on `stackOrder`; selecting the Composition Area background or indicator clears the child selection and activates Move Block Up/Down on `contentOrder`. The arrows use the existing pink accent and flank the image indicator in a measured flex row; the indicator's alignment menu remains available. Overlay targets counter-scale when the design iframe is reduced to fit Codex.

Composition height is an explicit desktop **design** value. Its displayed width and height scale uniformly, including on mobile. Canvas width is initially 1200 design pixels; Desktop/Mobile editing viewports are 1200/390 CSS pixels, scaled to fit the available pane. Percent dimensions resolve once against the desktop intrinsic-fit reference. Stored px values are desktop design pixels in this opt-in mode, and their *presentation* scales with the composition; their saved values are not rewritten.

Generated tablet/mobile geometry is read-only. In this milestone the image properties pane is also read-only there; return to Desktop to edit shared image content/properties. No drag, slider or numeric edit silently converts a responsive mode. Full Custom/Reflow editing and mixed-mode rendering are deferred. Uninitialized Custom policies have a visibly identified Proportional fallback, with no generated frame persisted; authored responsive frames and Reflow requests fail explicitly in this build. No incomplete authoring switches are exposed.

## Persistence and extension contracts

- `layout.version = 1`; `contentOrder` references flow widgets or Composition Block IDs.
- `layout.compositions[id]` contains `childrenOrder`, independent bottom-to-top `stackOrder`, `placements`, `responsive.defaultMode`, and desktop `profiles` with `referenceWidthPx`, explicit `height.valuePx` and `overflow: "clip"`.
- Placements use version 1, `responsive.mode` (`inherit` or a supported override) and `frames.desktop` with width-normalized `x,y` and fractional `pivot.x,y`.
- `widgetsOrder` is a deterministic projection, not a second editable content hierarchy. All widgets have exactly one owner and all order arrays are validated permutations.
- Returning the last composition to flow writes `layout: null` explicitly. Absence still means a legacy page. The null tombstone lets the server distinguish an intentional return from an older client omitting unfamiliar layout metadata.
- Older clients omitting layout on a composition content save receive a conflict response. Page-details edits preserve existing composition/order metadata. Unsupported versions/capabilities fail visibly; they are never silently flattened.
- Existing widget copies enter normal flow and do not acquire dangling membership. Deleting the last child cleans up its empty Block. Page-local IDs may remain scoped to a duplicated page; composition duplication and batch-selection UI are deferred.

Adapters are registered by widget type in core `compositionAdapters` and render-engine `compositionRenderAdapters`. A compatible type supplies its capability ID, eligibility check, visible-geometry measurement, media reference/validation as needed, and a renderer producing HTML plus canonical bounds. Its effective project schema must declare the matching `compositionCapability`, and its template/adapter must implement that contract. Future Text/Video support must add both validated adapters and theme capability declarations, with measurement/export/responsiveness fixtures, before exposing conversion. Core membership/order/placement planning does not inspect image settings.

## Main code paths

| Path | Responsibility |
|---|---|
| `packages/core/src/runtime/composition.js` | Versioned validation, ownership, normalized frames, stack actions, conversion/dissolution and legacy CRUD reconciliation |
| `packages/core/src/runtime/compositionImage.js` | Image capability, intrinsic-fit dimensions, media/caption checks and canvas-bound validation |
| `packages/core/src/runtime/compositionDOM.js`, `compositionMove.js` | DOM geometry adapter, pointer capture, transient movement, cancellation, containment and one release message |
| `packages/core/src/runtime/imageResize.js` | Existing solver adapted to composition frames; pins, Shift and units preserved |
| `packages/core/src/runtime/previewRuntime.js`, `overlayToolbarPlacement.js` | Runtime synchronization, visible selection, image/menu/reorder arbitration, measured accessible toolbar placement |
| `packages/render-engine/src/compositionRenderer.js`, `compositionImageRenderer.js` | Shared page composer and isolated image render adapter for preview and export |
| `packages/editor-ui/src/lib/compositionActions.js` | Trusted/stale-checked commits, page history boundaries, conversion, stacking and Block ordering |
| `packages/editor-ui/src/components/pageEditor/CompositionControls.jsx` | Opt-in conversion, obscured-child selection, layers, height and Return to Flow |
| `PreviewPanel.jsx`, `SelectionOverlay.jsx`, `SettingsPanel.jsx` in the same directory | Design viewports, live bridge/history reconciliation and active-context controls |
| `packages/editor-ui/src/stores/pageStore.js`, `widgetStore.js`, `lib/imageResizeBridge.js` | Existing state/history/resize paths integrated with Composition ownership |
| `packages/builder-server/src/controllers/previewController.js`, `exportController.js` | Both call the same page composer |
| `packages/builder-server/src/controllers/pageController.js` | Scoped validation, effective schema/media checks, old-client guard and save integrity |
| `themes/arch/widgets/image/schema.json`, `widget.liquid` | Explicit project-theme capability declaration/marker; ordinary flow CSS unchanged |
| `scripts/dev-theme-profiles/arch-image.json` | Adds the accepted merged revision as a trusted baseline; approved file list remains exactly two image files |

Static composition geometry is HTML/CSS, not an editor interaction script. A composition-scoped reveal override prevents Arch's JavaScript-dependent reveal animation from hiding composition images without scripting. Links/image markup remain the theme's normal output. Editor overlays are absent from publish output.

## Test commands

```powershell
npx vitest run packages/core/src/runtime/__tests__/composition.test.js packages/core/src/runtime/__tests__/compositionMove.test.js packages/core/src/runtime/__tests__/imageResize.test.js packages/core/src/runtime/__tests__/anchoredResize.test.js packages/core/src/runtime/__tests__/imageUnits.test.js packages/core/src/runtime/__tests__/previewRuntimeImageResize.test.js packages/core/src/runtime/__tests__/overlayToolbarPlacement.test.js packages/editor-ui/src/lib/__tests__/compositionActions.test.js packages/editor-ui/src/lib/__tests__/imageResizeBridge.test.js packages/editor-ui/src/components/pageEditor/__tests__/ImageDimensionInput.test.jsx packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelImageSize.test.jsx packages/render-engine/src/__tests__/compositionRenderer.test.js scripts/__tests__/dev-theme-sync.test.js
node --test packages/builder-server/src/tests/imageResize.test.js packages/builder-server/src/tests/pages.test.js packages/builder-server/src/tests/preview.test.js packages/builder-server/src/tests/previewLanguages.test.js packages/builder-server/src/tests/rendering.test.js packages/builder-server/src/tests/export.test.js packages/builder-server/src/tests/paginationExport.test.js
npx vitest run --maxWorkers=2
npm run lint:all
npm run build
git diff --check
```

Ignored local logs: `data/fruitform-focused-final.log`, `data/fruitform-server-final.log`, `data/fruitform-frontend-final.log`. Build retains the existing bundle-size advisory. A single late backend fixture assertion was also rerun successfully in the 12-test image integration suite.

## Local installation and reproducible update

The repository and runtime are on the Creative Director's Windows filesystem. The local acceptance project is **RESIZE LAB**, UUID `53f6b4e8-6e6a-4b5d-8554-cf3c7c3940a8`, directory `data/projects/resize-lab`. Its acceptance page is confusingly named **TEST**, slug `test`; it is not the protected original project in `data/projects/test` (TEST/PIZZA).

From the repository root, use the existing guarded command:

```powershell
node scripts/dev-theme-sync.js --development --project resize-lab --profile arch-image --installed --apply
```

Only the allowlisted image schema/template are installed into RESIZE LAB and the effective installed Arch source (including a valid latest snapshot when applicable). No broad theme sync or automatic production/project migration is introduced. The script supplies hashes, conflict detection, backups and rollback; theme metadata stays at 0.9.10, with file hashes identifying the development revision. Reload the editor to reload schemas and runtime. Unrelated customizations remain protected.

Initial installation receipt: `data/.dev-theme-sync/53f6b4e8-6e6a-4b5d-8554-cf3c7c3940a8/2026-10-27T23-36-17-213Z-262027e1/`.
Page backup before acceptance edits: `data/.acceptance-backups/fruitform-m1-20261027-163616/test.json`.
The script's rollback operation is documented in `docs-llms/dev-theme-sync.md`; use its recorded receipt, not a manual overwrite. A theme rollback does not undo page conversion: use editor Undo/Return to Flow or the page backup with a compatible application.

## Verification evidence

Automated and browser evidence are separate. Tests do not constitute Creative Director acceptance.

- Focused tests cover conversion, IDs/ownership, separate reading/stack order, generic adapter registration, bounds/invalid frames, stale/foreign iframe messages, Undo/Redo, mobile read-only guards, drag cancellation, body/handle arbitration and measured toolbar placement.
- Image-controller coverage exercises all eight composition handles across all four %/px combinations, opposite anchors, retained flow insets, Shift with green pins, cancellation and legacy gestures.
- Backend integration uses real isolated project storage/theme templates/media metadata and real preview/export: membership, dimensions, pins and stack survive reload; preview/export geometry matches; old-client/unknown-version writes are rejected; page-details edits preserve the layout.
- Existing page, preview, language, rendering, export and pagination regressions were run: 334 passed, one skipped, zero failures across 335 tests.
- Development sync suite: 31 passed in its focused run. A parallel full-suite run hit its 5-second timeout once; it passed in isolation.
- Final focused frontend/tooling run: **242 passed across 13 files**. Full frontend run (`--maxWorkers=2`): **2073 passed, 5 failed across 2078 tests**. The failures are the existing four Windows symlink-permission cases in `safePath.test.js` and one Windows concurrent atomic-rename `EPERM` case. The full run preceded the last focused test additions; those were subsequently covered in the 242-pass run. The full suite is not green.
- Lint and production build were run. The existing large-bundle warning remains.

Actually observed in the local application: explicit two-image conversion, overlapping render, independent stacking controls, save/reload, mobile proportional output with disabled geometry controls, alignment menu, distinct whole-Block reorder and Undo, and a successful static export (RESIZE LAB version 2). Static export was opened and inspected: one composition, expected stack indices and no editor overlays. These observations are narrower than the complete human checklist below.

Native mouse-drag verification requires a safely targetable acceptance window. The in-app automation's coordinate drag did not reach the intended temporary tab; fractional scaled iframe input is also restricted. Windows automation initially exposed the earlier multi-tab Chrome window despite confirmation of a dedicated window, so automatic review blocked full-window capture to avoid unrelated private tabs. Do not claim this as successful manual movement/Shift acceptance. Retain those checks for a safely isolated window or human review. Native-pointer limitations do not negate the automated pointer/geometry coverage.

## Comprehensive human acceptance checklist

Use **RESIZE LAB** only. First confirm CURRENT PROJECT on the Pages screen. Keep the original TEST/PIZZA project closed. The acceptance page's TEST title alone is not project identity.

### Opt-in and structure

- [ ] Confirm an ordinary legacy page looks unchanged and does not become dirty merely on opening.
- [ ] Select two eligible v2 Images, choose Create Composition Area, inspect the stated initial overlapping arrangement and explicit height.
- [ ] Undo creation once: exact previous content/settings return. Redo restores the same membership and stable IDs.
- [ ] Unsupported/captioned widgets are rejected clearly; no content is dropped.
- [ ] Adjust canvas height, blur/commit once, Undo once. Too-small/invalid heights report the bounds issue.
- [ ] Return Composition to Flow and Undo; confirm original image-owned spacing/insets remain available.

### Movement, geometry and history

- [ ] First click selects; dragging the selected non-link image surface moves it smoothly in both axes.
- [ ] Use the Move grip for a linked image; a drag never follows its link. Published links still work.
- [ ] Move two images independently into overlapping and fully coincident positions. Neither pushes, repels or separates the other.
- [ ] Move to all canvas edges; bounds constrain the artwork while controls remain reachable.
- [ ] Release once, Undo once, Redo once; position and pins restore exactly. Check Ctrl+Z/Ctrl+Y from both iframe and editor background.
- [ ] Escape/pointer cancel during a drag restores the start with no Undo entry. Click without moving creates no entry.
- [ ] Double-click side/corner pins; verify bright green state. Move the image and confirm pins translate with it.
- [ ] Exercise all eight resize handles; the manipulated edge follows the pointer and its opposite stays anchored.
- [ ] Hold Shift on corners and sides; press/release Shift mid-gesture without jumps. Verify pinned constraints.
- [ ] Test %/%, %/px, px/%, px/px. Unit switches preserve displayed size; independent stretching remains possible.
- [ ] Numeric/slider edits clear pins atomically; Default Scale and alignment retain their documented independent semantics.
- [ ] Sliders provide smooth previews, reliably release over the iframe, and commit once. Native input Undo remains native.

### Layers, ordering and selection

- [ ] Select a fully obscured image using the Composition child buttons and move it using its grip.
- [ ] Bring Forward/Send Backward change only paint order. Check the boundary disabled states and no-op history.
- [ ] Undo/Redo a layer command without changing placement, units, reading order or Block order.
- [ ] With an Image selected, Up/Down changes only its layer. Select the Composition Area background/indicator: the arrows immediately become Block Up/Down and move the whole Composition without changing child layers. Switch back through child controls.
- [ ] Image indicator still follows the visible top edge; Left/Center/Right menu works beside the pink arrows.
- [ ] Check arrow/menu hit targets on very narrow images, left/right/top canvas edges, rapid resizing and a narrow Codex pane. Check normal-flow images too.

### Responsive, save and export

- [ ] Switch Desktop/Mobile: relative positions, overlap and both displayed dimensions scale uniformly; px values do not silently mutate.
- [ ] Mobile clearly says generated Proportional. Drag/dimension controls cannot alter desktop or silently create Custom placement.
- [ ] Check 749/750 and 989/990 viewport transitions; header/footer and following Blocks remain stable.
- [ ] Save, reload, select both children: positions, stacking, dimensions, green pins and alignment persist.
- [ ] Export RESIZE LAB, open its TEST page at matching desktop/mobile widths, compare geometry/order/links with preview.
- [ ] Disable JavaScript in a separate export test tab: composition artwork remains positioned and visible, with no editor handles.
- [ ] Reopen an untouched flow page and confirm accepted DragonFruit behavior still works.

Do not merge until the Creative Director completes acceptance and explicitly authorizes merging.

## Exact source/document files changed

```text
docs-llms/dragonfruit-freeform-positioning-proposal.md
docs-llms/dragonfruit-fruitform-m1.md
packages/builder-server/src/controllers/exportController.js
packages/builder-server/src/controllers/pageController.js
packages/builder-server/src/controllers/previewController.js
packages/builder-server/src/tests/imageResize.test.js
packages/core/package.json
packages/core/src/runtime/__tests__/composition.test.js
packages/core/src/runtime/__tests__/compositionFixture.js
packages/core/src/runtime/__tests__/compositionMove.test.js
packages/core/src/runtime/__tests__/imageResize.test.js
packages/core/src/runtime/__tests__/overlayToolbarPlacement.test.js
packages/core/src/runtime/__tests__/previewRuntimeImageResize.test.js
packages/core/src/runtime/composition.js
packages/core/src/runtime/compositionDOM.js
packages/core/src/runtime/compositionImage.js
packages/core/src/runtime/compositionMove.js
packages/core/src/runtime/imageResize.js
packages/core/src/runtime/overlayToolbarPlacement.js
packages/core/src/runtime/previewRuntime.js
packages/editor-ui/src/components/pageEditor/CompositionControls.jsx
packages/editor-ui/src/components/pageEditor/ImageDimensionInput.jsx
packages/editor-ui/src/components/pageEditor/PreviewPanel.jsx
packages/editor-ui/src/components/pageEditor/SelectionOverlay.jsx
packages/editor-ui/src/components/pageEditor/SettingsPanel.jsx
packages/editor-ui/src/components/pageEditor/__tests__/ImageDimensionInput.test.jsx
packages/editor-ui/src/lib/__tests__/compositionActions.test.js
packages/editor-ui/src/lib/compositionActions.js
packages/editor-ui/src/lib/imageResizeBridge.js
packages/editor-ui/src/stores/pageStore.js
packages/editor-ui/src/stores/widgetStore.js
packages/render-engine/src/__tests__/compositionRenderer.test.js
packages/render-engine/src/compositionImageRenderer.js
packages/render-engine/src/compositionRenderer.js
packages/render-engine/src/index.js
scripts/dev-theme-profiles/arch-image.json
themes/arch/widgets/image/schema.json
themes/arch/widgets/image/widget.liquid
```

## Correction 3

See [context-sensitive ordering corrections](fruitform-m1-correction3.md) for the updated selection contract, drag interruption/flicker fixes, regression results and remaining manual checks.
