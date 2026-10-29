# Wyrmetizer copy-first conversion

Recovered baseline: `e119c288` on `feature/fruitform-image-rotation`. The existing conversion endpoint/dialog was uncommitted together with independent pivot and numeric-editing changes. This delivery commits conversion only; the other work remains in the working tree.

The explicit Convert action posts to `POST /pages/:id/convert-wyrmetizer`. Under the existing project content write lock, the server reads and validates the source and draft, checks the source revision, rejects placement downgrades, validates the paired copy against current media/theme capabilities, and writes a unique `*-wyrmetizer` page with a new UUID and a visible `(Wyrmetizer copy)` name. It never overwrites the source. Existing duplication conventions clear listing-anchor claims on the copy. Unknown layout/placement versions and malformed sources fail closed with recovery information.

The approved Open with Compatible Layout wording and Cancel/Convert actions are retained. Cancel receives initial focus. Unsupported conversion is disabled and keyboard focus remains on enabled controls. A link to edit the copy appears only after success; failure exposes no result link. Opening unsupported pages presents the compatibility notice instead of editable content. No opening action performs conversion automatically.

Targeted checks: the backend conversion test covers separate identity, source-byte preservation, stale drafts, unknown layouts/placements, malformed JSON, and placement downgrade refusal. Compatibility/dialog tests cover Cancel without requests, disabled conversion/focus, successful result links and failure recovery. Native acceptance is not claimed: the previous browser attempt reached an older running backend and returned a missing-route response. Restart the development backend with this commit before human acceptance.

Human acceptance in RESIZE LAB:

1. Open conversion, confirm Cancel is focused, cancel, and verify no page was added.
2. Convert TEST and open the separately named copy; verify the original remains unchanged.
3. Save/reload the copy and switch Flow/Composition; check both arrangements survive.
4. Open an unsupported/malformed format: verify the explanation, disabled Convert and no file change.
5. Simulate a stale source or failed conversion: verify recovery information and no editable result link.

TEST/PIZZA is excluded from acceptance. No merge is authorized.

Focused validation on 2026-10-29: `node --test --test-name-pattern='converts only known source formats' packages/builder-server/src/tests/imageResize.test.js` passed (1 test). Vitest on `WyrmetizerCompatibility.test.jsx` and `ConfirmationModal.test.jsx` passed (12 tests). Targeted ESLint and staged diff checks passed. No full suite, build, or new browser run was performed for this checkpoint. TEST/PIZZA matched all 274 original hashes. RESIZE LAB contains newer edits than the earlier acceptance snapshot; those edits were retained, not restored over.
