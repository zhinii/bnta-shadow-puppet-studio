# Shadow Puppet Studio · validation record

## v0.8.0 release validation scope

This release expands the individual puppet editor into classroom story, character, script, stage, submission and teacher-review workflows.

**Integrated release checks:** **415 tests passed, zero failures**. Syntax checks, the production build, and Worker smoke checks also passed. Tests cover different groups saving concurrently, same-group conflicts, recoverable downloaded drafts, classroom permissions, the iframe editor bridge, image deduplication and teacher review of frozen submissions. Browser rendering, a live class pilot and physical puppet assembly remain unverified. Deployment is recorded separately below when confirmed.

**Live AI validation:** six real text requests and one real stage-image request completed successfully using synthetic prompts. A dialogue-count problem was corrected and retested; the final script contained six spoken lines. The backdrop was visually inspected, but the provider returned a square image despite a landscape request. The stage now displays the complete image without cropping. See [the request and result record](validation/v080-live-classroom.json).

## Automated evidence

| Area | Meaningful checks present in the release | What the check establishes |
| --- | --- | --- |
| Classroom domain | Blank starting work, permissions, independent group progress, bounded restore history, character ownership, stage validation, archive/reopen | Valid state transitions and authority boundaries |
| Submission and grading | Immutable snapshots, outdated status, resubmission history, complete rubric levels, teacher-only confirmation, evidence references, confirmed-only CSV | Saved work can be reviewed without rewriting earlier evidence; unsupported AI scores are excluded |
| Shared API | Teacher ownership, safe class lookup, secret-phrase rejoin, group isolation, grade privacy, reset/session revocation, expiry, origin checks, rate limits | Application access checks hold for the tested requests |
| SQL/R2 adapter | Real SQL adapter behavior against test storage, compare-and-swap revision checks, identity-collision rollback | Storage implementation handles tested transaction/conflict cases; not a deployed D1 load benchmark |
| Controller | Queued saves, simultaneous clients, stale responses, unsaved-draft refresh, reset during an in-flight request | Newer accepted work is not silently rolled back and drafts survive the tested conflicts |
| Rendered workflow | Story → character → embedded puppet save → script → stage → reflection → submit → teacher confirmation → download/open | Buttons, forms and handlers complete the scenario in a DOM harness |
| Editor bridge | Same-origin plus sender validation, explicit embed mode, normalized character load/save, rejection of unrelated messages | Unrelated frames cannot inject project changes through the tested bridge |
| Overlap print repair | Same-piece source bounds, concave-edge rejection, locks, independent layer repair, sample resize/reset, mirror/resize/pose invariance and print export | Selected existing pixels are mapped to the intended overlap without changing connection geometry |
| AI contracts | Bounded custom prompts, structured previews, known stage characters, safe elements, known evidence references, cancellation/errors | Supported edits stay within the application's proposal contract |
| Hosted relay proxy | Fixed upstream, bounded payloads/images, credential stripping, origin checks, timeout/error handling, capability honesty | Browser credentials are not forwarded and unsupported vision/editing is not advertised |
| Portable storage | Roundtrip, duplicate artwork references, malformed/prototype/depth/cycle rejection, unique-byte limits | Reused images need not be copied into every history or snapshot |

### Large-class storage fixture

The bundle test uses **30 distinct approximately 1 MiB artwork strings**, each repeated in current work, five history entries and a submission. The packed document remains **below 32 MiB**, while naive repeated strings would exceed 200 MiB. Roundtrip restores the references correctly.

A normalized classroom fixture also preserves 30 image-backed puppets and their histories. These fixtures check deduplication and bounds. They do **not** demonstrate real-time performance for 30 simultaneous students, image decoding quality, hosted network throughput or memory behavior under every classroom workload.

### Repeatable local checks

```sh
npm run check
npm test
npm run build
node scripts/smoke.mjs
```

The final run should include existing puppet geometry, storage, rendering, AI and workflow regressions as well as the new classroom suites. The build must regenerate the root GitHub Pages entry, the portable puppet editor and the Worker output.

## Production and capability boundaries

- The public GitHub Pages platform can serve the local file workflow. It cannot itself provide durable classroom APIs.
- Shared classrooms require both D1 metadata/identity storage and R2 packed project storage. An unconfigured production route returns an unavailable response; it never silently falls back to an in-memory classroom.
- The retained hosted Site is owner-private at this checkpoint. Student audience access and live multi-device use have not been established by these tests.
- Classroom teacher identity is supplied by the host. Student credentials and sessions are verified server-side; choosing a role in a local file view is not an authenticated classroom session.
- Shared saves use revision checks and periodic refresh, not real-time collaborative editing or CRDT text merging.
- AI generation, image editing and visual analysis remain separate capabilities. A working generation endpoint does not validate hidden-layer reconstruction or anatomical segmentation.
- Named/bend movement controls show the current rig. They do not prove that a printed puppet is mechanically sound.

## Checks still needed before claiming classroom readiness

1. Observe the interface in desktop and phone/tablet browsers, including dragging, focus, keyboard use and print dialogs.
2. Run a real multi-device class-code join/save/conflict/rejoin session against the deployed backend.
3. Verify hosted migration, private/allowed audience behavior, saved-work retrieval and teacher/student feedback boundaries on the actual deployment.
4. Test representative human, animal and unusual characters, including custom prompt compliance and wrong-layer patterns.
5. Print at calibrated scale, cut/assemble rounded overlaps, test pins and rods, and inspect the projected result with a light source.
6. Review cultural references and construction conventions with a practitioner; the app does not certify authenticity.
7. Pilot the rubric and evidence collection with teachers before relying on confirmed scores for assessment.

## Earlier verified work retained

Earlier releases established specific checks, not a universal success rate:

- v0.7.11 removed optional creation settings and stopped legacy hidden values influencing requests. The reported full suite at that release was 308 passing tests; final CI passed.
- v0.7.9 added visible joint-diameter controls, live resizing, fixed shared pivots, lock/undo preservation and current-pose contact warnings.
- v0.7.8 added structured edit recovery, direct mirror previews and printed overlaps. Three authored-vector relay revisions were checked: horizontal mirror, vertical mirror and a 20% width change. Evidence remains in `validation/v078-live-revisions.json`.
- Earlier image-generation trials found that requested appendage counts could be wrong. These results justify student review; they do not establish the accuracy of the new classroom AI tasks.
- Synthetic joint/artwork specimens in `validation/` remain engineering examples. They are not user screenshots, student usability observations or physical prototypes.

Further geometry and construction boundaries are documented in [JOINT-DESIGN.md](JOINT-DESIGN.md), [FUNCTIONALITY.md](FUNCTIONALITY.md) and [UI-UX-AUDIT.md](UI-UX-AUDIT.md).
