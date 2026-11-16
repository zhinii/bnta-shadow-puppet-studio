# Validation · 16 November 2026

## v0.7.3 automatic joint planning

The new default chain is generated-image acceptance or first artwork upload → cleanup review → cleanup acceptance → automatic joint-plan review. Existing pieces are not silently rebuilt when a new image arrives. Each cleanup and plan still requires its own explicit acceptance; automatic progression prepares the next proposal rather than committing it.

The plan presents numbered dots with add, move, remove, drag and keyboard adjustment. The selected joint shows both overlap layers and can be tested in a temporary preview. Its front/back order can be swapped and retained while the plan is rebuilt. Edits rebuild from the original pre-plan geometry, and do not make further AI calls. All invalid dots must be corrected or removed before the plan can be accepted. One acceptance commits the entire plan in one undo step, preserving the resting pose. A plan with no remaining dots can continue as a still puppet.

AI chooses only from bounded, measured local candidates. The current protected relay uses the student's brief and outline data, not image pixels. A live horse-planning request returned a valid selection of the supplied neck and foreleg candidates in **8.176 seconds**. That single request establishes a working selection contract; it does not establish visual recognition, anatomical accuracy or a general success rate. Provider failure, timeout and invalid selection fall back to explicitly labelled local geometry suggestions; cancellation must not install a fallback.

Magenta mark detection runs locally during planning; black detection is explicitly requested because eyes, buttons and decoration are ambiguous. Detection keeps source pixels intact. Embedded marks remain in exported artwork; editing-overlay numbers are not painted into the image. Geometry checks govern whether any detected mark can become a joint.

**Current verification status:** 231 automated tests pass, including 37 workflow tests. Syntax checks, the production build, generated Worker syntax and the 22-asset Worker smoke checks pass. Live generation, subject cleanup and a three-joint review were observed on the preceding v0.7.1 build. That test revealed incorrect semantic choices and the wide-neck limit, which v0.7.2 addresses in code and regressions. The batch close-up and revised AI selection are not claimed as fully browser-verified. A live v0.7.2 local starter test passed piece selection, 35° sleeve motion, Make, print-document preparation with all eight numbered connections, Cut SVG download and a blank reload. The downloaded SVG parsed successfully (nine cut paths; millimetre dimensions). The operating-system print dialog and physical print were not verified. A malformed settings URL exposed a raw browser error, addressed in the following patch. Browser file-chooser automation repeatedly stalled; current live import, phone/tablet touch, independent student use and physical assembly remain unverified. Automatic approval review rejected an additional live Kimi planner request on project-data transmission authorization grounds; it was not repeated.

### Real generated horse regression

The live generation/cleanup journey produced a 399-vertex horse but initially found no automatic joints. Infinite-line checks were crossing unrelated limbs and mane details. v0.7.2 uses the finite interior section containing each proposed dot, preserves both original contour arcs and rejects invalid or area-changing cuts. Manual whole-line splitting retains its original behavior. The exact image-free outline is retained in `tests/fixtures/generated-horse-outline.puppet.json`. With a 12-candidate budget, a bounded set of valid candidates includes the upper neck/head and front legs; all replay successfully, with unchanged area (296322 artwork units²), artwork associations and physical scale. Keeping large artwork payloads out of repeated geometry copies reduced this fixture’s full-image plan build from about 3.65 seconds to 268 milliseconds in the development environment. These are measured local results, not mobile performance claims.

### Current interface evidence

These screenshots show the v0.7.2 local construction starter, not an AI-generated character.

![Refine: selected sleeve and movement slider](validation/v072-refine.jpg)

![Make: height and primary print action](validation/v072-make.jpg)

## Previous v0.6.1 joint workflow verification

The v0.6.1 change replaced the default two-point cut with **Add a joint → tap once → Try your joint → Use this joint**. A local geometric search proposes a narrow cut, a shared pivot, reinforced overlap on both pieces and an initial front/back order. Joining existing pieces takes one tap on each piece and proposes their anchors automatically. Manual two-point cuts and two-anchor placement remain advanced tools.

Joint review opens with a close-up of the shared pivot and can switch to the whole puppet without changing geometry or the trial angle. It distinguishes the back tab with a solid blue outline and the front tab with a dashed orange outline. Its range slider changes a preview copy; accepting a joint retains the original resting pose. Front/back swapping is explicit. Both printed pieces retain their actual unioned material tabs and matching circular holes; guide annotations are not extra cut lines. The assembly guide names Back and Front for every connection and explains aligned holes and loosely fastened paper pins.

Focused renderer checks passed for material extending across both sides of a split, identical reinforced contours in stage/artwork/print outputs, matching pivot centres through rotation, deterministic layer order, and review annotations excluded from exports. **The integrated v0.6.1 run passes 186 automated tests, including 26 workflow tests. Syntax checks, the production build and Worker smoke checks also pass.** Live desktop browser checks passed for one-tap sleeve placement, preview rotation to 60°, front/back swapping, acceptance returning to the original 0° pose, Make, printable HTML preparation and Cut SVG download. The printable connection guide matched the swapped layer order. Reloading started a blank session. The final close-up and whole-puppet toggle were visually checked, including retaining the 60° trial angle while switching views. No new live image-generation result, phone/tablet usability result, physical prototype or visible operating-system print dialog is claimed here.

The search is geometric, not anatomical. It rejects unsuitable sections instead of inventing disconnected pieces. Numeric limits and clearances are paper-prototype heuristics, not certified material standards. Original artwork is retained; hidden surfaces are not reconstructed. Motion preview remains planar and does not test collision, stiffness, fastener thickness or rod control.

![Live joint overlap review at 60 degrees](validation/joint-overlap-review.jpg)

## Previous v0.5.1 automated checks

**Recorded v0.5.1 verification: 173 automated tests passed, including 22 workflow tests.** Syntax checks, production build and Worker smoke checks passed with 19 public assets. Reproduce with npm run check, npm test, npm run build, and node scripts/smoke.mjs.

Coverage includes arbitrary image-backed polygons; branched and chained connections; exact pivot coincidence under rotation; physical scale independent of pose; pin holes and united overlap tabs; invalid outlines and overlapping holes; locked parts and their ancestors; selected-piece AI edits; exact custom prompts; malformed, truncated and advice-only responses; one bounded AI repair; protected multimodal payloads; image retrieval and visual comparison; origin/request limits; secret exclusion; portable image round-trips; and the three-stage UI event workflow. Legacy IndexedDB transaction utility tests remain, but the application no longer saves projects through those utilities.

The workflow suite covers the complete sequence: generated artwork and custom prompt/preset transport; review, discard and acceptance; local silhouette extraction; splitting with a hinge; adding a control rod; manual width changes and a selected-piece natural-language length revision; proposal acceptance, undo/redo and joint posing; artwork/cut SVG export and print HTML preparation; and explicit project download/import with artwork, dimensions, connections and rods preserved. The generation route uses controlled relay responses and real PNG pixel fixtures in a DOM/canvas double. Text revisions send numeric geometry without image bytes, and local construction/export operations make no additional AI POST requests.

Additional fixtures cover background-removal review, preserved originals and locked artwork, color-region selection, direction selection, attached-piece motion, stale proposals, and selection/import tool resets. Regressions ensure advice-only drawing responses remain visible without an Accept action, Enter/Space activate advertised SVG part/joint controls, keyboard selection requests focus restoration, and clicking a joint opens its child's movement controls without altering geometry. These tests verify event wiring and explicit file round-trips, not actual browser focus, touch interaction, rendering or printing.

Model tests verify stable physical scale when adding, removing, splitting and resizing parts, including a small first piece. Raster tests check enclosed white regions, concave boundaries, disconnected pieces and rejection of unsupported opaque/complex outlines. Renderer regressions verify one closed reinforced boundary at four image resolutions and exact circular pin-hole diameters after artwork deformation. The split/export flow initially exposed a sub-unit segment tolerance defect; it was fixed and is now covered.

The build links modules into isolated scopes, syntax-checks the generated Worker and portable application, and serves both classic and new assets. Smoke tests cover the public assets, both API status routes, CORS preflight, foreign-origin rejection and missing resources.

## v0.5.1 prompt-budget and Create feedback hotfix

A short panda description exposed a route-specific mismatch: the v0.5 adapter expanded 37 characters of student text to a 1,335-character prompt after adding internal generation rules. The known legacy image client limits the complete `/api/puppet/image` prompt to 800 characters, and the service returned the raw error code `prompt`.

The hotfix budgets the entire legacy image prompt at 800 characters. It preserves the exact student text and selected settings; compact internal image guidance is optional and uses only the remaining budget. An oversized required prompt is rejected locally before an image POST rather than truncated or sent with missing choices. The optional v2 route and text-design input retain their 4,000-character limit.

Create now uses the applicable input limit, always shows a live character count and the budget remaining after selected settings, and places request progress/errors inside the form near its action button. The current automated run records prompt-budget, non-truncation, selected-preset and feedback regressions together with the retained session, geometry and lock tests. These are controlled response/event tests, not actual provider acceptance or rendered accessibility evidence.

A network attempt to verify the panda timed out before any HTTP response. No fresh image was returned or assessed. Earlier successful generation trials below remain historical evidence; they do not demonstrate that the 0.5.1 payload or UI has passed a live generation check.

## Previous v0.5 interface and fresh-session revision

The v0.5 implementation keeps **Create → Refine → Make** and replaces the required four-substep Refine navigation with one next action. **Remove extras** proposes the largest connected foreground region after plain-background cleanup. Review can keep additional separate pieces/props or select a different main region. The default review shows the result with an original/result toggle and a clear accept/keep-original choice; a three-way comparison is no longer the default.

**Add movement** opens the two-point split tool. The accepted joint has a compact angle control, with another joint available when needed. Detailed piece controls, image tools, AI dialogue and view tools are collapsed. Make leads with print height and printing; material/file settings remain optional. The UI tests cover these event routes and retain earlier session, lock, review, viewport and export regressions.

These are implementation and automated-event checks. They do not establish actual browser layout, mobile usability, focus behavior, touch precision or print-dialog behavior. No newly rendered screen, mobile or physical-print evidence is available for this revision.

Remove-extras fixtures exercise largest-component selection, manual subject selection and retention of additional disconnected regions. The operation follows pixel connectivity rather than recognizing a person, puppet, prop or anatomical part. Connected decoration remains; separated intentional details require review. Rebuilding pieces has a visible replacement warning and respects locks.

The generation contract preserves the exact custom prompt and selected settings. On the legacy image route, optional compact instructions against unrequested text, stars and borders fit only into the remaining 800-character total budget. V2/text inputs retain the separate 4,000-character limit. No new image output was obtained for the hotfix; prior provider trials remain historical evidence.

Both current and classic editors now keep projects only in the open session. Reloading/reopening starts fresh, including browser back/forward restoration. Explicit Download/Open is the continuation route. The AI endpoint preference remains separate from project content and persists. Former v2 IndexedDB and v1 localStorage project snapshots are cleared best-effort; blocked storage cannot stop the editor and unrelated settings are untouched.

Focused verification completed so far: **12 storage tests** pass, including cleanup success, absent/blocked/error cases and bounded timeout; **21 classic/model/redesign tests** pass, including no automatic restore/write, only the known v1 key being cleared, explicit Download/Open, a fresh second initialization and a back/forward restart request. The current editor's session, review and viewport regressions also pass in the integrated run. These use simulated browser events; no actual window reopening or focus behavior is claimed.

## Working image relay checks

The new editor now calls the existing protected `POST /api/puppet/image` route with `{application,kind:"reference",prompt}`. Three real image-generation requests returned PNG data URLs and identified `wan2.7-image-pro`. A prior capability check timed out before sending the footballer request; retrying with the already verified capability succeeded. The browser now reuses its checked capability while making a request rather than repeating that preliminary network check. A subsequent live capability check correctly reported generation available, editing/vision unavailable.

Two outputs were retained and inspected, and were tested through the new adapter and local geometry tools:

| Prompt | Image response | Visible result | Local construction result |
| --- | --- | --- | --- |
| Blue/yellow footballer with separate ball | 1024×1024 PNG, about 52 seconds | Main costume, two arms/two legs, running pose and separate ball present | Background cleanup found figure and ball; split/hinge, pose, resize and artwork/cut SVG export passed |
| White-coated scholar with exactly six tentacles | 1024×1024 PNG, about 54 seconds | **Failed count:** eight visible tentacles, only one visible human arm | One connected silhouette; geometry-only split, hinge, pose, resize and both SVG exports passed |

The first long-robed scholar request established the live route and PNG response but was not retained for visual assessment; no fidelity claim is made for it. These are small concrete trials, not a general success-rate estimate.

The real image trials used a Node PNG header reader for the adapter, followed by independent System.Drawing pixel decoding for local extraction. Browser image decoding/resizing and UI acceptance are covered by DOM-double tests, not live browser automation. Sampled costume, face and ball pixels stayed unchanged after background cleanup. Physical scale remained unchanged through pose and resizing. Several unsuitable footballer split lines were rejected before a valid simple cut succeeded; the UI now explains that the line must cross one narrow section twice.

Generation is separate from automatic visual evaluation. Returned artwork must be reviewed for anatomy, counts, costume and props; the current review asks students to check limbs, costume and requested props. Editing and vision remain disabled for the generation-only route. No provider credential is exposed and no paid generation call is automatically retried. The Kimi share link supplied by the user yielded only a public app shell; its full handoff text could not be read, so the integration is based on the verified live contract and repository client.

## Earlier live AI checks (before the local image-tools work)

The existing protected service responds at `/api/status` and reports a configured Qwen provider. Real requests tested a footballer with a separate ball, a long-skirt figure with wide sleeves, and a white-coated character with exactly six tentacles.

Early tests exposed instruction conflicts, advice-only responses, zero-area details and crossed ornamental boundaries. The client was refined to preserve the exact request, extract only parseable measurement data, validate complete geometry, and make one correction attempt. The service still retains the old fixed-character system prompt, so compatibility results are not a guarantee that arbitrary prompts will succeed.

The final repeated creation trial returned **3 structurally valid drafts out of 6 requests**: one footballer and two skirt designs. One footballer request timed out. Both tentacle cases still had invalid geometry after the repair and were rejected. This small trial measures structural validity, not visual fidelity or a general success rate. A separate live selected-sleeve revision passed and changed only that selected part.

At that earlier stage, `/api/studio/status` returned **404**, and the new image endpoint had not been deployed on the protected Kimi host. The local environment had no configured provider credential. Image analysis/generation/editing/evaluation tests then used controlled provider responses and established protocol handling only. They did not establish account authorization, output quality or actual live vision; the later real generation trials are documented separately above.

The initial local image-tools release made no live generation requests. The later bridge described above connects Kimi's now-working image route while preserving its classic client. The provider service and model selection are unchanged. Placeholder replacements for the classic app and CSS were restored, and a later syntax typo was repaired.

## Remaining verification

- Earlier browser-control attempts returned `Transport closed`, and the previous audit could not establish rendered usability. v0.6.1 has the historical live desktop observations recorded above; the new v0.7.2 automatic interface is awaiting browser verification. Actual phone/tablet interactions, focus behavior and print dialogs remain separate checks; source tests do not establish them.
- Physical material strength, hole clearance, layered movement, light transmission and rod control require a prototype with the chosen material.
- Add and verify vision/image-editing capabilities separately. Test automatic image critique and selected-region revisions before advertising them. See `integration/IMAGE-HANDOFF.md` and `integration/STUDIO-V2-RELAY.md`.

GitHub Pages publishes the browser application; its successful deployment does not deploy or certify the separate AI service.

The final workflow checks include centred zoom and bounded zoom levels; panning without geometry changes; pointer capture, unrelated-pointer rejection and cancellation; 44-pixel vertex hit regions; keyboard and Shift nudges with stable physical scale; pending-review edit isolation; and a cancelled older AI request completing after a new session starts. Open panels and focused controls are preserved across rendering. Reset also clears the print iframe and transient notices. The earlier v0.6.1 desktop joint flow was checked as recorded above; the v0.7.2 automatic flow awaits browser verification; physical operation and phone/tablet interaction remain unverified.
