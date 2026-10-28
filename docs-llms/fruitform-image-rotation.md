# Fruitform Composition Image rotation

## Architecture and compatibility review

Reviewed Draft PR #2 at `817ba650e6108736de5c4f4b3ec6b90a01ddda08`, its architecture/delivery documents, accepted DragonFruit Round 5 geometry, and the core package/adapter maps. The PR remains unmerged. Rotation is implemented on `feature/fruitform-image-rotation`, based on that exact draft head.

Image dimensions, units, alignment, flow insets and green pin identities remain in `settings.image_transform` v2. Composition frames own rotation in clockwise degrees around the image center, separate from their placement pivot. Missing rotation means zero. Position, reading order, local paint order and session-only Movement Lock retain their distinct ownership. Normal-flow Images do not acquire rotation controls or new transforms.

An explicitly rotated placement uses `placement.version: 2` and `frames.desktop.rotation` (finite -180 through 180; authoring normalizes to [-180,180), rounded to 0.001°). Existing version-1 placements remain accepted without migration. Version-1 placements cannot carry an angle. Older builds reject version-2 placements at validation instead of silently rendering them unrotated. Returning to Flow discards composition placement, including rotation, as it discards composition position. Resetting angle to zero retains placement version 2; Undo restores the original version-1 record atomically.

Preview and export both use `renderPageContent`, with identical centered CSS rotation on the child wrapper. The wrapper establishes native transformed hit testing for Images and links: empty corners of its axis-aligned bounding box are not image targets. The editor draws the actual rotated polygon. Controls remain upright. Resize nodes occupy their rotated positions; their identities and green pin states stay image-local.

Pointer resize deltas are inverse-rotated into image coordinates. The accepted DragonFruit pin/Shift solver runs there; its resulting center shift is rotated back into canvas coordinates, preserving stationary pins/opposite nodes. Conflicting pins still lock axes. Actual rotated bounds must fit the canvas; infeasible updates are rejected. Movement clamps rotated bounds rather than measuring the rotated bounding box as new image dimensions. Manual dimensions, unit changes, alignment and Default Scale preserve the existing DragonFruit pin policies and retain the angle. Numeric dimensions/alignment may be rejected if their rotated result cannot fit.

Rotation explicitly rebases retained pins on the new visual rectangle, like alignment. Movement Lock continues to govern body/grip position dragging independently; it does not disable rotation, resizing, layering or numeric size controls. Rotation does not change saved position or dimensions to make a requested angle fit.

## Interaction and trusted commits

A pink circular handle rotates the selected eligible desktop Composition Image. Shift snaps absolute angles to 15° increments; releasing Shift resumes the pointer angle. One pointer gesture commits once on release; stationary clicks are no-ops. Escape, blur, pointer cancellation, lost capture, changed selection/context/revision and morphing restore the prior styles. Resize nodes are hidden during active rotation and restored on completion to avoid competing pointer targets. The sidebar angle input accepts decimal degrees, commits on blur/Enter, and cancels on Escape.

The parent bridge checks iframe source/origin, selected child and Block, desktop editing context, current frame and widget revision, finite supported geometry and rotated containment. Rotation messages cannot change position/pivot; movement and resize messages cannot alter rotation. Page history and autosave use the existing atomic composition action. Canonical echoes preserve active gestures; Undo/Redo reapply angle/position/size without replacing the iframe document. Generated Mobile Proportional output scales the whole rotated object and is read-only.

## Validation and acceptance

Regression coverage includes angle validation/normalization, rotated point hit testing, all eight stationary pins at multiple angles, scaled pointer input, Shift transitions, cancellation, stale/foreign messages, position lock independence, single-step Undo/Redo, JSON persistence, mixed %/px dimensions, and shared preview/export output. Backend integration exercises real page storage, preview and static export with a version-2 rotated placement.

Use only RESIZE LAB (`53f6b4e8-6e6a-4b5d-8554-cf3c7c3940a8`), page TEST/test. The protected original project is `data/projects/test` (TEST/PIZZA). Snapshot the lab page and hash the protected project before acceptance. No theme file changes are required; this is platform/editor code.

Acceptance: rotate TREE and linked LIMINAL with the handle; test Shift and Escape; enter positive/negative decimal angles; Undo/Redo each action; select through rotated images and empty bounding-box corners; resize each node and a green pin at a nonzero angle; test conflicting pins, numeric sizes, units, alignment, lock and layer controls; save/reload; compare Desktop/Mobile preview with static export. Do not merge without explicit approval. Automated tests are not human pointer acceptance.

### Recorded validation

Final focused run: 296 Vitest tests across 18 files passed (all core runtime tests, composition actions, resize bridge, composition renderer). Real storage/preview/export integration: 12 tests passed. The media runtime fixture now supplies ResizeObserver and the trusted parent origin, matching the browser environment. Rotation requires 3 CSS pixels of pointer movement before starting, preventing Shift-click jitter from changing an off-grid angle.

RESIZE LAB browser checks verified decimal input, Undo/Redo, save/reload, rotated outlines, pin toggling and rotation with Movement Lock. Newer user-saved TREE/LIMINAL edits were preserved. Native drag automation could not safely resolve iframe coordinates; the later browser connection interrupted mobile checks. Full human pointer/Shift/resize and mobile/export visual acceptance remains pending. Automated coverage does not replace these checks. All 274 files in protected TEST/PIZZA matched the pre-acceptance SHA-256 manifest.
