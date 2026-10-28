# Wyrmetizer Round 2 architecture amendment

Status: the Creative Director has approved paired persistent layouts, the movable pivot, separate converted copies, new-server downgrade protection, and keeping new-format copies out of older installations. Widgetizer core branding remains unchanged; Wyrmetizer names the branch-added work. New-format writes remain disabled until implementation and validation are complete.

## Final paired-layout decisions

Content is shared; presentation is independent. Keep one canonical page.widgets registry. Proposed layout.version 2 contains a single contentOrder whose Composition entries refer to stable Areas, with each Area owning one children membership list, activeMode (flow/composition), flow.order, flow.presentation keyed by member ID, and composition presentation/placements/stack order/profiles. Both modes reference exactly the same membership. Existing non-Area Widgets remain ordinary Flow entries. Flattening the active arrangement yields widgetsOrder as a validated compatibility projection, never an independent authority.

Presentation fields must be split through an explicit image adapter allowlist, not a copy of all settings: image_transform (including dimensions, alignment, resize anchors and flowInset), fullwidth, legacy dimension overrides and image spacing fields. Shared image source, link, name and metadata remain canonical. Readers/renderers resolve a temporary active Widget view; persisted canonical settings must not become a second authority for presentation. Editing routes presentation fields to the active arrangement and content fields to the canonical Widget. Inactive presentation is neither rewritten nor consulted by rendering.

Mode switching changes only activeMode and the derived order projection. It creates one Undo step, keeps valid Widget selection and never derives authored geometry again. First-time initialization seeds the missing arrangement from the current compatible presentation without moving existing Composition children. Historical Flow geometry absent from legacy files cannot be reconstructed; conversion must explicitly disclose that limitation rather than imply recovery.

Add/duplicate actions associated with an Area create one ID in the membership list and both orders. Flow insertion follows the associated child; Composition insertion uses a deterministic bounded initial position and appends to stack order without moving existing children. Duplicates copy shared content and independently copy both presentations. Deletion removes the canonical Widget and every mode reference atomically under existing confirmation/history conventions. Unassociated additions stay ordinary Flow until explicitly assigned to an Area; ambiguous Area association must be resolved by the editor action context.

The approved placement version 3 rotationPivot contract and compensation equation below remain applicable in the Composition arrangement. Each mode keeps its own presentation through save/reload and Undo/Redo. Unknown layout/placement versions fail closed. No dormantCompositions map will be implemented.

## Actual older-writer compatibility finding

Inspection of PR #2 head 817ba650 and the rotation baseline confirms that validateCompositionLayout rejects layout versions other than 1. However, pageController.savePageContent accepts an explicit layout:null when an existing layout is present; its guard rejects only omitted layout. updatePage likewise validates the submitted result rather than rejecting removal based on the stored version. Therefore an older server can erase new-format layout state through a stale or explicit null write. Version tags alone cannot satisfy an absolute guarantee that old application code cannot discard new records.

Approved safeguard: conversion creates a separately identified copy and leaves the source untouched; new servers reject stripping/downgrading existing new-format layouts, including stale editor requests. New-format copies must not be opened for writing by older installations. This limitation cannot be corrected retroactively by changing only the new reader. The server now checks stored layout versions inside the content write lock and rejects null/version-1 replacements of newer stored layouts; real-storage tests exercise both content-save and page-update routes and assert byte-for-byte source preservation.

Use the approved Open with Compatible Layout dialog wording verbatim. Cancel is default. Enable Convert only for a tested known source version, validate before creating a copy, and leave the original intact on cancellation or failure. Unknown/future formats disable Convert and explain the required compatible version. Application file compatibility and renderer capabilities remain separate checks.

## Historical proposal (superseded)

The following dormant snapshot and restoration sections record the prior proposal only. They do not authorize implementation; the paired-layout decisions above replace their ownership, restoration and membership rules.

## Verified baseline

On 2026-10-28, feature/fruitform-image-rotation at b93cf902 descends directly from the current Fruitform branch and Draft PR #2 head 817ba650e6108736de5c4f4b3ec6b90a01ddda08. PR #2 remains draft, open and unmerged. No repository branding rename or theme synchronization is proposed.

## Dormant ownership and lifecycle

Propose layout version 2 for pages opting into dormant composition data. Keep active compositions in layout.compositions. Add layout.dormantCompositions keyed by original Block ID, each record containing version: 1, a composition snapshot, and per-child composition-only image geometry overrides (image_transform and alignment). Do not copy Widget content or media. A Block ID may exist in exactly one active/dormant map. Dormant membership is historical, not active ownership.

Converting to Flow atomically removes the active Block from contentOrder and replaces it with ordinary Widget entries in child reading order. widgetsOrder is derived from that active order. The dormant snapshot retains placements, rotation, pivot, child/stack order, profiles, canvas height and supported responsive metadata. Shared Widgets remain single canonical objects. Flow rendering and export consume only active records, never dormant coordinates or stacking. Current geometry settings remain available to ordinary Flow controls under their existing semantics.

Restoration consumes the dormant record and recreates the original Block ID. Surviving eligible original children restore their saved composition geometry and overrides. Content, image source, links and other nongeometry Flow edits remain current. Flow dimension edits are not copied over saved composition dimensions; the restoration UI must explain that saved composition sizes are restored. New intrinsic media sizes are validated before restoration.

## Membership and conflict rules

- Deleted children remain absent; historical records do not resurrect Widgets.
- Added or duplicated Widgets have new identities and remain in Flow. They never inherit membership merely through copied settings.
- Surviving children use saved child reading order and saved stack order, filtered to valid identities. Flow reordering does not rewrite dormant composition order.
- Insert the restored Block at the earliest current Flow position of its surviving children. Remove only those children from active Flow entries. Preserve relative order of all other Blocks/Widgets.
- Children already owned by another active Composition are excluded, never stolen. Unsupported types/captions are excluded with an explicit restoration summary.
- If no eligible children survive, disable Restore and explain why. If restoration would violate bounds or metadata constraints, reject atomically and retain the dormant record; do not silently move, resize or delete content.
- Show a pre-restoration summary whenever members are excluded or current Flow sizes will be replaced. Exact restoration needs no additional confirmation.
- New composition membership removes corresponding historical child references from other dormant records in the same atomic action, preventing multiple competing restoration claims. Empty records may remain as disabled history until explicitly discarded.

## History, persistence and compatibility

Flow conversion and restoration each create one history step containing both active and dormant state. Undo/Redo restores both without recomputing geometry. Cancelling restoration changes nothing. Save/reload preserves the dormant record; static export omits it from output and renders ordinary Flow until restoration.

Existing layout version 1 pages remain unchanged. Only a new dormant record promotes a page to layout version 2. New readers accept supported versions explicitly. Older readers must reject version 2 rather than drop dormant data; verify that fail-closed behaviour in the actual baseline before enabling writes. Unknown dormant/placement versions and malformed records fail validation without rewriting the source. No automatic downgrade or destructive migration.

## Rotation pivot contract proposed for approval

Propose placement version 3 with frame.rotationPivot = {x, y}, finite normalized local coordinates in [0,1]. Default for old versions is {x:0.5,y:0.5}. This is distinct from frame.pivot, which remains the existing placement anchor, and from image_transform resize pins. Old readers must reject version 3. Do not implement persisted pivot writes until this contract is approved.

Let L be unrotated top-left, P=(pivot.x*width,pivot.y*height), and R the rotation matrix. Rendering maps local point q to L + P + R(q-P). Changing P to P' without moving the image requires L' = L + (I-R)(P-P'). Re-encode L' with the existing placement anchor. Subsequent rotation holds L'+P' fixed. Use full precision for compensation, with one canonical commit; never accumulate rounded preview deltas. Reset uses the same compensation with the central pivot. Resize keeps normalized pivot coordinates and independently solves the accepted stationary resize pins in transformed space. Translation preserves pivot metadata. Proportional mobile scales the entire resulting geometry. All geometry, hit-testing and export use this same mapping once.

Pivot editing is transient until double-click confirmation: pink idle, green editing plus explicit text/pressed state. Pointer release only finishes a drag segment. Escape, lost capture, context/selection changes, blur or stale revision cancel the whole edit session and restore its baseline. Unrelated clicks cannot commit. Confirm once creates one history step; no-op/reset-at-center creates none. Accessible normalized X/Y inputs participate in the same session. Capture failure cancels safely.

## Validation, backups and rollback

Before writes, snapshot current RESIZE LAB page and hash protected TEST/PIZZA. Never restore an older snapshot over newer user edits. Validate unique active ownership, complete active orders, snapshot IDs, finite normalized pivots, supported adapter capabilities, transformed containment, and bounded record sizes. Validation must run on load/save, conversion/restoration and bridge commits.

Tests must cover deletion/duplication/reorder/content edits, mixed active/dormant ownership, malformed/unknown versions, atomic undo/redo, save/reload, ordinary Flow export isolation, restored export parity, repeated pivot compensation without drift, resize/move/pins, mobile scaling and cancellation. Restore from backup only at an explicitly selected revision, preserving the current file separately. Rolling back application code requires restoring a compatible page backup, not stripping new fields.

## Independent corrections and acceptance

Handle clearance, transient numeric previews and panel styling do not require these schema changes. Numeric draft values must live outside page/history/autosave state; preview messages must be scope/revision checked and cancelled on context changes. Enter/blur commits once; Escape cancels. Incomplete text stays in the input. Height previews update local canvas geometry and dependent positions; committed changes retain validation.

Human acceptance remains required in RESIZE LAB: toolbar clearance at varied angles/zoom/scroll; live Rotation/Height with incomplete input and native keys; one-step Undo; pivot double-click/drag/confirm/reset/cancel; all eight resize nodes and green pins; movement lock and selection hierarchy; Flow edits/restoration; save/reload; Desktop/Mobile preview versus export. Automated pointer tests are not native human acceptance.
