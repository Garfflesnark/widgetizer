# Arch image resizing proof of concept

Experimental: review before acceptance. Normal widget order and document flow are retained. Headers, footers and other widget types are excluded.

## Behavior and implementation

Supported Arch images expose an optional `image_width_percent` range setting (integer 10â€“100, default 100). The template centers an inner image wrapper at that percentage of the available content width. Height stays automatic, including linked images and placeholders; captions remain inside the resized wrapper. Full-width still controls the outer container. There are no saved coordinates, layers, independent height settings or breakpoint overrides.

The iframe runtime shows a right-edge handle only when both the loaded schema width setting (including its range/default contract) and template target exist. Moving the handle changes temporary DOM width, with centered geometry: one pixel of right-edge movement changes the total width by two pixels. No store mutation or backend render happens during movement. Releasing sends one `IMAGE_RESIZE_COMMIT`; the parent checks iframe source, exact origin, supported page widget, current selection, starting width, integer bounds and changed value. It commits through the existing widget store, dirty tracking, Zundo history and save flow. Each drag has its own undo boundary. A click or a gesture returning to its start does not create an edit.

Escape, pointer cancellation, lost capture, focus loss, selection changes and morphing the selected widget cancel a gesture. The numeric/slider Width control is the keyboard-accessible alternative. The runtime controller has focused DOM tests; these do not substitute for browser pointer-capture and visual QA.

Preview and static export use the same Liquid template. Intrinsic image metadata and responsive `srcset` remain unchanged. Existing `sizes` hints remain conservative and can download a larger image than necessary when the wrapper is narrowed.

## Existing projects and safe TEST opt-in

No existing project is migrated automatically. New projects receive the updated schema/template when created from an updated Arch theme seed. Existing projects render their own copied `widgets/image/schema.json` and `widgets/image/widget.liquid`, so updating the application or `themes/arch` alone does not enable this feature for them. Old schemas do not contain the width setting and old templates do not contain a resize target.

For this experiment, update only these two files in an explicitly chosen Arch test project, after human approval:

1. Save pending edits and close the editor. Confirm the TEST project's actual folder in `data/projects/` rather than assuming its display name is its folder name.
2. Back up that project's existing `widgets/image/schema.json` and `widgets/image/widget.liquid` to a separate backup directory. Compare them against this branch's `themes/arch/widgets/image/` versions; merge intentionally if they contain customizations. Do not blindly overwrite customized image templates.
3. Copy or merge only those two updated source files into the matching project `widgets/image/` directory. Do not copy the whole theme and do not run `theme:sync --project`: that sync can replace unrelated project theme files. Do not copy pages, uploads, menus, globals, theme settings or other widgets.
4. Restart the backend to clear any cached template and reload the editor to refresh schemas. Verify an untouched image remains full container width. The existing shared translation key supplies the sidebar Width label, so no locale files need copying.
5. To roll back, close the editor and restore only the two backed-up files, restart the backend and reload. The unused saved width setting can remain in page JSON; the old template ignores it. Pages and media need no rewrite.

This implementation does not touch the user's TEST project. A future distributed release should package the two template/schema changes through the existing versioned theme-update mechanism; this experiment does not bump a theme version or silently apply an update.

## Manual acceptance

Use a fresh Arch project or an explicitly opted-in test project following the steps above.

1. Add an image, select it and confirm Width starts at 100%. Legacy projects without the updated files show no handle.
2. Drag the right-edge handle left. Confirm continuous proportional feedback, centered placement and normal vertical flow of following widgets. Check both 10% and 100% limits and dragging outside the iframe before releasing.
3. Release at a distinct width. Confirm the sidebar matches. One Undo restores the previous width; Redo reapplies it. Repeat two drags rapidly and confirm each undoes separately.
4. Drag then press Escape. Repeat with focus loss or selection change. Confirm no saved change or extra undo step. A click without movement must also be a no-op.
5. Use the sidebar slider and numeric input. Confirm the same dimensions, bounds and save behavior. Try linked/unlinked images, placeholders, captions and full-width mode.
6. Save, reload and confirm the value and appearance persist. Export and open the HTML; confirm the same image width and automatic height, without editor handles.
7. Check desktop/tablet/mobile preview widths and a narrow exported browser window. Percentage width scales with the container; no horizontal page overflow should appear. Confirm other widgets, header and footer have no resize handles.
8. In browser network tools, verify pointer movement triggers no preview requests; only a completed changed gesture enters the normal debounced render path.

## Automated checks

- `npm run test:frontend -- packages/core/src/runtime/__tests__/imageResize.test.js packages/core/src/runtime/__tests__/previewRuntimeImageResize.test.js packages/core/src/runtime/__tests__/previewRuntimeMedia.test.js packages/editor-ui/src/lib/__tests__/imageResizeBridge.test.js packages/editor-ui/src/stores/__tests__/widgetStore.test.js packages/editor-ui/src/stores/__tests__/pageStore.test.js packages/editor-ui/src/stores/__tests__/saveStore.test.js`
- `node --test packages/builder-server/src/tests/imageResize.test.js packages/builder-server/src/tests/rendering.test.js packages/builder-server/src/tests/preview.test.js packages/builder-server/src/tests/pages.test.js packages/builder-server/src/tests/export.test.js`
- `npm run build`
- `node scripts/validate-theme-locales.js arch`

Backend tests use isolated temporary project directories and SQLite databases. The new end-to-end controller test saves and reloads page JSON through the real storage adapter, then compares resize CSS from actual preview and static export output. Frontend tests exercise real page/widget/save stores with transport mocked, and runtime tests exercise the actual message/overlay wiring as well as pointer-controller cancellation.

## Verification results

On 2026-10-26: the frontend command above passed all 281 tests across seven files. The backend command passed 271 tests, with one existing POSIX-permissions test skipped on Windows (272 total). The production build passed with Vite's bundle-size advisory. Focused ESLint and `git diff --check` passed. Arch locale validation passed; the theme validator reported zero errors and only the existing 1024×1024 screenshot-size warning. No browser visual/pointer-capture acceptance run has been performed; follow the manual checklist before accepting this experiment.

## Changed files

- `packages/core/package.json`
- `packages/core/src/runtime/imageResize.js`
- `packages/core/src/runtime/previewRuntime.js`
- `packages/core/src/runtime/__tests__/imageResize.test.js`
- `packages/core/src/runtime/__tests__/previewRuntimeImageResize.test.js`
- `packages/editor-ui/src/components/pageEditor/SelectionOverlay.jsx`
- `packages/editor-ui/src/lib/imageResizeBridge.js`
- `packages/editor-ui/src/lib/__tests__/imageResizeBridge.test.js`
- `packages/editor-ui/src/stores/pageStore.js`
- `packages/editor-ui/src/stores/widgetStore.js`
- `packages/builder-server/src/tests/imageResize.test.js`
- `themes/arch/widgets/image/schema.json`
- `themes/arch/widgets/image/widget.liquid`
- `docs-llms/arch-image-resize-poc.md`

The root `package.json` has a pre-existing local `allowScripts` modification. It is excluded from this implementation and its commit.
