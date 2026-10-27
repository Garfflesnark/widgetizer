# Round 3 sizing and anchor contract

The Creative Director approved the percentage model and bounded flow insets on October 26, 2026. The implementation opts images into this additive contract only after an explicit sizing action; existing projects are not migrated.

## Verified architectural constraints

Current saved fields have different meanings: `image_width_percent` is a percentage of available container width; `image_height_px` is pixels, with 0 meaning proportional Auto. `fullwidth` selects the outer container. Reinterpreting any of those values would change saved projects, so none will be repurposed.

The current gesture changes centered width and top-anchored height. The section and image are different rectangles. Moving the top down while keeping the bottom fixed requires both a smaller image and a persisted normal-flow inset above it. Changing height alone cannot satisfy that requirement after save/reload/export. Consistent west/corner anchoring needs an analogous inline inset. A transient-only offset would be lost on reload; clipping would crop rather than stretch.

## Recommended additive representation

Only an explicit new sizing action would opt a widget into a new versioned settings object:

```json
{
  "image_transform": {
    "version": 1,
    "reference": "intrinsic-fit",
    "scale": { "width": null, "height": null },
    "flowInset": { "inlinePercent": 0, "blockPercent": 0 }
  }
}
```

The fitted reference rectangle is the intrinsic image size reduced proportionally to fit the available container, without upscaling small images: `Bw = min(intrinsicWidth, containerWidth)`, `Bh = Bw * intrinsicHeight / intrinsicWidth`. Both visible percentages use this same fitted reference. Width 50% and Height 50% halve both fitted dimensions. Different percentages intentionally stretch the axes independently. Image selection uses the original media's intrinsic dimensions rather than whichever responsive source variant happened to download. SVGs/placeholders or missing metadata need a documented fallback reference, tested in preview and export.

`null` is Auto. Both Auto use the fitted reference. One Auto derives that axis proportionally from the other axis's chosen scale, subject to the container limit. Thus Width 50% / Height Auto stays proportional. Both controls show percentages or Auto; no percent value means pixels. Default Scale in this model means Auto/Auto, zero flow insets and the normal constrained container (`fullwidth: false`), applied together as one explicit undo step.

Flow insets are **bounded layout spacing**, not absolute/freeform coordinates. Inline inset is relative to container width; block inset is relative to the fitted reference height, so it scales on narrow screens. They become normal-flow margin/padding on the image frame, inside the existing section; captions stay below the visible image. They cannot place the image outside its container or overlap following widgets. There is no z-index, layer, absolute `x/y`, freeform mode or global migration.

For example, a 400px-tall image whose top is dragged down 40px gets 40px of flow spacing above it and a 360px visible height. Total occupied height remains 400px, so its bottom and the following widget stay anchored. The values are persisted as responsive inset/scale ratios, not an arbitrary absolute canvas position. West and corner drags similarly preserve the opposite edge/corner within explicit container constraints. Downward extent changes from a bottom drag can still move following content naturally in document flow.

The geometry function takes an initial rectangle, handle direction, pointer delta and bounds, and returns an anchored rectangle. It does not know about images, centered layout or stored fields. The image flow-layout adapter converts that transient rectangle into scale/inset settings. This keeps geometry reusable for future widget types without introducing freeform positioning now.

## Compatibility and approval boundary

- Widgets without `image_transform.version === 1` continue using exactly the legacy `image_width_percent`, `image_height_px` and `fullwidth` renderer. No project scan, migration or automatic opt-in.
- Legacy values remain stored, with their original meanings. Existing `fullwidth: true` is honored until the user explicitly resets/opts in.
- New mode is opt-in through Default Scale or a deliberately chosen new-model edit after approval. Undo of the first edit restores the entire legacy widget settings snapshot.
- Existing images can look smaller after an explicit new Default Scale if they were previously upscaled to container width. This is intentional only after that user action; merely loading a page cannot change it.
- Preview and export must share the same reference metadata, clamping, CSS and inset interpretation. ResizeObserver can change the fitted reference for responsiveness without writing new saved values.
- Approval of percentage scaling alone does not authorize persistent flow insets. Both are included in the recommended decision because top/opposite-edge anchoring cannot otherwise survive reload/export.

## Alternatives

1. **Container-relative percentages on both axes.** Define a responsive reference height from the container width and intrinsic aspect ratio, even if that upscales small images. Easier continuity with the current 100% width; less natural meaning for Auto/intrinsic size. Still needs explicit normal-flow insets for opposite-edge anchoring.
2. **Keep the current storage and add only display conversions.** Height percentages would be converted to fixed pixels at edit time. Appearance would drift across viewport sizes and Width/Height 50% would not share a stable reference. Not recommended.
3. **Retain top/center anchoring.** Needs no new inset storage, but cannot meet the requested opposite-edge rule. A transient translation alone or crop/clip workaround would not satisfy persistence/stretch requirements.

## Keyboard conventions

Undo/Redo work across the preview iframe: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y. The previous handler also claimed Cmd+Y; it now remains available to native browser history. Text/numeric/select/contenteditable targets, composing input, default-prevented events and unrelated browser chords retain native handling. At empty editor history boundaries these shortcuts are not prevented.

Default Scale opts the image into the approved contract with Auto/Auto, zero flow insets and `fullwidth: false`, atomically. Previous sizing fields remain stored for Undo and compatibility; they are not reinterpreted. The two legacy control fields remain in the schema as capability/fallback metadata but are hidden when the new model is supported.

## Explicit limits

Percentages are 1–400, with 0 in the controls representing stored `null` (Auto). Container width and existing inline inset constrain the resulting width; explicit height may stretch to 400%. Insets are bounded to 0–100% of container width and 0–400% of fitted height. Metadata-free images, placeholders and SVGs without recorded intrinsic dimensions use a shared 1600×900 reference in preview and export. Accurate media metadata is preferable. A legacy image outside the new model's scale bounds retains its rendering; use Default Scale to explicitly reset before editing it. The Arch adapter currently assumes its normal left-to-right flow. Modern CSS container units are required for exported new-model images.

## Required validation after approval

Compare untouched legacy JSON/output, opt-in/undo back to legacy, Auto/Auto, one-axis Auto, 50%/50%, independent stretching, small/large/SVG/missing-metadata images, all eight anchor directions and clamping, top-drag bottom/following-widget stability, gesture cancellation, one undo step per gesture, Default Scale, save/reload/export parity, and desktop/mobile rendering. Use the approved development sync profile for RESIZE LAB and preserve original TEST.
