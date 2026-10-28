# DragonFruit / Fruitform positioning — amended architecture proposal

**Status: amended architecture approved for Milestone 1 on October 27, 2026. The subsequent implementation assignment authorizes the scoped experimental build. See [Milestone 1 delivery and acceptance](dragonfruit-fruitform-m1.md) for implemented capabilities, evidence and remaining human checks. Later phases remain proposals.**

## Verified baseline and amendment boundary

- Repository: `Garfflesnark/widgetizer`; branch: `feature/dragonfruit-freeform-positioning`.
- Rechecked HEAD: `1f7cf968a5cbe0d6a8bab920fa270cd20b4f5a3d`, the merge of accepted DragonFruit PR #1. The earlier investigation found local/cached base refs at that commit; no fresh remote fetch is claimed.
- The earlier proposal-only amendment changed only this document. Its investigation did not modify runtime/project files. Subsequent approved Milestone 1 implementation and installation are recorded separately in the delivery document.
- The running local application remains the accepted DragonFruit baseline. It does not demonstrate Composition Areas or the responsive/layering features proposed here. No new interactive implementation preview exists yet.

The Creative Director has decided: a **Composition Area is a specialized Block hosting explicitly compatible Widgets**, initially Images; overlap is valid; stacking is composition-local and explicit; responsive policy is inherited with per-widget Proportional/Reflow/Custom overrides; Mobile Preview is a distinct editing context. Those decisions supersede the earlier region grouping, source-order-only stacking and universal mobile flow-fallback recommendations.

Verified facts are identified below. All schemas, commands and algorithms that follow are **proposed contracts**, not current capabilities. Remaining recommendations require architectural review before implementation.

## Recommendation

Introduce an opt-in, platform-owned **Composition Area Block** in the page's main-content sequence. It owns compatible child widget references, responsive policy, canvas geometry and local stacking order. Its outer box participates in ordinary document flow; its internal children may freely overlap. Keep accepted image dimensions, alignment, spacing and green resize-pin identities in `settings.image_transform`; store position and responsive presentation separately.

Do not model a Composition Area as an incidental grouping of adjacent flat widgets. It has stable identity, explicit membership, its own controls and an atomic lifecycle. Do not repurpose existing theme-schema `widget.blocks`: those are currently widget-specific subcontent, such as Banner rating blocks, not containers of independently selectable page Widgets. The new platform Block is a separate content concept with an explicit adapter to existing page storage/rendering.

## Verified architecture and relevant seams

| Area | Existing files/functions | Consequence for positioning |
|---|---|---|
| Page model/history | `packages/editor-ui/src/stores/pageStore.js`: `selectTemporalState`, `beginHistoryStep`, `setPage` | History snapshots the whole page, so region definitions and image placement can participate in one atomic conversion/geometry operation. |
| Widget edits | `packages/editor-ui/src/stores/widgetStore.js`: `updateWidgetSettingValues`, `resetImageScale`, duplicate/copy/paste actions; `widgetStoreHelpers.js`: `cloneWidgetWithNewBlockIds` | Current image edits target settings. Placement needs a dedicated action; cloning currently retains arbitrary widget metadata and could copy an orphan region reference. |
| Saved content | `packages/builder-server/src/controllers/pageController.js`: `savePageContent`, `persistPageInSection`; `packages/editor-ui/src/stores/saveStore.js` | The save merges the incoming page with existing data, then writes page JSON through the scoped storage adapter. Page-value comparisons detect more than dirty widget IDs. New metadata can use this path, but needs explicit validation and tests. No new database table is inherently required. |
| Image dimensions | `packages/core/src/runtime/imageTransform.js`: `imageReference`, `transformRect`, `rectTransform`, `isImageTransform` | v2 stores independent %/px axes, alignment, flow insets and optional resize-pin node names. Its current adapter is a flow-layout adapter, not a freeform position model. |
| Geometry and interactions | `packages/core/src/runtime/anchoredResize.js`: `resizeAnchoredRect`, `resizePinnedRect`; `imageResize.js`: `createImageResizeController` | Pure rectangle/pin constraints are reusable. DOM reference measurement and persistence conversion must be supplied by the appropriate flow/freeform adapter. |
| Trusted interaction bridge | `packages/editor-ui/src/lib/imageResizeBridge.js`; `components/pageEditor/SelectionOverlay.jsx` | Existing source/origin, selection, capability, numeric-bound and stale-start checks provide the pattern for movement commits. |
| Selection/morphing | `packages/core/src/runtime/previewRuntime.js`: `setupInteractionHandler`, `updateSelection`, `renderOverlay`, `morphWidget` | Selection uses visible image bounds; the overlay lives inside the iframe. Existing link selection and resize/menu controls need explicit movement arbitration. Morphing/selection changes already cancel resizing. |
| Preview scheduling | `packages/editor-ui/src/components/pageEditor/PreviewPanel.jsx`: `detectChangeType`, update effect | Structural checks currently cover widget membership/order; content checks cover settings/blocks. A new top-level `placement` or page layout change is not included in those checks. Adding fields alone would not correctly update the preview. |
| Page assembly | `packages/builder-server/src/controllers/previewController.js`: page widget loop; `exportController.js`: export widget loop | Both iterate `widgetsOrder` and concatenate independently. A shared region/layout plan is required; shared widget templates alone do not guarantee matching grouping. |
| Rendering | `packages/builder-server/src/services/renderingService.js`: `renderWidget`, `renderPageLayout`; `packages/render-engine/src/renderEngine.js` | Keep region planning/rendering scope-free in render-engine, behind its existing dependency contracts. The widget context currently exposes settings/blocks/index, not arbitrary top-level widget metadata. Pass only validated layout context. |
| Theme boundaries | `themes/arch/layout.liquid`; `themes/arch/widgets/image/widget.liquid`; `themes/arch/assets/base.css` | Layout emits header, main content, footer separately. Images currently have full-section wrappers, container spacing, a resize frame, image/link and optional caption. Absolutely positioning the current full-width section without an adapter risks incorrect hit areas and dimension references. |
| Actual viewports | `PreviewPanel.jsx`, `EditorTopBar.jsx` | Desktop currently fits the pane; the panel has tablet sizing logic but the toolbar exposes desktop/mobile buttons. A narrow editor pane is not a faithful desktop viewport. |
| Distribution | `scripts/dev-theme-sync.js`, `scripts/dev-theme-profiles/arch-image.json`, `themeController.js` | Source, installed theme/latest snapshot and project theme remain distinct. The current sync profile approves only the image schema/template. No broader file synchronization is implicitly authorized. |

## 1. Composition Block identity, ownership and persistence

Recommend an additive, versioned page layout envelope. Existing `page.widgets` remains the canonical registry of widget payloads and IDs, including compatible composition children. Once explicitly opted in, `layout.contentOrder` is the canonical main-content sequence, containing ordinary widget references and Composition Block references. Each child belongs to exactly one Composition Area or one ordinary flow slot. There is no duplicated rendering through `widgetsOrder`.

Example proposed page fragment (ordinary widget settings omitted; every referenced widget must exist):

```json
{
  "widgets": {
    "intro": { "type": "text", "settings": {} },
    "image-a": { "type": "image", "settings": {} },
    "image-b": { "type": "image", "settings": {} },
    "after": { "type": "text", "settings": {} }
  },
  "layout": {
    "version": 1,
    "contentOrder": [
      { "kind": "widget", "id": "intro" },
      { "kind": "composition", "id": "composition-a" },
      { "kind": "widget", "id": "after" }
    ],
    "compositions": {
      "composition-a": {
        "version": 1,
        "type": "composition-area",
        "childrenOrder": ["image-a", "image-b"],
        "stackOrder": ["image-b", "image-a"],
        "responsive": { "defaultMode": "proportional" },
        "profiles": {
          "desktop": {
            "referenceWidthPx": 1200,
            "height": { "mode": "explicit", "valuePx": 800 },
            "overflow": "clip"
          },
          "tablet": {
            "referenceWidthPx": 900,
            "height": { "mode": "derived", "minPx": 0 },
            "overflow": "clip"
          },
          "mobile": {
            "referenceWidthPx": 390,
            "height": { "mode": "derived", "minPx": 0 },
            "overflow": "clip"
          }
        },
        "placements": {
          "image-a": {
            "version": 1,
            "responsive": { "mode": "inherit" },
            "frames": {
              "desktop": { "x": 0.5, "y": 0.15, "pivot": { "x": 0.5, "y": 0 } }
            }
          },
          "image-b": {
            "version": 1,
            "responsive": { "mode": "custom" },
            "frames": {
              "desktop": { "x": 0.3, "y": 0.2, "pivot": { "x": 0, "y": 0 } },
              "mobile": { "x": 0.2, "y": 0.1, "pivot": { "x": 0, "y": 0 } }
            }
          }
        }
      }
    }
  }
}
```

Block membership is defined solely by `childrenOrder`; placement records must match it exactly. `childrenOrder` also defines reading/navigation order and generated Reflow order. `stackOrder` is a separate bottom-to-top permutation of exactly those same IDs. Placement is owned by the Composition Block and keyed by widget ID: no second `regionId` membership source, no arbitrary global z-index, and no layer identity tied to x/y. Stable widget IDs serve as layer identity initially.

On opt-in, initialize `contentOrder` explicitly from current `widgetsOrder`, then replace selected flow entries with a Composition Block at a reviewed insertion location. Preserve the original page in Undo and a backup. Do not require composition children to remain contiguous in the old flat order. For converted pages, retain `widgetsOrder` only as a deterministically maintained compatibility/index projection of `contentOrder` plus child reading order; renderers and editor actions must use the new authoritative plan. Do not let the two orders be independently editable. This projection does **not** make old versions capable of rendering compositions safely.

Pages without `layout` use the existing model unchanged. Adopt the new envelope only through an explicit create/convert action; no scan or load-time migration. Version dispatch must reject unsupported layout versions for editing/export rather than silently rendering a misleading projection. Unknown payload fields must survive supported round trips.

Compatibility is explicit: a renderer capability such as `composition.image.v1` must be advertised by both the platform adapter and the effective project theme before a widget can enter the Block. M1 permits ordinary Arch Images with valid v2 transforms and no rendered caption; unsupported, legacy/v1 or captioned widgets remain functional in normal flow. A future caption capability needs separate visual-image and whole-object bounds.

## 2. Coordinates, dimensions and resize geometry

The origin is the Composition Area's **inner content box**, excluding outer Block spacing. Store finite `x,y` as fractions of the profile's design width on both axes, plus a fractional image pivot. Neither page scroll nor sidebar/header offsets enter persistence. Do not use percentage-of-auto-height coordinates.

At an active profile width `C`, with effective image dimensions `W,H`:

```text
left = x * C - pivot.x * W
 top = y * C - pivot.y * H
```

Desktop canonical image dimensions are resolved using accepted `image_transform` semantics against the desktop reference width, not an already-sized image wrapper. A freeform wrapper must expose only the real object footprint to hit testing, removing the old section's invisible full-width flow slot. The Composition Block supplies layout context explicitly to image rendering and interaction adapters.

Proportional presentation applies one scale `s = C / desktopReferenceWidth` to both the desktop rectangle and the desktop composition height. Example: a desktop image at `(450,180)` with size `300×200` in a 1200px composition appears at `(146.25,58.5)` with size `97.5×65` at 390px. Its saved `300px` dimension remains 300 desktop-design pixels; the composition applies responsive presentation scaling without rewriting that accepted setting. This is an explicit opt-in meaning of Proportional mode, not a change to legacy flow px units. A naive live 390px intrinsic-fit resolution followed by scaling would scale twice and is prohibited.

Position, image dimensions, responsive scale, resize geometry and stacking are distinct. Pure move/resize solvers produce rectangles; a composition adapter converts them to the active frame and, where allowed, dimension values. The existing flow adapter continues using normal-flow insets. Never store freeform x/y in `flowInset`. Avoid hardcoded top-aligned/centered assumptions; pivot and pins specify geometry.

Validation covers version, compatible types, unique ownership, complete order permutations, finite numbers, profile names and frame references. Suggested limits: 20 Composition Blocks/page, reference width/explicit height up to 10000px, stored coordinate precision six decimals, pivots in `[0,1]`. Initially keep object bounds within the composition; coordinates are constrained by the resolved rectangle, not by collision tests. Oversized objects must produce an explicit size/bounds decision rather than silent dimension rewriting. Responsive presentation must not persist transient clamps.

## 3. Mixed responsive policies and batch design

Proposed effective mode: a widget's explicit override, otherwise `composition.responsive.defaultMode`. The three effective values are:

| Mode | Rendering in tablet/mobile | Saved data |
|---|---|---|
| **Proportional** | Uniformly scale the canonical desktop rectangle, including its dimensions and relative position, to the current composition width. Preserve overlap relationships among Proportional children. | Desktop frame and accepted desktop dimensions; no generated mobile frame is saved. |
| **Reflow** | Generate responsive rectangles in `childrenOrder` among Reflow children only. Resolve accepted image dimensions against active profile width, preserving explicit px values subject to existing responsive container limits. Use image spacing as described below. | Mode and stable reading order; generated placement is not persisted as authored coordinates. |
| **Custom** | Resolve a separately authored frame for that responsive profile and optional profile-specific dimension override. | Explicit mobile/tablet frame, optional dimension override, and unchanged desktop source. |

All three modes coexist in one Composition Area. First resolve Proportional/Custom rectangles, then generate Reflow rectangles independently. Reflow uses a deterministic vertical sequence initially; it does not pack around, push, repel or reserve holes for positioned children. It may overlap any Proportional/Custom widget. Overlap and intersecting bounds are valid outcomes; no automatic collision avoidance or mandatory child gap is introduced. Reflow siblings follow their own ordered sequence with user spacing, which may be zero; manual overlapping arrangements use Custom/Proportional mode.

The default policy is recommended to start as Proportional. Changing it affects only inheriting children; explicit overrides survive. The UI must identify inherited versus overridden mode, summarize affected children before assignment, and make a default-policy change one Undo operation. Design commands as `setResponsiveMode(widgetIds, mode)` and `setCompositionDefaultMode(...)`, with validation/atomic history for an ID set. M1 may expose only single selection: do not ship a full multiselect interface yet. Future batch assignment can reuse those commands, including explicit Reset to Inherited.

Custom requires an authored frame for each active responsive profile. On the explicit switch to Custom, capture the current generated rectangle at the profile reference width, storing it in that profile in the same Undo action. For a missing tablet/mobile Custom frame, recommend a visible **Proportional fallback** until explicitly initialized; show that fallback in the editor and use the exact same deterministic rule in export. Never silently create a frame on preview/load. Deleting a custom override must be explicit; dormant frames can be retained for reversible mode changes, with their inactive status shown.

For independent Custom sizing, extend the profile frame with an optional `dimensions` object using the existing validated v2 axis shape, e.g. `width: {unit:"px",value:180}`, `height: {unit:"%",value:60}`. Absence means resolve shared accepted dimensions against the active profile reference width. This is placement-versioned presentation data, not a mutation or reinterpretation of legacy `image_transform`. Desktop settings remain the canonical source for Proportional. Custom axis percentages use the same intrinsic-fit dimensional rule against that profile width; they are not percentages of the desktop rectangle. Units and responsive mode must be separately labelled.

## 4. Mobile editing context and faithful previews

Use actual Arch boundaries: desktop ≥990px, tablet 750–989px, mobile <750px. Mobile Preview while editing a Composition Area selects the **mobile layout context**, not a visually narrowed desktop editing session. Display the active context and effective inherited/overridden mode beside controls. Use real iframe design viewports (recommended 1200/900/390 CSS px) scaled to the editor pane; compare export at identical widths. No editor-only fake breakpoint classes.

Recommended edit rules:

- **Desktop:** move/resize changes desktop geometry. Responsive modes describe how that geometry is presented elsewhere.
- **Mobile/Tablet Custom:** move updates only the active profile's frame; resize/dimension entry updates only its dimension override and frame. It cannot silently modify desktop placement or dimensions.
- **Generated Proportional/Reflow:** selection and inspection are available, but geometry manipulation is read-only. Offer explicit **Customize Mobile Layout** (or Tablet) to capture the current rectangle and switch that widget to Custom atomically, or **Edit Desktop Source** to change context. Do not silently convert a mode, edit desktop, or save generated coordinates when dragging.
- Alignment/Default Scale/dimension controls in a generated context follow the same read-only rule. In Custom they target that profile's geometry only. Shared content edits, such as replacing the source image, remain shared and are labelled accordingly; a source change must not fabricate mobile coordinates.

Green pin IDs remain shared accepted resize-constraint identities. Their effective coordinates are rebased to the active resolved rectangle at gesture start; they are not shared absolute desktop anchor coordinates. A Custom numeric dimension edit preserves the accepted rule of clearing all pins atomically, including their shared identities; the UI must identify this cross-context effect. A pin edit does not move any saved desktop frame. Per-profile pin identities could be a future schema extension, not an implicit behavior.

M1 will show faithful generated Proportional mobile output and the active-context/read-only indication. Custom editing, Reflow controls, tablet authoring and batch UI are later milestones. Implemented schema capabilities must be explicit: do not accept/save unsupported Custom/Reflow data and claim faithful support before their renderers exist. Mixed-mode contracts and fixtures are architectural targets; M1's narrower capability set must be disclosed.

## 5. Bounds, height, clipping and following Blocks

The Composition Area is one normal-flow Block; child movement does not occupy separate flow slots. Its outer top/bottom spacing belongs to the Block, independent of image dimensions and resize insets. Its height is either:

- **Explicit:** the chosen profile's canvas height; Proportional-only responsive presentation derives its height by the same uniform desktop scale.
- **Derived:** resolve all child rectangles without reference to composition height, then use `max(minPx, largest child bottom)` plus explicit Block inner padding. Include Custom, Proportional and generated Reflow footprints, even when they overlap. Do not sum their heights or add collision gaps. Compute stable intrinsic-fit references before this pass; no percentage-of-derived-height dependency.

During a gesture, freeze the initial derived canvas interaction boundary to avoid chasing a moving origin/boundary. Recommend showing a temporary visual overflow outline for a downward extension and committing the new derived extent with the placement action on release; following Blocks then move only as a consequence of the documented derived-height policy. M1 uses explicit height to avoid this complexity. Never auto-grow an explicit canvas behind the user's back.

Recommend **clip at the composition content boundary** initially, combined with interaction constraints that keep images inside. Overlap *between children* remains unrestricted. A local stacking context prevents layer values from escaping to page/header/footer controls. Selection handles are editor overlays and may extend beyond the clipping edge for usability; published content follows the clipping policy.

Future opt-in `overflow: visible` would allow content to paint over following Blocks without increasing explicit flow height; derived height would instead reserve the children's positive bottom extent. Either behavior must be visibly labelled. Do not expose visible overflow in M1, and never enable it automatically. Shadows/filters and future captions need separate visual-overflow/footprint rules. No hidden scrolling canvas is proposed.

Image Top/Bottom Spacing keeps its saved pixel/preset values. In positioned Proportional/Custom modes, treat it as dormant flow spacing, not x/y, canvas padding or `flowInset`; label that state. In Reflow, resolve accepted image-owned spacing in the generated sequence without theme section margins being counted twice; zero adds zero. Define a block-formatting wrapper with non-collapsing spacing and deterministic footprint. Standalone flow rendering remains untouched. Composition Block spacing and image flow spacing require distinct labels.

## 6. Layer management, overlap and selection

`stackOrder` is authoritative bottom-to-top paint order, independent of `childrenOrder`, responsive frames, modes, pin states and dimension units. Render accessible DOM in reading order and assign bounded composition-local stack indices from `stackOrder`, inside an isolated stacking context.

**Bring Forward** swaps the selected widget with the next entry; **Send Backward** swaps with the previous entry. Both are functional in M1, one Undo action each; disable at boundaries and create no history for no-ops. They do not alter coordinates, reading order, responsive policy or alignment. No need to infer which object currently overlaps or build a full layer panel. The same stack order applies across profiles initially; mode changes do not reorder layers. Selecting an image raises only its editor overlay, never its published layer.

Fully obscured images must remain selectable from the composition's child list and movable via a dedicated Move grip. List paint order separately from reading order when both controls are shown; keyboard focus and accessibility order must not be silently changed by paint commands. Later multi-selection stacking must preserve the selected group's internal order. Page-global z-order, rotation and unrelated effects remain out of scope.

## 7. Movement, accepted DragonFruit behavior and history

First click selects, subsequent drag on an eligible selected image or dedicated **Move image** grip moves it after a small threshold (3 CSS px recommended). Hit-test priority: resize nodes → image/alignment menus and controls → move grip → selected noninteractive image surface → ordinary selection. Preserve pin double-click, slider capture, native inputs, links and keyboard Undo/Redo. Standalone/export links remain functional and contain no editing gestures.

Move translates the object and its green pins; pins constrain resize, not movement. Accepted pure resize/Shift solver preserves opposite edges and active pins through a composition geometry adapter, committing dimensions plus frame atomically. Manual dimension edits clear pins in that same action. Unit switches preserve visible geometry under accepted rounding; alignment, Default Scale, spacing and anchors remain separate commands. Recommend alignment sets a horizontal pivot and composition-relative position (left/center/right); later movement translates that pivot freely. Default Scale resets dimensions while retaining the chosen pivot's position and pin identities, subject to explicit bounds. Existing normal-flow semantics remain unchanged.

Use iframe-local pointer coordinates, pointer capture, requestAnimationFrame and transient DOM geometry during interaction. No backend requests or history entries per pointer move. On release validate and commit once; no-op/cancel makes no entry. Escape, lost capture, profile/selection/project changes and destructive morph cancel and restore the initial rectangle. Converting a generated responsive placement to Custom is a separate explicit action, never an accidental side effect of pointer-down.

Validate exact iframe source/origin, project/page/composition/widget/context IDs, capabilities, numeric bounds and stale-start state including dimensions, frame and relevant layout revision. Do not accept CSS/HTML strings. New editor actions update the whole-page temporal snapshot with existing `beginHistoryStep`; quick Undo/Redo must synchronize directly to the iframe rather than wait for a backend morph.

Composition creation/conversion, membership changes, mode assignment, layer commands, move and resize each have atomic history boundaries. Save the layout through existing scoped page JSON persistence, with server-side validation, existing media/limit/write guards and no local-adapter imports into builder-server. Define widget-count limits over all child payloads, not only top-level flow entries.

## 8. Rendering, export, compatibility and distribution

Introduce a scope-free **shared page/composition layout planner** in render-engine, used by both preview and export assembly. Current independent `widgetsOrder` concatenation loops cannot faithfully render the new Block. Supply validated layout context to image adapters; never resolve % dimensions against an already-sized child wrapper. Standalone preview and exported HTML must share responsive mode resolution, intrinsic reference, stacking indices, clipping and height policy.

Prefer static HTML/CSS with no editor JavaScript for published compositions. Proportional can use a design-space inner stage scaled by composition width; every mixed-mode child must ultimately resolve to the same visual coordinate system, so Reflow/Custom are not accidentally scaled a second time by that stage. The precise CSS mechanism is an implementation spike: container-relative units/custom properties or an equivalent shared resolver must express mixed rectangles and derived height consistently. Intrinsic dimensions must come from validated asset metadata with a deterministic fallback. Do not promise mixed-mode/no-JS parity based only on a desktop transform demo; reject or defer unsupported combinations until fixtures pass.

Extend preview change detection for layout envelopes, membership, stack order, policy and profile frames. Move/layer-only updates should synchronize without repeated backend renders; structural Block changes can regenerate preview initially. Single-widget morph already carries the unsaved page: derive its Composition context from that payload, retain wrapper/selection and cancel stale gestures.

No metadata means unchanged legacy output. The new layout envelope is an opt-in persistence change requiring approval; it does not migrate `image_transform` versions or reinterpret old fullwidth/spacing data. Converted pages require an application/theme advertising this capability; old clients must not be allowed to edit/save them as ordinary flat pages. A backup plus compatible app/theme is necessary for rollback. Removing a Composition Area is explicit: either delete its children or return them to normal flow in reading order, never silently discard images. Undo conversion restores exact prior content/settings.

Duplicate/copy/paste/delete/reorder must traverse the new Block and registry consistently. A Composition copy regenerates block/widget IDs and all references, keeps stack and reading permutations valid, preserves overrides/frames, and counts/tracks child media. Cross-page single-image paste without a target Composition must explicitly choose a flow copy or valid destination, never keep a dangling frame reference. Validate ordinary/multilingual page duplication, all child IDs referenced exactly once, global header/footer exclusion and unsupported nested compositions.

After implementation approval, use RESIZE LAB with the guarded development theme sync, backups, conflict detection and rollback. Protect original TEST/PIZZA. The current `arch-image` allowlist covers only image schema/template; any extra effective project theme files need explicit allowlist review. Prefer platform-owned Composition rendering and narrow capability updates. Source, installed theme/latest snapshot and project theme are distinct; development sync is not a production migration.

## 9. Revised first milestone and later phases

**M1: one Composition Area, two independently draggable overlapping Images, functional local stacking.**

1. Versioned opt-in Block/registry/order validators, shared planner, explicit conversion and return-to-flow with backups/history. Eligible v2 uncaptioned Arch Images only; no protected-project writes.
2. One explicit-height, clipped Composition Area in RESIZE LAB, two images, Move grip/body dragging, real opposite-edge/pin resize adapter and all accepted DragonFruit controls. Preserve object bounds separately from Block bounds.
3. Bring Forward/Send Backward, selection of an obscured child, stable reading order and one history entry per effective layer/move/resize command.
4. Composition default Proportional policy, faithful desktop/mobile viewport rendering, read-only generated mobile geometry with a clear future Custom action explanation. No automatic desktop edits in Mobile Preview.
5. Save/reload, static export without editor scripts, following Block stability, scoped theme sync and a real in-Codex application preview once implemented.

No full responsive-authoring suite, batch selection, nested compositions, captions, cross-composition drag, visible overflow, collision engine, page-global layers, rotation or new dependency is required for M1. Persist only supported capabilities; defaults/mode enums alone do not constitute implementation of all three responsive renderers.

**Next phases:** implement deterministic mixed Proportional/Reflow/Custom rendering and derived height with shared fixtures; then explicit mobile/tablet Custom editing and dimension overrides; then multiselect/batch mode assignment and optional advanced overflow. Each phase must preserve earlier saved layouts and disclose its supported capabilities.

## 10. Validation plan and remaining approval decisions

Focused implementation acceptance criteria:

- Legacy flow fixtures and projects render unchanged; no load-time conversion/save; unsupported versions fail visibly.
- Membership/registry references are unique and valid; content/reading/stack orders cannot diverge. Duplicate/delete/paste/page-copy and child-media/limit checks work.
- Two images freely overlap/collide without pushing or mandatory gaps; Bring Forward/Send Backward affect only paint order and persist across save/reload/export/Undo. Boundary no-ops create no history.
- All eight handles, Shift transitions, mixed %/px axes, green pins moving with images, alignment, Default Scale, spacing, numeric/slider capture and native-input shortcuts remain correct.
- Desktop move/resize commits once; cancel/no-op/stale iframe messages do not commit. Scroll and editor zoom do not contaminate coordinates.
- Proportional examples scale both axes and dimensions exactly; no double intrinsic-fit scaling. Preview/export match at desktop/mobile and 749/750/989/990 breakpoints.
- Later mixed-mode fixtures: inherited defaults versus overrides, missing Custom frame fallback, responsive batch assignment atomicity, Reflow overlap with positioned children, generated read-only contexts, mobile-only Custom edits with unchanged desktop bytes.
- Explicit versus derived height, zero spacing, clipping/selection overlays and following Blocks behave as documented; no circular height measurement. Export has functional links, no handles and matching no-JS rendering.
- Guarded development sync has approved files, backups/conflicts/rollback; original TEST/PIZZA remains untouched. Report source, GitHub, local installation and actual browser verification separately.

This documentation amendment does not run feature tests or demonstrate new runtime behavior. Validate the proposal's schema examples and internal consistency only; runtime criteria above remain future acceptance work.

### Decisions already directed by the Creative Director

Composition Area as a compatible-widget-hosting Block; unrestricted overlap between children; initial Bring Forward/Send Backward; independent local stack order; inherited default and per-widget Proportional/Reflow/Custom modes; mobile editing context; an overlapping two-image first milestone. These do not need to be re-decided.

### Remaining recommendations for approval

1. **Persistence:** additive `layout` envelope with canonical `contentOrder`, Composition-owned membership/frames, separate reading/stack permutations, and a maintained legacy order projection. This is a new opt-in platform Block model, not reuse of current theme sub-blocks.
2. **Responsive semantics:** Proportional uniformly scales desktop px and % geometry; Reflow independently generates its own ordered sequence and may overlap positioned children; Custom uses profile-local frames/dimension overrides. Default Proportional, missing Custom frame explicitly falls back to Proportional. Shared pin identities remain labelled across contexts.
3. **Editing rules:** generated geometry is read-only until an explicit Customize action; Custom geometry edits only the active profile. Default Scale retains the placement pivot, while alignment is an explicit repositioning command.
4. **Bounds/height:** M1 explicit-height clipped composition with constrained child bounds; later derived-height/visible-overflow policies as specified. No collision avoidance, and no cross-Block painting initially.
5. **Milestone boundary:** ship two-image movement plus stack controls and Proportional responsive output first; defer mixed-mode authoring/rendering until its full parity tests pass, without pretending all responsive capabilities are already available.

**Review record:** the Creative Director subsequently approved the five decisions above and authorized Milestone 1 through separate implementation instructions. No merge is authorized. Future phases and unsupported persistence capabilities still require explicit implementation authorization.
