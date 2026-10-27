# DragonFruit — Round 5 design

Working feature/project name: **DragonFruit**. Continue `experiment/arch-image-resize` and draft PR #1; no rename or merge. The Creative Director pre-approved the suggested extensions on October 27, 2026, including this documented persistence extension, without another approval prompt.

## Anchor representation and review gate

Add optional `anchors: ["nw", "n", "ne", "e", "se", "s", "sw", "w"]` to the approved version 2 image transform. Missing means no pins. Validate unique supported node identifiers, maximum eight. No coordinates, layers or migration are introduced. Double-click toggles one identifier as one history step; green means pinned, pink means unpinned. The persisted transform already records resulting dimensions and flow insets.

At gesture start, pinned points are resolved from the visible rectangle. During that gesture they constrain geometry. One distinct horizontal anchor fraction fixes that pivot; multiple distinct fractions lock horizontal size/position. Apply the same rule vertically. Conflicting pin combinations therefore lock the constrained axes rather than moving pins or silently removing them. Dragging a pinned node cannot move it. With Shift, a locked axis prevents proportional scaling entirely. Layout bounds and finite numeric precision apply; an infeasible resize is a no-op. At a new viewport pins refer to the responsive object's corresponding nodes, not absolute screen coordinates.

Alignment, unit changes and Default Scale retain pin identities and explicitly rebase them on their resulting rectangle. Manual dimension edits (numeric or slider) clear all pins together with that dimension edit, in one undoable operation. Spacing changes do not clear pins or modify the image's anchor-aware flow insets.

## Shift gestures

Shift preserves the current visible aspect ratio, including deliberately stretched images. Corners use proportional diagonal projection around their opposite corner unless explicit pins supply the pivot. Side handles use their active axis to set a uniform scale; the opposite side midpoint stays fixed, so the other axis grows/shrinks symmetrically. Bounds can stop a gesture. All four %/px combinations keep their units. Pixel rounding can cause subpixel geometric tolerance.

Pressing/releasing Shift rebases the interaction segment at the current visible rectangle and current pointer, retaining the latest geometry without snapping to an earlier aspect ratio. It remains a single gesture and history entry. Pins remain fixed through segments.

## Spacing

Keep `top_spacing`/`bottom_spacing` presets Auto, Small and None, and add a Pixels mode with separate `top_spacing_px`/`bottom_spacing_px` integers (0–2000). Missing fields preserve existing rendering. Explicit image spacing uses non-collapsing image-owned container padding with zero corresponding margin; it does not touch `image_transform.flowInset`. None means zero image-owned spacing. Adjacent widgets, captions and image flow insets can still contribute visible separation; those are measured and reported rather than silently changing global footer/content styling.

## Slider limits

Dimension sliders use convenient 1–2000px and 1–111% ranges. Numeric/model bounds stay 1–10000px and 1–400%; values outside the slider range stay saved/displayed until explicitly edited. Merely rendering a slider must not commit a clamped value. 111% means 1.11 times the fitted intrinsic axis: it is not equivalent to 2000px and width remains container-constrained. Spacing sliders include 0.

## Verification

Test pin validation/conflicts, each node, Shift side/corner behaviour, modifier transitions, all unit combinations, one-step pin/dimension history, unpin-on-manual-size, retained alignment/default/unit semantics, exact spacing and zero/None, legacy output, responsive bounds, real save/reload and shared preview/export. Use guarded image-only theme sync for RESIZE LAB and preserve the protected original project. Provide the actual local in-app browser as the interactive preview.
