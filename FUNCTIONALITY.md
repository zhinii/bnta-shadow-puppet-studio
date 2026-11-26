# Shadow Puppet Studio · functionality and acceptance review

Current implementation: **v0.8.1**. The classroom workflow is **Story → Characters → Script → Design → Stage → Make and submit**. Individual puppet design remains **Create → Refine → Make**.

The reference is **Shadow Puppet Studio – English.pdf**, 17 pages. Implemented controls and automated checks are distinguished from hosted availability, artistic quality and physical validation.

| Area | Implemented functionality | Practical boundary |
| --- | --- | --- |
| Entry and projects | English/Chinese interface, local class-project creation/import/download, direct quick-puppet editor | Local roles are not accounts; closing or reloading does not restore a local project |
| Shared entry | Teacher-hosted identity, class-code lookup, group choice, student name and 8–128-character secret phrase, rejoining a saved class | Public student entry is enabled; class data remains protected by application sign-in and membership checks |
| Story | Editable time/place/characters/plot, optional relay responsibilities, history and restore, AI draft review | No mandatory handoff or all-members-assigned gate; AI suggestions are not accepted automatically |
| Character ownership | Add/edit briefs, claim unassigned characters, teacher assignment/reassignment, character versions | Students cannot edit another student's assigned character; authority is enforced on the server |
| Script | Multiple scenes, setting/dialogue editing, scene versions, bounded AI proposals with accept/reject | Saved-work collaboration, not simultaneous rich-text cursor editing |
| Puppet bridge | Same-origin embedded editor, load character brief/project, save back to the group, return without losing the open editor on save failure | Origin and sender checks reject unrelated windows; incomplete proposals must be resolved before saving |
| Create | Description-only creation, live count/allowance, generation, PNG/JPEG/WebP upload and drawing | Generation may misinterpret anatomy and details; no optional style/world controls |
| Cleanup | Local background removal, tap correction, checkerboard/cut outline, missing props, undo | Connected decoration and similar-colored artwork can need manual correction |
| Joint planning | Candidate-based AI suggestions, editable numbered dots, marker detection, single or whole-plan review | Current text relay uses descriptions and measured outlines, not visual anatomical recognition |
| Joint construction | Separate pieces, rounded overlap on both ends, independent aligned holes, front/back swap, adjustable diameter | Compact circles may retain original split shoulders; contact warnings are not a full motion/collision simulation |
| Joint print repair | Select a print patch inside the chosen piece, adjust sample size, preview/apply/reset/undo; repair follows movement and export | Repeats existing print; does not infer the concealed garment or reconstruct a missing motif |
| Movement | Bend selected joint in either direction, angle control, close-up and restore pose | Uses actual joints rather than inventing human anatomy; students inspect gaps, wrong patterns and unwanted movement |
| Other design edits | Selected-piece AI geometry proposals, actual before/after review, mirrors, dimensions, outline points, layers, locks and rods | Raster changes need a supported image-editing service or deliberate source-artwork repair |
| Stage | Scene backgrounds, image upload/generation, puppet thumbnails, text/shape props, dragging, position/size/rotation/layers, scene preview | Stage uses composed representations; not real-time multi-user animation or physical lighting simulation |
| AI assistance | Structured story/script/stage suggestions, preview/apply/reject, cancellation and stale-proposal checks | Advice-only replies do not count as changes; supported capabilities depend on the connected relay |
| Make | Physical size, material/hole settings, geometry validation, artwork/cut SVG, A4 tiled print, ruler and assembly order | Printing, materials, control rods and backlit performance still require real trials |
| Reflection | Individual contribution, references and testing records | Self-reported evidence is not independently verified performance or effort |
| Submission | Immutable submitted snapshot, outdated status after edits, explicit reopen/resubmit and prior-version review | Submission does not certify fabrication success; bounded history limits are explicit |
| Teacher management | Class create/rename/archive, group and roster editing, member movement, secret-phrase reset | Server identity controls teacher access; moving a member changes current access without rewriting historical submissions |
| Assessment | Five editable rubric criteria with 0–4 descriptors, group/individual targets, draft/confirm, snapshot-linked evidence, CSV | AI supplies evidence-linked formative comments, never numerical scores or unobserved judgments |
| Shared saves | D1 identity/revision metadata plus R2 packed documents, hashed secrets, expiring sessions, server-side authorization and optimistic concurrency | Requires both bindings; no in-memory success fallback in production; full classroom load/recovery testing remains pending |
| Portable storage | Explicit classroom and puppet files, repeated artwork stored once across history and submissions | No browser project autosave; fresh local sessions remain intentional |

## Coverage against the PDF

| PDF pages | Proposed area | Implementation decision |
| --- | --- | --- |
| 1–2 | Student sign-in and group selection | Implemented for shared classes with a secret phrase, not name-only impersonation; local file mode remains explicit |
| 3–5 | Story relay and history | Implemented with optional responsibilities and parallel work |
| 6 | Character assignment | Implemented without waiting for every member before scriptwriting |
| 7 | Scriptwriting | Scene editing and AI proposals implemented; rich-text formatting and live cursor presence are not claimed |
| 8 | Character design with AI | Existing image/geometry editor integrated into the group project; actual supported proposals must be reviewed |
| 9–10 | Breakdown and local correction | Joint manipulation, overlap sizing and per-piece pattern sampling implemented; semantic clothing-layer reconstruction remains open |
| 11 | Motion testing | Actual-joint bend/reset controls implemented; no invented anatomy or automated declaration of physical success |
| 12 | Stage creation and submission | Scene composition, background generation, preview and immutable submission implemented |
| 13–15 | Class/group/project administration | Implemented with owner and group boundaries, revision checks and submitted-version review |
| 16–17 | Teacher scores and comments | Explicit rubric, teacher-confirmed scores and evidence-linked formative AI comments replace unsupported automatic grading |

See [UI-UX-AUDIT.md](UI-UX-AUDIT.md) and [VALIDATION.md](VALIDATION.md) for the basis and limits of these claims.
