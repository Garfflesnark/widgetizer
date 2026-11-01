# Wyrmetizer page schema version 3

Version 3 extends the paired-layout page envelope. It keeps canonical Widgets,
shared content, membership, Desktop root order, and each Area's Desktop Flow and
Composition arrangement in the version-2 fields. The optional `layout.mobile`
object holds Mobile-only presentation data and orders.

## Breakpoint and reference canvas

The Arch theme begins its desktop rules at `min-width: 750px` and uses
`max-width: 749px` for its Mobile rules. The schema convention is therefore
Mobile through 749 CSS pixels and Desktop from 750 CSS pixels. The Mobile
Composition reference canvas is exactly 390 CSS pixels wide. This is data
metadata only; version 3 does not change rendering or choose a runtime viewport.

## Mobile data

`layout.mobile` requires `referenceWidthPx: 390`. All other fields are optional
and sparse:

- `rootOrder`: a complete permutation of the existing root `contentOrder`
  entries (`widget` and `area`). Omitting it inherits Desktop root order.
- `presentation`: Widget-ID keyed property patches for standalone root Widgets.
- `areas[areaId].flow.order`: a complete permutation of that Area's members.
- `areas[areaId].flow.presentation`: sparse Widget-ID keyed patches.
- `areas[areaId].composition.presentation`: sparse Widget-ID keyed patches.
- `areas[areaId].composition.geometry`: Mobile-specific canvas geometry.

The presentation capability allowlist is the paired-layout presentation set:
`image_transform`, `fullwidth`, `image_width_percent`, `image_height_px`,
`top_spacing`, `top_spacing_px`, `bottom_spacing`, and `bottom_spacing_px`.
Each patch is validated against the owning Widget's composition adapter. Shared
content settings, including media, text, links, and blocks, cannot be stored in
Mobile presentation patches. Property presence determines ownership, so `false`
and `0` are valid explicit values.

Mobile Composition geometry is `{ version: 1, referenceWidthPx: 390,
heightPx, readingOrder, stackOrder, placements }`. Both orders must be complete,
unique permutations of the Area members. Each placement has `x`, `y`, and
`pivot`. Coordinates are parent-relative and accept only `px` and `%`; horizontal
positions are bounded by the 390px canvas and vertical positions by `heightPx`.
Pivot coordinates are normalized to `[0, 1]`. Canvas height is an explicit
finite CSS-pixel value between 1 and 10,000.

## Conversion and compatibility

`convertWyrmetizerPageToV3` validates a version-2 page, changes the envelope to
version 3, and sets the 390px reference convention. It does not create patches or
orders. No existing project file is upgraded automatically. Unknown versions,
Mobile fields in a version-2 envelope, malformed Mobile data, and stale Widget
references are rejected. A version-3 envelope must be preserved by writers;
older versions cannot save it as version 2.
