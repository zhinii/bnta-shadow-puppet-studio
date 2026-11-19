# UI/UX re-audit — simplicity first

## Current v0.7.10 understandable creation options - 19 November 2026

Removed the four construction starter buttons. Renamed World to Time or setting and Style to Artwork style. Each choice has a short explanation; the default Use my description adds no extra setting. The panel explains that choices guide the next generated image and do not change accepted artwork. English and Chinese copy were updated. Tests verify every option reaches both image routes and text drafting, that student wording stays intact, and that changing choices leaves existing parts unchanged. This verifies wiring and behaviour, not model obedience or a live visual comparison.

## Previous v0.7.9 visible joint size - 19 November 2026

Students could not discover the numeric size field inside collapsed controls, and the full-width minimum prevented shrinking many default circles. Joint size now appears beside movement in single-joint review, the automatic plan and the selected-piece inspector. A Smaller/Larger slider and millimetre input resize both tabs; the pin stays fixed. Dragging updates artwork immediately without replacing the active slider. Close-up framing stays fixed on input and release. Changes remain reviewable or undoable and are retained in downloaded projects.

Contact with another separate piece is flagged in the trial pose. Compact circles keep original cut shoulders, with a short movement-check hint; the application does not silently trim artwork or infer garment ownership. Automated interaction and accessibility-markup checks pass. Browser connection failed, so mobile rendering and classroom usability remain unverified.

## Previous v0.7.8 change preview and printed joints - 19 November 2026

The reported Preview change failure had two concrete causes: structured edits were embedded in prose, and suggested negative dimensions/axis fields were unsupported. Validated Parts arrays are now read, unsuitable replies receive one correction request, and unchanged/advice-only results show a short failure instead of a large green prose banner. Direct Flip left–right and Flip up–down buttons open the same review/apply/undo flow without a relay call. Both source artwork and its cut outline move; the incoming pin remains fixed. Review focuses the preview and hides the unedited reference overlay.

Rounded overlap ends now duplicate nearby printed artwork on both layers instead of defaulting to orange material. The source region is restricted to connected pieces, with nearby reflected/repeated print used for new areas. Plain shapes retain their color. This is pixel reuse, not hidden-image reconstruction.

The three prior bad formats (axisAngle, negative width, polygon-only mirror) have targeted regressions. Three live synthetic relay requests passed before the development host disconnected: horizontal flip, vertical flip, and 20% width increase. No current user project or image was sent. Recovered code and the added renderer are checked in GitHub CI. Real browser/touch usability and physical backlit printing remain unverified in this release.

16 November 2026. Based on the student's mobile horse screenshot, the current application source, and the earlier concept images.

## Previous v0.7.7 joint review — 19 November 2026

Full-width round ends replace the small default disk on new splits. Joint size is a collapsed, optional control in the batch plan, single-joint review and accepted-piece inspector. Its diameter is distinct from the pin hole; invalid changes are rejected without replacing the current proposal. Selected joints show both material layers. Piece / overlap color describes the flat material added beyond original image pixels. Direct outline edits show a size/movement review reminder. Create → Refine → Make remains unchanged.

Automated evidence is in VALIDATION.md. This release could not be visually exercised in the available browser environment; no new desktop/phone/student usability result is claimed. Physical samples and practitioner review remain necessary; see JOINT-DESIGN.md.

## Previous v0.7.6 middle-school recovery audit · 17 November 2026

The panda feedback exposed a discoverability failure: background selection was hidden, and an image rectangle could be treated as a puppet outline. The revised cleanup screen names the task, places background selection beside the image, previews empty space and the actual cut edge, and makes mistakes reversible. Suspect rectangles pause before joints. Failed image-based joint plans offer **Fix background**.

The [middle-school audit](MIDDLE-SCHOOL-UX-AUDIT.md) records the findings, corrections and acceptance scenarios. All **250 automated tests pass**, including **45 workflow tests** and a cross-module reproduction in which the same knee is rejected before background repair and valid afterward. This is expert inspection and software validation, not an independent student usability result. Phone touch and a short classroom trial remain necessary.

## Previous v0.7.5 continuation audit · 17 November 2026

**Verdict:** the three-process workflow is suitable for a supervised trial. This pass fixes concrete failure/recovery and small-screen interaction issues; it does not establish automatic anatomical accuracy or independent student usability.

| Finding | Correction | Evidence |
| --- | --- | --- |
| An early Create click could start a text draft before image capability resolved | Show connecting/allowance feedback and wait for capabilities; keep uploads and starters available | Delayed-response, submission and endpoint/session regressions |
| Swiping blank joint artwork could block page scrolling | Permit vertical pan on blank artwork; reserve dragging for dots | CSS/event checks; real touch remains unverified |
| Resizing could shrink dot hit targets | Recompute targets after layout and resize while retaining focus and trial state | 44 CSS-pixel targets at 366, 820 and 320 px test widths |
| Drawing a blank shape displayed unrelated image-cleanup controls | Hide the inspector during drawing and use the full canvas; restore editing controls after Finish | Drawing, Cancel and Finish regression |
| Empty plans told students to drag nonexistent dots | Explain the empty state and prioritize Add your first movement point; still-puppet output remains available | Workflow regression and live remove/add-dot recovery |
| Deleting the last valid suggestion incorrectly claimed no automatic joints had been found | Remove the duplicate failure claim and keep neutral recovery guidance; use the singular “1 joint ready” | Initially empty and last-dot deletion regressions; copy polish follows the v0.7.4 live check |
| A valid branch could fail after another valid cut | Evaluate broad-cut eligibility against the same cut in the original outline | Six geometry regressions, unchanged safety/validity guards |
| A still-puppet response arrived as prose and triggered joint fallback | Add an explicit structured zero-joint example; keep rejecting non-structured advice | Final live synthetic relay run: 3/3 expected selections |

241 automated tests pass, including 41 workflow tests. A live v0.7.4 browser journey carried a newly drawn strip through AI selection, removal/replacement of a dot, joint close-up, 35° motion, front/back swapping, rest-pose acceptance, Make, print-document preparation and Cut SVG download. Switching between close-up and whole-puppet view retained the trial angle; swapping front/back reset it to 0° before retesting. The print document showed matching #1 holes, two labelled pieces, back/front layer order, a 50 mm ruler and overlap assembly instructions.

The v0.7.4 screenshots in [VALIDATION.md](VALIDATION.md) precede v0.7.5’s singular-count and empty-state copy polish. No fresh image generation or file upload was tested in this continuation. Live outcomes are scoped to synthetic strips; realistic character anatomy, phone/tablet touch, independent student usability, physical assembly and actual printing remain unverified. See [FUNCTIONALITY.md](FUNCTIONALITY.md) for the inventory.

## Previous v0.7.3 audit and verdict

**Verification:** 231 automated tests pass, including 37 workflow tests; syntax, production build and Worker smoke checks pass.

**Verdict:** the software supports the requested three-process design workflow and is ready for a supervised trial. Fully automatic anatomical rigging and independent student usability are not established. AI proposes movement; students still review the character and joint positions. See [FUNCTIONALITY.md](FUNCTIONALITY.md) for the complete inventory.

| Goal or usability issue | Finding and correction | Evidence / remaining limit |
| --- | --- | --- |
| Simple Create → Refine → Make | Generation/upload advances to cleanup review; accepting cleanup prepares the joint plan. Advanced tools stay collapsed | Automated workflow checks; live generation, cleanup and joint-review observations |
| Custom prompts retained | Added an explicit generation-brief assignment so an undo-restored brief cannot displace the visible prompt | Exact English/Chinese prompt transport, rejection and cleanup regressions |
| Automatic splitting on real characters | The first detailed horse initially had zero suggestions because an infinite cut crossed unrelated limbs. Finite local sections preserve original contour arcs | Exact 399-point real outline fixture; all retained candidates replay without area loss |
| Wide necks and garments | A second horse had a valid 74–80 mm neck but exceeded the earlier 60 mm limit. Expanded to a bounded 90 mm branch section with area guard and review warning | Exact 469-point fixture; head/foreleg replay, 80 mm garment, torso rejection, 95 mm rejection |
| Follow requested movements | A live text-only selection chose unrelated body regions. Tightened minimum requested-movement selection and added measured candidate-region descriptors | Local payload/selection tests pass; revised semantic selection has no new confirmed live result |
| Easy joint corrections | Numbered dots support add/move/remove, drag and keyboard. Invalid positions visibly block acceptance | Pointer, keyboard, invalid placement, cancellation and stale-response regressions |
| Clear front/back overlaps | Selected joint shows both material outlines, layer swap and temporary movement | Chain-order regressions, geometry/export tests; no physical strength claim |
| Small joint detail | Added selected-joint close-up and whole-puppet toggle, preserving trial angle and accepted geometry | Automated viewBox/pose/focus regression; real phone/touch use remains unverified |
| Unnecessary controls | Removed duplicate silhouette extraction while retaining one reachable extraction action in each relevant stage | Existing-image/locked-piece workflow regression |
| Responsive corrections | Geometry builds avoid repeatedly copying full artwork payloads | First image-backed horse plan reduced from about 3.65 s to 268 ms locally; not a phone benchmark |
| Settings recovery | Validation is visible inside the modal, corrected values clear old errors, Escape closes the modal without resetting joint review | Automated error/recovery/focus regressions |
| Fresh sessions | Closing/reloading does not restore a design; explicit project download/open remains | Automated lifecycle checks and observed blank live reloads |
| Make usable output | Physical sizing, cut/artwork SVG, A4 print document, calibration and assembly order are implemented | Automated exports; v0.7.2 browser starter motion, Make, print-document and Cut SVG checks; physical prototype outstanding |

A final v0.7.2 live local-starter journey verified piece selection, 35° motion, Make, printable connection instructions, Cut SVG download and a blank reload. A malformed settings URL exposed one additional raw technical error. v0.7.3 replaces it with readable bilingual guidance; the final live check confirmed the corrected message, Escape and dismissal recovery, 37 / 800 prompt counter, and local starter selection/motion.

Two real generated horses were inspected during this audit. The second reached an AI-selected three-joint review; its selected regions exposed the semantic-selection weakness recorded above. Browser file selection repeatedly stalled in the test tool, so current live file-import verification remains incomplete. This is not evidence that the application import handler failed. No phone, tablet, independent student session or physical assembly result is claimed.

Automatic approval review rejected an additional live Kimi planner test, citing insufficient authorization for sending project geometry to that destination. The request was not repeated. At that v0.7.3 audit, revised AI selection was reported as locally tested rather than live verified; the later synthetic-only checks are recorded above.

## Previous v0.6.1 joint revision

The latest feedback identifies two linked problems: placing pivots is difficult, and the student must understand which material lies over and under the joint. The default flow is now **Add a joint → tap where it should bend → Try your joint → Use this joint**. The app chooses a simple narrow cross-section and builds the shared pivot and both overlap tabs. The student reviews the result instead of locating two exact anchors.

| Task | Current simple flow | Optional correction |
| --- | --- | --- |
| Make a connected limb bend | Tap once on a narrow limb, neck or tail; inspect the proposed joint | Choose another spot; manual cut line under More editing tools |
| Connect separate pieces | Choose Join two existing pieces, then tap each piece once | Manual two-anchor placement under More editing tools |
| Understand the overlapping material | Default close-up with solid blue back-tab outline, dashed orange front-tab outline, one shared hole | Swap front / back under Adjust joint |
| Check motion | Move the review slider through the proposed range | Accept keeps the original resting pose; Keep original discards the proposal |
| Assemble | Keep both printed overlap tabs; use the labelled Back/Front order and matching hole numbers | Test a paper fastener loosely enough for rotation |

This reduces precision work while retaining the student's choice of bend location and acceptance. It does not identify anatomy automatically. Failed narrow-section searches leave the design unchanged and offer a new location or manual construction. Added tabs supply physical material, not reconstructed artwork from behind a sleeve or limb. Numeric defaults are paper-prototype heuristics, not universal material standards.

**Verification status:** v0.6.1 passes 186 automated tests, including 26 workflow tests, plus syntax, production build and Worker smoke checks. Live desktop checks passed for one-tap placement, rotation, front/back swap, rest-pose acceptance, print-document preparation, Cut SVG download and a fresh session after reload. The original whole-puppet preview made the tab markers too small; the default close-up was added and visually verified, with a whole-puppet toggle that preserves the trial angle. The historical records below do not establish current phone layout, real touch accuracy or physical assembly. Phone/tablet layout, touch accuracy and a printed prototype remain to be checked.

Additional acceptance checks for this revision:

- A student can create the first joint with one canvas tap after choosing Add a joint.
- Both overlapping material layers remain distinguishable around the shared hole, including when the two tab boundaries coincide.
- The motion slider tests a temporary preview; accepting does not accidentally save the test angle.
- Front/back swapping agrees with the assembled artwork and printed connection guide.
- Failed suggestions explain the next action without requiring the student to understand anchors, graph direction or polygon intersections.
- Manual cut lines, precise anchors and numerical settings stay outside the default task.

## Previous v0.5.1 prompt and counter correction

The panda screenshot exposed an oversized generation request: 37 characters of student text became 1,335 after internal instructions. The legacy image adapter now uses the classic client's 800-character complete-prompt budget, preserves student text and selected settings, and adds compact guidance only if it fits. The optional v2/text route still accepts 4,000 characters. Oversized required content is rejected locally; raw service codes become readable English/Chinese messages.

Create always displays the current count and allowance beneath the prompt, adjusts the allowance for presets, and places progress/errors beside the Create button. The full source is checked through repository CI because the local workspace disconnected after focused AI/workflow checks. A live panda request timed out before an HTTP response; live generation and phone rendering remain unverified.

## Judgment
The v0.4 interface did not meet the intended simplicity. Larger text and buttons improved legibility, but students still encountered an editor's tool inventory before a clear task. The v0.5 implementation below reduces the default choices, gives the character the main workspace and keeps one primary next action. Passing functional tests does not establish rendered usability.

The supplied screenshot shows eight canvas controls above the artwork, extraneous calligraphy/stars/a border within the artwork, and “40 pieces · 0 joints.” These are detected image fragments, not evidence of a usable articulated puppet.

## Required changes

| Current issue | Required default behavior | Optional location |
| --- | --- | --- |
| Artwork/Shadow, Joints/Reference, minus/plus, Fit and Pan compete with the image | Automatically fit the character. Show one current instruction and one primary next action. | One View tools disclosure |
| Four Refine substeps sit inside the three main stages | Keep only Create → Refine → Make. Guide the active task in context. | Advanced editing tools |
| Full parts list, properties, dimensions and dialogue appear together | Show only the selected piece and its relevant control, such as a joint-angle slider. | Choose a piece, Adjust this piece, Ask AI |
| Piece counts and physical dimensions appear while the student is still preparing artwork | Remove these from the default canvas footer. | Pieces list and Make |
| Decorative material is converted into many pieces | Confirm the character and requested props before creating geometry. Largest foreground region may be a suggestion, never a claim of semantic recognition. | Choose character, keep another region, or manual outline |
| Image generation can add external calligraphy, stars and borders | Request an isolated complete character on a plain background, with only explicitly requested props/decorations. Preserve costume motifs and the student's exact prompt. | Student can explicitly request an exception |
| Multiple review options and long warnings dominate the screen | Large proposed result; one Use/Apply button, one Back/Keep original option, and an optional original comparison. | Expanded explanation |

## Three screens

1. **Create:** describe an idea or upload artwork; inspect the character; choose **Use this character**. Presets are optional.
2. **Refine:** keep the intended character/props; select where movement is needed; review the split/joint and try its motion. Keep natural-language changes accessible through **Ask AI for a change**. Finish with **Ready to make**.
3. **Make:** set height; inspect the print preview; choose **Print puppet**. Material settings, calibration guidance and SVG files remain accessible without crowding the primary task.

The new three-screen concept board is a design target, not a live screenshot or proof that automatic anatomical separation works. Its illustrated print sheet is not a fabrication drawing.

## Acceptance checks

- At a 390 px phone width, the current task, character and primary action are visible together in the normal working view; no toolbar pushes the image offscreen.
- Exactly one prominent next action appears in each normal task state. Tools are disclosed only when needed.
- A new student can proceed through Create, Refine and Make without understanding “Reference,” “Pan,” “alpha,” or “detected components.”
- A horse with separate lettering, stars and a border is reviewed as a character-selection task, not accepted as 40 finished pieces.
- A separate intended prop, such as a footballer's ball, can be retained. No original asset or locked work is silently overwritten.
- Touching decoration and complex/opaque backgrounds receive an honest manual-selection fallback; cleanup does not claim anatomical understanding.
- The selected piece remains visibly associated with its controls; AI revisions still require review and preserve scope/locks.
- Fresh-session behavior remains: no automatic project save/restore, with explicit Download/Open.
- Test the complete journey in a real browser, on a phone/tablet, and with one printed paper prototype. Source-level and simulated-event checks remain supporting evidence.

## Previous v0.5 implementation status
The v0.5 interface is implemented. Only Create, Refine and Make remain in the main navigation. View tools, the full parts list, piece properties, AI revision and advanced construction tools are closed by default. Refine has a dominant canvas and a compact selected-piece panel; the four-substep rail and canvas counts/dimensions are removed. Review offers a large result, optional original comparison and one Use/Apply action. Make places height and optional material/file settings before Print. Project holds explicit Download/Open, fresh-session information and AI connection settings.

The default image path now isolates the largest connected foreground region as a proposal, instead of converting every detached mark into a puppet piece. Students can pick another character or retain a separate prop. Original pixels remain available, any locked part blocks rebuilding, replacement of existing pieces/joints/rods is disclosed before acceptance, and Undo restores the prior construction. Selection keeps original coordinates and refuses silent truncation. Touching decoration is still attached; opaque framed backgrounds may require manual tracing. This is connected-region selection, not anatomical recognition.

Generation requests preserve the complete student prompt and add composition guidance: whole isolated character, plain background, no unrequested lettering, stars or borders, and preservation of costume motifs and explicitly requested props. Both generation adapters use this guidance; editing requests remain unchanged. No new paid image generation or output-fidelity claim is attached to this release.

**Verification: 168 automated tests pass, including 21 workflow tests.** The new simulated journey covers 51 foreground regions reduced to one character, retained costume colors, optional ball restoration, manual subject choice, reviewed split and hinge, angle adjustment, print HTML, download and explicit reopening. Existing reset, lock, parameter, keyboard and pointer regressions remain. Syntax, build and Worker checks are recorded in VALIDATION.md.

At the time of the v0.5 review, the browser connection was unavailable. The concept board is not a screenshot, and 390 px rendering, actual touch/focus behavior, print-dialog operation and a paper prototype remain unverified. These are the remaining acceptance checks; the implementation does not claim classroom usability from automated tests alone.

---
## Previous v0.4 implementation record


## Historical v0.4 release

The interface has been revised around the supplied Create and Refine concepts. It keeps the warm visual style and three core processes: **Create → Refine → Make**. Construction is now guided within Refine, the canvas is the main workspace, and design proposals use a large review view with visible decisions.

Projects are **session-only** in both editors. Closing, reloading or reopening starts fresh. Students must explicitly download a project file to keep their work, and can explicitly open that file later. The protected AI endpoint preference remains across sessions. Previous project snapshots are cleaned best-effort without clearing unrelated settings.

This remains a source and event-workflow audit. Browser and native computer connections were unavailable during the earlier audit. No live screenshots, verified responsive rendering, real touch/keyboard focus behavior, print-dialog testing or student usability study is claimed. The concept images guided the implementation; they are not screenshots of the running release. **Final integrated checks pass: 158 tests, syntax, build and Worker smoke checks.**

## Findings addressed

| Priority | Earlier finding | Implemented response | Verification still required |
| --- | --- | --- | --- |
| P1 | Essential instructions and controls were often 9–12 px; muted text was difficult to read. | Larger 16 px base instructions, 14 px secondary text, stronger text colors and approximately 44 px control targets; smaller introductory headings. | Actual rendered contrast, 200% zoom, English/Chinese wrapping and long content. Normal text should meet 4.5:1; large text 3:1. |
| P1 | Proposals appeared below the canvas and mobile comparisons were narrow. | Review replaces the central canvas, offers Before / Proposed / Side by side views and persistent Keep original / Apply decisions. Image review calls out limbs, counts, costume and props. | Review announcement/focus, decision reachability from every scroll position and image inspection at a 390 px viewport. |
| P1 | Image acceptance jumped to Prepare & export; construction and fabrication were mixed together. | Create handles ideas/artwork; Refine guides Clean image → Choose pieces → Add movement → Test and contextual dialogue; Make handles physical settings, checks and exports. | A new student can follow the next action from image acceptance to a moving assembly without teacher navigation help. |
| P1 | There was no zoom/pan/Fit and outline handles shrank with artwork coordinates. | Canvas zoom, pan, Fit and screen-scale editing support, with keyboard outline adjustment and improved pointer handling in the current revision. | Integrated interaction regressions, accurate touch placement, dragging outside the canvas, cancelled gestures and browser keyboard behavior. |
| P2 | Project controls disappeared at smaller widths and the canvas followed long tool panels. | Persistent Project menu for title/New/Open/Download; canvas-first narrow layout with compact task controls; session-only status replaces autosave status. | All project actions remain discoverable at 390, 768 and 1280 px; downloaded files remain explicitly reopenable after a fresh start. |
| P2 | Part rows lacked artwork previews; “Connection” also named AI settings. | Artwork thumbnails and joint indicators, selected-piece controls and scoped AI dialogue, collapsed advanced properties, and the label AI status for service settings. | Long part names, clear selected scope, visual relation between a piece and its controls, and capability messages beside unavailable actions. |

The 44 px target is a classroom usability choice, not a claim about the WCAG 2.2 AA minimum. WCAG's target-size minimum is 24 CSS px with specified spacing and other exceptions.

## Functional repairs retained

- Advice-only AI drafting replies stay visible and explicitly state that no editable pieces were created; they do not present an inappropriate Accept action.
- Enter and Space activate interactive SVG parts and joints. Clicking a joint selects its child piece's movement controls without changing geometry or undo history.
- Interactive canvases expose a group with selected-state controls; read-only previews remain images. Focused controls receive a visible outline.
- Automatic project save/restore and close-time writes are removed from current and classic editors. Previous session cleanup is bounded and best-effort, so blocked storage cannot prevent a fresh project.
- Download/Open remains the deliberate continuation route. Browser back/forward restoration also restarts the editor; the current open session retains its undo and review history.

These changes do not establish complete accessibility conformance. Modal navigation, focus continuity, editing with assistive technology, responsive layout and real pointer behavior still require browser checks.

## Workflow evidence and limits

That v0.4 release passed **158 automated tests**, including **19 event-workflow tests**. These include fresh-session lifecycle, explicit file round-trips, AI reset races, review isolation and editing/navigation regressions. See [VALIDATION.md](VALIDATION.md) for the verification details.

The workflow under test is generation → review/accept → local extraction → split and hinge → control rod → manual and natural-language parameters → pose → artwork/cut SVG and calibrated print HTML → download → fresh session → explicit file import. Rejection, undo/redo, locks and failure handling are also covered. Provider responses and the DOM/canvas are simulated in event-workflow tests.

Earlier live relay tests returned real images. The footballer matched the principal visible requirements and passed local construction/export checks. The six-tentacle scholar produced eight tentacles: geometry conversion passed, prompt fidelity failed. Generation works, but correct anatomy and exact custom-prompt matching are not guaranteed. Extraction finds connected silhouettes rather than anatomical parts; students must split and review pieces. Live image analysis/editing remains unavailable on the verified generation-only relay.

Before classroom release, complete actual browser/tablet checks and one paper prototype: print at 100%, measure the 50 mm calibration mark, assemble joints, test travel and interference, then confirm rod control and fragile details. See [VALIDATION.md](VALIDATION.md) for evidence and [CRITERIA-AUDIT.md](CRITERIA-AUDIT.md) for goal alignment.

## Reference criteria

- [W3C: Contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [W3C: Target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
