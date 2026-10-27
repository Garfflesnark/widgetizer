# Image resizing: acceptance round 3

The Creative Director approved intrinsic-fit percentages and bounded normal-flow insets on October 26, 2026. See [the sizing contract](image-sizing-round3-proposal.md). No existing projects are migrated and no freeform coordinates are introduced.

## Root causes and changes

- Editor shortcuts previously belonged to the parent window; key events in the preview iframe cannot bubble to it. One shared shortcut classifier now excludes editable/native targets, composition and handled events. Trusted iframe messages relay available Undo/Redo commands to the same history action used by toolbar buttons. Ctrl+Z, Ctrl+Y and Ctrl/Cmd+Shift+Z work; Cmd+Y and empty history boundaries remain native.
- The legacy width field means container percentage; the legacy height field means pixels. Reinterpreting them would change existing content. An explicit sizing action now stores the approved `image_transform` version 1 object. Both percentages scale an intrinsic image fitted to its container without upscaling small originals. Either axis supports Auto. Two explicit values permit independent stretching. Width remains constrained by available container space.
- Full Width described the outer section container, not image scale. The image UI now offers Default Scale: Auto/Auto, zero insets and the normal constrained container in one history step. Saved `fullwidth`, width and pixel-height fields retain their meanings and remain stored; untouched legacy rendering is unchanged.
- Height alone cannot represent a top-edge drag with a fixed bottom after reload. A reusable geometry function moves the manipulated edges and anchors their opposites. The image adapter converts its transient rectangle to bounded responsive margin/padding and scales. This preserves document flow, captions, section controls and following content. No backend request occurs during pointer moves or slider previews; the completed interaction commits once.
- Source theme edits do not replace installed themes or per-project copies. New projects seed from installed Arch, preferring a valid `latest/` snapshot. The established development sync explicitly updates only the two approved image files, with conflict checks, backups and rollback. There is no broad migration.

## Delivery and local evidence

1. **Source:** Round 3 changes are on `experiment/arch-image-resize`.
2. **GitHub:** delivery is draft PR #1, targeting `feature/freeform-canvas`; no merge is authorized.
3. **Local installation:** Windows filesystem access is available. The guarded command updated `data/projects/resize-lab/widgets/image/{schema.json,widget.liquid}` and `data/themes/arch/widgets/image/{schema.json,widget.liquid}`. No valid local `latest/` snapshot existed. Theme metadata stays 0.9.10; file hashes identify this development revision. Backup receipt: `data/.dev-theme-sync/53f6b4e8-6e6a-4b5d-8554-cf3c7c3940a8/2026-10-27T06-49-17-298Z-bf26c295/`. Schema SHA-256: `711bc382a114cc603e1231bf1fbc375ea61fe2a246beb20f1d7a1bf49a7a8bec`; template: `110b1502bfa9cf68c9beecb18190d4890d70569c860eea9a5c883ad38eac8b27`.
4. **Browser:** the local RESIZE LAB editor was reloaded with the updated schema/template and frontend/runtime. Verified Default Scale, 50%/50% equal scaling, independent 50%/80% stretch, Width Auto, Auto/Auto, desktop/mobile containment, toolbar Undo, Ctrl+Z/Ctrl+Y in both parent editor and preview, and numeric-input exclusion. A native top-handle drag moved top 141→191 and height 486→436 while bottom stayed 627 (iframe coordinates). The eight handles and dashed image outline remained present. All temporary settings changes were undone. Automated tests, rather than a browser export download, verify save/reload/export parity.

Protected original `data/projects/test` stayed byte-identical: 274 files, tree SHA-256 `f7a111301a95aac8bb5124140949f505a8090dbf2a16e3bd25f93813c66dfde7`. All 275 RESIZE LAB files outside the two approved theme files also stayed byte-identical, including its page JSON: tree SHA-256 `5379247cdecad98cca5f3cb4bb17701d71a0a6137323614166c72f37cd03ed3a`.

## Tests

Focused runtime, sidebar, bridge, toolbar and geometry tests passed (163 tests), and the synchronization suite passed (31 tests):

```powershell
npx vitest run packages/core/src/runtime/__tests__ packages/editor-ui/src/lib/__tests__/imageResizeBridge.test.js packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelImageSize.test.jsx packages/editor-ui/src/components/pageEditor/__tests__/ImageDimensionInput.test.jsx packages/editor-ui/src/components/pageEditor/__tests__/EditorTopBar.test.jsx scripts/__tests__/dev-theme-sync.test.js
node --test packages/builder-server/src/tests/imageResize.test.js
```

The backend command passed all 9 tests, including real storage round trips, shared preview/export CSS, Auto axes, invalid-transform fallback, legacy rendering and installed/latest seeding. Focused tests cover all eight anchor directions, clamping, cancellation, stale/untrusted messages, one history step, Default Scale Undo/Redo and native shortcut exclusions. ESLint passed for changed code/tests. `npm --ignore-scripts run build` passed with the existing large-bundle warning.

`npx vitest run --maxWorkers=4` ran 1,955 tests: 1,950 passed; 5 failed in unchanged Windows filesystem tests. Four `safePath.test.js` cases cannot create symlinks (`EPERM`); `atomic.test.js` cannot perform concurrent replacement renames (`EPERM`). An initial unrestricted-worker run also failed one sync test; its standalone rerun and the bounded-worker full run passed all 31 sync tests. These failures were not hidden or fixed by changing unrelated filesystem code.

## Manual acceptance

The current local RESIZE LAB build is already installed. For subsequent source revisions, run this one command from the repository, then reload the editor after saving/discarding pending edits:

```powershell
node scripts/dev-theme-sync.js --development --project resize-lab --profile arch-image --installed --apply
```

Rollback only that managed installation with:

```powershell
node scripts/dev-theme-sync.js --development --project resize-lab --profile arch-image --rollback latest
```

1. Open RESIZE LAB, select its image and confirm loading alone preserves its previous appearance. Its page title is TEST; the protected original project is a different folder/ID.
2. Use Default Scale. Both axes should show Auto. Undo once should restore the complete legacy state; Redo restores defaults.
3. Enter 50% on each axis, then 50%/80%. Check proportional scaling followed by intentional stretch. Try either Auto control. Move both sliders and confirm smooth live feedback; release produces one Undo step. Escape cancels a draft.
4. Drag each edge/corner. The opposite edge/corner should remain anchored within the container bounds. Drag the top down and verify the image bottom and following content stay still. Undo, Redo and cancellation should move the outline/handles with the image.
5. Try Ctrl+Z/Ctrl+Y on the canvas and toolbar. In link/text/numeric fields, native editing must retain control. Test empty history and Ctrl/Cmd+Shift+Z.
6. In this experimental project only, save chosen changes, refresh and inspect standalone preview plus a static export. Repeat at mobile and desktop sizes, including large/small uploaded images and linked/captioned images. The production export download and broader cross-browser/device checks remain human acceptance work.

## Limits

The new export uses modern CSS container units. Images without recorded dimensions use a shared 1600×900 reference; that fallback cannot infer unknown original proportions. Legacy dimensions outside the new 1–400% scale bounds remain unchanged; Default Scale explicitly resets them before new-model edits. The Arch flow adapter assumes its normal left-to-right layout. No automatic migration, global header/footer changes, project content overwrite or production installation occurs.

## Exact Round 3 files

```text
docs-llms/image-sizing-round3-proposal.md
docs-llms/image-resize-round3-report.md
packages/core/package.json
packages/core/src/runtime/anchoredResize.js
packages/core/src/runtime/editorHistoryShortcut.js
packages/core/src/runtime/imageTransform.js
packages/core/src/runtime/imageResize.js
packages/core/src/runtime/previewRuntime.js
packages/core/src/runtime/__tests__/anchoredResize.test.js
packages/core/src/runtime/__tests__/editorHistoryShortcut.test.js
packages/core/src/runtime/__tests__/imageResize.test.js
packages/core/src/runtime/__tests__/previewRuntimeImageResize.test.js
packages/editor-ui/src/lib/editorHistory.js
packages/editor-ui/src/lib/imageResizeBridge.js
packages/editor-ui/src/lib/__tests__/imageResizeBridge.test.js
packages/editor-ui/src/stores/widgetStore.js
packages/editor-ui/src/components/pageEditor/EditorTopBar.jsx
packages/editor-ui/src/components/pageEditor/ImageDimensionInput.jsx
packages/editor-ui/src/components/pageEditor/SelectionOverlay.jsx
packages/editor-ui/src/components/pageEditor/SettingsPanel.jsx
packages/editor-ui/src/components/pageEditor/__tests__/ImageDimensionInput.test.jsx
packages/editor-ui/src/components/pageEditor/__tests__/SettingsPanelImageSize.test.jsx
packages/render-engine/src/renderEngine.js
packages/builder-server/src/tests/imageResize.test.js
themes/arch/widgets/image/schema.json
themes/arch/widgets/image/widget.liquid
```

The pre-existing root `package.json` customization and untracked `scripts/__tests__/BACKUPS/` are excluded.
