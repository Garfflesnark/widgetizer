# Wyrmetizer Geometry Ownership Contract

Status labels used here:

- **Implemented** — represented in the current schema or enforced by current code.
- **Established contract** — required behavior for accepted operations; covered
  where noted, but not a claim that every future interaction exists.
- **Proposed** — future behavior requiring implementation and approval.
- **Pending test specification** — intended regression coverage for proposed
  behavior; it is not an executable passing test or evidence that the feature
  exists.

## Canonical ownership

| Rule | Status | Current meaning |
|---|---|---|
| Widget identity, content, and media references are shared. | **Implemented** | Mobile patches contain presentation values, not duplicate Widgets or media/content settings. |
| Desktop owns Desktop Composition geometry, rotation, rotation pivot, reading order, and stack order. | **Implemented** | These remain in the Desktop Area geometry. Existing Desktop geometry and manipulation contracts remain authoritative. |
| Mobile size and supported presentation values can be separately overridden. | **Implemented** | Sparse patches are stored in the root or Area/mode Mobile presentation owner. |
| Mobile Composition geometry can be stored independently when present. | **Implemented** | The v3 optional geometry stores canvas height, reading/stack order, positions, and placement anchor pivots. An explicit action snapshots current resolved positions; Mobile x/y edits use atomic Mobile-only transactions. |
| If Mobile Composition geometry is absent, positions and anchor pivots inherit proportionally from Desktop. | **Implemented** | The read-only resolver maps Desktop anchors to the 390px Mobile reference width. Desktop rotation and rotation pivot also remain inherited. |
| Switching the viewport presentation does not edit authored page data. | **Implemented** | Resolution and preview synchronization operate on disposable views. Presentation changes alone must not create page history or dirty/save state. |
| For an accepted operation, live preview, resolved geometry, and committed state agree for the active presentation. | **Established contract** | The preview sync is presentation/epoch/revision guarded. Rejected or stale work must not be treated as a successful commit. |
| A rejected operation leaves page data, revision, history, and dirty state unchanged. | **Established contract** | Existing Mobile size validation rejects before page commit; structural operations must follow the same atomic rule. |
| A Mobile operation never changes Desktop-authored geometry. | **Established contract** | Current supported Mobile size transactions write Mobile presentation patches. Any future Mobile geometry transaction must preserve the Desktop Area record byte-for-byte/structurally. |
| Placement `pivot` and rotation pivot are distinct. | **Implemented** | Placement `pivot` is the normalized anchor used to position the image rectangle. `rotationPivot` is the transform origin in the Desktop frame. Current Mobile geometry has only the former; it does not own the latter. |

The v3 Mobile geometry structure is optional. Existing v2 and v3 pages without
it retain the proportional fallback; presentation resolution does not
initialize or persist geometry.

## Ownership paths

- Shared content and media: `widgets[widgetId]`.
- Desktop root order and Area order: `layout.contentOrder` and each Area's
  Desktop arrangement.
- Desktop Composition: `layout.areas[areaId].composition.geometry`, including
  Desktop frames, rotation, rotation pivot, and stack order.
- Desktop Flow: `layout.areas[areaId].flow`.
- Mobile standalone presentation: `layout.mobile.presentation[widgetId]`.
- Mobile Area Flow: `layout.mobile.areas[areaId].flow`.
- Mobile Area Composition presentation: `layout.mobile.areas[areaId].composition.presentation`.
- Optional Mobile Composition geometry: `layout.mobile.areas[areaId].composition.geometry`.
- Mobile root arrangement: optional `layout.mobile.rootOrder`.

Mobile Composition geometry currently has `heightPx`, `readingOrder`,
`stackOrder`, and per-Widget `x`, `y`, and anchor `pivot`. Position coordinates
may use pixels or percentages. It does not store independent width/height
frames, rotation, or rotation pivot; image sizing is represented by Mobile
presentation patches. The resolver currently sources rotation and rotation
pivot from the Desktop frame even when a Mobile placement exists.

## Root-to-Area ownership transfer — implemented in M6A

New-Area creation and inclusion in an existing Area clone and validate the
candidate before returning it. A root Mobile patch is copied to the destination
Area's Mobile Flow and Composition presentation owners, then removed from the
root owner. Existing patches for other Area members are retained. When
`mobile.rootOrder` exists, creation replaces transferred root Widgets with the
new Area at the first transferred slot; inclusion removes the transferred
Widgets. All remaining root entries keep their relative order. Mobile Flow
order is extended when needed to retain the moved Widgets' relative order.

Inclusion is atomically rejected when the destination already has independent
Mobile Composition geometry: its complete geometry has no placement for the
new member, and M6A does not guess or initialize one. The user must reset that
Mobile geometry before retrying. The editor also resolves the full Mobile
candidate with matching cached image dimensions before committing, so a
transferred size patch that makes the Mobile Composition invalid is rejected.

### Standalone Widget to a new Composition Area — implemented

- Remove its root Mobile presentation patch and place equivalent patches in
  the new Area's Mobile Flow and Composition presentation owners. This
  preserves values when the user switches the Area's mode.
- Replace the moved root Widget entries in `mobile.rootOrder` with the new Area
  at the first moved entry's position. Interleaved entries are supported, and
  every non-transferred root entry retains its relative order.
- Preserve the moved Widgets' relative root order in the Area's Mobile Flow
  order when it differs from Desktop Flow order.
- Do not initialize independent Mobile geometry as a side effect of the move.

### Standalone Widget to an existing Area — implemented, with a geometry limit

- Transfer its root Mobile patch to both Mobile mode owners for that Area.
- Remove the Widget from `mobile.rootOrder`; the existing Area root entry stays
  in place.
- Insert the Widget into Mobile Flow reading order and Composition reading and
  stack orders using a documented deterministic rule. If the source root order
  cannot be represented inside the Area without changing effective order,
  reject atomically.
- If the destination has independent Mobile Composition geometry, reject with
  an actionable error rather than synthesize a Mobile placement. The geometry
  structure requires placements for every member.

### Area Widget to standalone

- Re-home an identical Mobile presentation patch to the root owner only when
  the Flow and Composition Mobile patches can be represented by one root
  patch. If they differ, require an explicit choice or reject; do not select
  the active mode silently.
- Insert the Widget in `mobile.rootOrder` using a recorded/restorable root
  position. Remove it from the Area's Mobile reading order, stack order, and
  geometry.
- If the Mobile placement cannot be represented as standalone responsive
  flow, explain the loss and require an explicit reset/confirmation in a later
  approved feature; M5 defines no such UI.

### Widget between Areas

- Transfer each mode's Mobile presentation patch to the corresponding target
  mode, preserving independent Flow and Composition values.
- Leave `mobile.rootOrder` unchanged because both Areas remain root entries.
- Remove the Widget from source Area reading/stack order and geometry, then add
  it to target Area orders and geometry. Preserve its Mobile placement only if
  valid in the target canvas; otherwise reject atomically.

### Remove or delete

- Removing a Widget from an Area means Area-to-standalone transfer and follows
  that contract. Restoration records must retain enough Mobile state to make
  a later re-include lossless, or the remove must reject when it cannot.
- Deleting a Widget deletes its owned Mobile patches and removes its ID from
  root order, Area order, stack order, placements, and restoration records.
  No stale Mobile references may remain.

Area-to-root, Area-to-Area, and remove/delete transfer rules below remain
**proposed**. The root-patch ownership validator correctly rejects a patch
whose Widget is no longer a standalone root; M6A routes root patches to their
Area owners before final validation.

## Explicit Mobile initialization — implemented in M7

The deliberate **Customize Mobile Layout** action for a v3 Composition Area
resolves current Mobile output with matching available image dimensions, then
snapshots Mobile canvas height, positions, anchor pivots, reading order, and
stack order into the existing optional v3 Mobile geometry structure. It rejects
empty Areas, invalid bounds, or inherited positions that cannot fit the Mobile
geometry contract. The snapshot and later x/y placement edits are atomic and
undoable. Presentation patches, including size/scale overrides, remain in their
existing Mobile owners.

The snapshot does not alter Desktop geometry, rotation, rotation pivot, or
ordering. It is never run during viewport switching, rendering, or image
measurement. Pages without explicit Mobile geometry continue proportional
inheritance. Mobile x/y controls are available only after explicit
customization; changing a position validates the resolved Mobile bounds before
commit. Resetting Mobile Composition presentation overrides preserves explicit
Mobile geometry.

Reset behavior remains limited:

- Per-property reset leaves geometry and unrelated overrides unchanged.
- Current Mobile Composition mode reset removes its presentation/order patches
  but keeps customized geometry. There is not yet a separate reset-to-inherited
  geometry action.
- Undo restores the exact previous Mobile geometry and patches.

Independent Mobile rotation and rotation-pivot ownership remain a separate
**proposed** schema and interaction decision. They must not be inferred from
the placement anchor `pivot`.

## Pending test specifications

Specifications below remain pending unless marked implemented.

1. **Area to root:** Preserve identical mode patches and restorable root
   position; reject differing/unrepresentable mode values unless the caller
   makes an explicit choice. Restore all state with Undo.
2. **Area to Area:** Transfer both mode patches and valid Mobile placement,
   update source/target reading and stack orders, and preserve root order.
   Invalid target bounds reject atomically.
3. **Remove versus delete:** Remove retains restorable Mobile state; delete
   removes every Mobile reference and does not leave orphan IDs.
4. **Customize Mobile Layout — implemented in M7:** One action snapshots
   resolved Mobile values, creates one history step, leaves Desktop geometry
   and resolved Desktop output unchanged, and round-trips through save/reload.
   Switching or image loading alone does not initialize geometry.
5. **Independent geometry — partially implemented in M7:** Mobile x/y position
   edits and existing Mobile size patches can change without changing Desktop
   output. Mobile geometry stores anchor pivot and orders, but editor controls
   for editing those values and a reset-to-inherited action are not present.
6. **Independent rotation (future schema decision):** Mobile rotation and
   rotation pivot have distinct Mobile-owned fields, survive round-trip and
   reset, and do not change Desktop rotation/pivot. Anchor pivot remains
   independent. Do not enable this test until the schema and controls are
   approved.

## Current applicable regression coverage

Current passing tests cover Mobile presentation validation and resolution,
proportional inheritance, optional Mobile geometry, atomic supported Mobile
size edits, root-to-Area patch transfer with and without `mobile.rootOrder`,
interleaved root ordering, no duplicate root/Area patch ownership, rejection
when the destination has independent Mobile geometry, non-mutating resolver
behavior, explicit Mobile geometry initialization and x/y edits, bounds
rejection, save/reload and Undo/Redo, responsive message staleness, Mobile
ordering rejection, and Desktop ordering after Mobile sync rejection.
Desktop rotation, pivot relocation, release, and preview stability are covered
by the existing Desktop tests. Area-to-root/Area-to-Area transfers and
independent Mobile rotation remain pending.

## Follow-up boundary after M6A

M6A is limited to root-to-Area transfer. Keep Area-to-root and Area-to-Area
transfers and independent Mobile rotation separately scoped. Existing
independent Mobile Composition geometry remains a documented inclusion limit
and must not be silently rewritten to make a transfer pass.
