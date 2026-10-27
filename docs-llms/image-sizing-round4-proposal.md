# Round 4 dimensional model — approved

Round 3's version 1 contract stores percentage scales and nonnegative flow insets. Mixed pixel/percentage axes and alignment that remains independent of anchored resizing need an extension. The Creative Director approved this version 2 model on October 27, 2026. No existing project is migrated on load.

## Recommended version 2

```json
{
  "image_transform": {
    "version": 2,
    "reference": "intrinsic-fit",
    "dimensions": {
      "width": { "unit": "%", "value": 50 },
      "height": { "unit": "px", "value": 300 }
    },
    "alignment": "center",
    "flowInset": { "inlinePercent": 0, "blockPercent": 0 }
  }
}
```

Each axis independently stores its unit and value. Percentages retain the approved fitted-intrinsic reference and 1–400% bounds. Pixels are stored as exact positive CSS pixel values (proposed bounds: 1–10000px). A `null` value retains proportional Auto internally; Default Scale restores Auto/Auto and natural proportions without changing alignment. The visible Auto buttons are replaced with %/px mode selectors. Auto is displayed as the resolved natural dimension until explicitly edited, with help text identifying natural scaling.

Explicit pixel values remain saved in px across gestures, Undo/Redo and reload. A narrow container may constrain visible width without changing the saved requested width. Height remains independently controllable. Neither unit switch nor handle drag silently converts an axis to another unit.

Switching units converts only that axis's current visible dimension using the current fitted reference. Pixel conversion rounds to the nearest integer CSS pixel; percentage conversion rounds to two decimals. A mode switch is one undo step. Pointer-driven px sizes round to whole pixels; percentage gestures retain bounded fractional precision. Explicitly typed pixel integers are preserved exactly. One Auto axis follows the other axis proportionally; two explicit axes stretch independently.

Alignment supplies the base horizontal position: left, centered or right within available container space. A bounded signed inline flow inset (-100–100% of container width) records any residual displacement required by opposite-edge anchoring. The resulting image bounds are clamped inside the container. Block inset retains the approved 0–400% fitted-height bound. These are normal-flow margin/padding, not freeform coordinates. An explicit alignment action clears the inline residual. Default Scale clears resizing insets while preserving the selected alignment; therefore a centered/right-aligned image stays centered/right-aligned after reset. Gesture geometry is kept separate from this storage adapter.

## Compatibility

- Legacy fields and version 1 retain their meanings and renderer. No project scan, migration or automatic opt-in on load.
- The first explicit new sizing/alignment action can create version 2, converting the current visible bounds. Undo restores the exact previous settings object.
- Version 1/legacy alignment is derived from its existing visible bounds for initial conversion; loading alone cannot move the image. Centered legacy images remain centered until an explicit action.
- New templates/runtime support both versions. Older application versions cannot faithfully display version 2; this is an experimental forward-only feature until human acceptance. Reverting a development installation requires undoing/reverting any new version 2 content first, or restoring the backed-up experimental project.
- Source/install/project theme updates continue through the guarded image-only sync profile. Protected original projects remain untouched.

## Alternatives

1. Add optional pixel overrides to version 1. This avoids a new version number but silently expands the v1 contract and lets old runtimes ignore pixel/alignment intent; it also leaves two competing representations for each axis. Not recommended.
2. Convert pixels into percentages at save time. This avoids a persistence extension but violates exact px mode and responsive semantics. Not recommended.
3. Keep alignment as an override that is cleared on any handle drag. This needs less position bookkeeping but makes alignment and scale dependent and violates Default Scale's alignment contract.

The visible Default Scale state, following Image tag and slider release handling can be repaired independently of this decision.
