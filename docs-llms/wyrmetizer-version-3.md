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

## Read-only presentation resolver

`resolveWyrmetizerPresentation(page, viewportWidthPx, options)` returns a
disposable view model with resolved `widgets`, `rootOrder`, and active `areas`.
It validates the canonical page and does not mutate it. Version 2 resolves to
Desktop at every viewport width. Version 3 selects Mobile at 749px and below;
Mobile presentation patches overlay their paired Desktop presentation by
property. Omitted root and Flow orders inherit their Desktop orders. Composition
Mobile reading and stack orders inherit independently when Mobile geometry is
omitted; child anchors are then mapped proportionally into the 390px canvas.
Supplying `options.imageDimensions` as a Widget-ID keyed map lets the resolver
check effective child rectangles against their resolved parent canvas. When
dimensions are not supplied, composition images use the existing 1600×900
fallback convention. The shared render-engine `renderPageContent` uses this
resolver to emit Desktop and Mobile variants behind the 750px media breakpoint.
Preview and export both call that same renderer. It reads actual natural image
dimensions from rendered Widget markup and validates final Composition bounds
before returning HTML. The canonical page remains unchanged.

## Mobile settings controls (Stage C2)

On paired-layout pages, the Mobile settings panel reads the shared responsive
resolver. Image dimensions, unit selectors, Default Scale, spacing presets and
pixel spacing commit through the C1 sparse presentation transactions. Transform
dimensions share the `image_transform` property: its ownership indicator and
Reset Property action apply to the entire transform. Default Scale can commit
both `image_transform` and `fullwidth` in one history step. Invalid adapter
values are reported without committing the page.

Each supported property shows Inherited or Overridden based on presence in the
current Mobile patch. Reset Property removes that property; Reset Widget removes
the selected Widget's presentation patch in its current mode. Reset Current
Mobile Mode uses C1's page-wide mode reset, including any saved arrangement
overrides in that mode. Flow and Composition presentation remain independent.
Content, links, media and names continue to edit shared settings.

Numeric image controls preview immediately and discard drafts on Escape. Only
a committed change upgrades a version-2 page to version 3; cancellation and
no-ops do not create history or change the version. Committed edits and resets
support one-step Undo/Redo and canonical save/reload. The allowlist, validation
and breakpoint rules are unchanged.

Area canvas height displays the resolved Mobile value but remains disabled.
Area geometry, numeric rotation, pointer movement, resize nodes, rotation
gestures, pivot dragging and independent ordering are unsupported Mobile controls
in C2. C3/C4 must supply their approved geometry/order transactions before these
interactions can be enabled. Native visual acceptance remains a human check.
