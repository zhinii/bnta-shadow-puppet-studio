# Shadow Puppet Studio: slides 3–12 usability audit

Audit date: 26 November 2026.

## Scope and evidence

Source: **Shadow Puppet Studio - English.pdf**, pages/slides **3–12**, 17 pages in the complete PDF, 2,880,176 bytes.

SHA-256: `a7e03030c082a24338634e5abf65af5eae2ca49ca2587f6037b20cf59fec3dfa`.

All ten source pages were rendered and visually inspected. The implementation was compared against the mockups through source inspection, model tests, and event-wiring tests. **No live browser session, mobile-device trial, screen-reader trial, or middle-school student usability trial was performed for this audit.** Automated event tests are not evidence that an interaction feels obvious to a child.

The agreed delivery is the [GitHub Pages application](https://zhinii.github.io/bnta-shadow-puppet-studio/). Students start a project, work in the browser, download a JSON file, and open that file next time. Closing or reloading starts a fresh session. The workflow has no required account, class code, classroom server, project database, live participant presence, or online submission. AI requests use the existing optional relay; ordinary editing and JSON files do not require an AI response.

The PDF's educational and creative tasks remain relevant. Its online handoff, assignment locks, simultaneous-editing indicators, and team submission are deliberately adapted to this file-based workflow.

## Coverage by slide

“Implemented” below refers to code and automated behavior, not observed student success. AI-generated visual quality and physical puppet performance require separate review.

| Slide | Intended task and interaction | Current implementation and audit changes | Remaining limitation or adaptation |
| --- | --- | --- | --- |
| 3 | Build a story from time, place, characters, and plot; show the current task and progress; hand off to another student. | Story fields and optional AI suggestions are available. Navigation commits typed edits so later steps use the story the student can see. | The local editor uses one editable story form rather than a networked one-student-at-a-time relay. No live handoff or participant status. The form has more simultaneous fields than the mockup; verify cognitive load with students. |
| 4 | Start a new story while keeping the previous one; open story history. | New-story flow checkpoints the existing story, including typed work, and exposes earlier versions. | Starting a different story does not automatically rebuild every character, script scene, or stage. Students must review dependent work for consistency. |
| 5 | View a saved story before restoring it; retain unfinished current work. | Read-only version review precedes restoration. Restoration preserves accepted current content and a distinct typed draft; stale draft values no longer cover the restored result. | History is bounded, not an unlimited archive. Download separate JSON files for durable milestones. |
| 6 | See character names and roles; choose a character; show assignment status; unlock the script when everyone is ready. | Students can add and describe characters, open their puppet workspace, and remove a character only after confirmation. | Assignment locks and waiting for classmates are removed. The file's author works locally; there is no claim of simultaneous collaboration. |
| 7 | Add and switch scenes; write title, setting, dialogue and actions; format text; count characters; review versions; regenerate or change the story. | Scene editing, optional AI preview/apply, safe formatting ranges for bold/italic/underline/colour, character count, and version review are implemented. Navigation and AI use typed content. Removing a scene requires confirmation. | Formatting uses selected text and a rendered preview while preserving canonical plain text. AI changes need review; they are not automatically accepted. Live editing cursors are intentionally absent. |
| 8 | Design appearance, clothing and patterns; choose an area; discuss revisions with AI; compare versions. | Existing artwork creation/import, selected-piece geometry edits, AI proposal review, undo, and character versions remain available. Selected-piece region correction now offers reviewed colour or sampled-pattern changes, with undo and JSON/print persistence. | A geometry edit or sampled texture is not semantic image inpainting. “Add a new embroidered motif only here” and reconstruction of hidden garment layers are not verified AI capabilities. |
| 9 | Break down a character; select and rotate a joint; reposition a pivot; drag a limb; zoom; restore pose; open local editing. | Existing split/joint construction, selected-piece controls, rounded overlap resizing and zoom remain available. Accepted pivots can be repositioned by tap or drag and reviewed before applying. Temporary movement trials use a slider or an explicit Drag this piece mode; Restore and Keep make the result clear. | Automated splitting can misidentify clothing boundaries. Students must inspect the selected part and overlap. Movement preview does not validate physical strength, friction or control-rod placement. |
| 10 | Circle a wrongly interpreted area; correct it using colour or texture; preview/apply; return to breakdown. | A student marks a region on one piece, previews a colour or same-piece texture repair, then applies or rejects it without changing the joint or outline. Corrections survive undo, splitting, mirroring, resizing, JSON and printed output. | Sampling existing artwork cannot reveal the true hidden pattern beneath another garment. Manual judgement remains necessary. |
| 11 | Test raise hand, wave, nod, step and bend knee; restore the original pose in one action. | All five named movement tests are implemented. A student selects a real connected joint and records an end pose; playback is temporary and Restore returns to the saved pose. Keep this pose explicitly commits it. | An unlabeled or non-human character has no reliably inferred “hand” or “knee.” Unsupported motions must explain what is missing rather than animate an unrelated part. This is a movement check, not a biomechanics simulation. |
| 12 | Create a stage per scene; select elements; revise with AI; review versions; navigate scenes; submit the project. | Scene backgrounds, props, text/shapes, character placement, object selection, size/turn controls, ordering, stage history and performance scene navigation are available. AI can update a known selected object or add supported objects. JSON download replaces submission. | A raster backdrop is one image: its mountains and trees are not independently editable objects. Replacing/generating a backdrop is distinct from editing an object. No live shared cursors or online submission. |

### Release verification

- Local colour/texture correction, accepted-pivot repositioning and five named motion tests: implemented with targeted regression coverage.
- Automated suite: **450 tests passed**, no failures or skipped tests.
- Syntax check, static build and smoke check passed. The smoke check traversed **25 browser modules** and verified no classroom service/database dependency.
- Live text relay: story and selected-stage-object edits passed with HTTP 200; a script retry using the current scene ID returned the expected scene and four spoken lines. Four small calls were made. The first script call exposed a missing-ID risk; parser handling was tightened to prevent accidental duplicate scenes.
- Deployment status is recorded in the repository's [GitHub Actions runs](https://github.com/zhinii/bnta-shadow-puppet-studio/actions). The application entry and changed static assets are checked after publication.

## Usability findings and changes

| Finding | Why it matters to a student | Change made or being verified |
| --- | --- | --- |
| Moving to another section left typed work only in a temporary form draft. | Later AI or project steps appeared to ignore what the student had just written. | Commit visible edits on navigation and before an AI request; retain the JSON draft safety net. |
| Restoring history or accepting AI could leave old typed values visible. | “Restore” or “Use this suggestion” appeared to do nothing, and a later save could overwrite the intended result. | Clear the matching stale draft only after a successful change; preserve the prior draft when restoring. |
| History offered Restore without View. | Students had to change their work to discover what a version contained. | Add a readable review step before restoration. |
| Character and scene removal happened immediately. | One click could remove a complete puppet or scene. | Add explicit confirmation with a clear description of what will be removed. |
| Several object controls were shown even when they could not affect the selected artwork. | Words, Shape and Colour suggested capabilities that did not apply to a character/image. | Show controls relevant to the selected object type; distinguish composition controls from artwork editing. |
| Stage AI could add objects but could not revise an existing object. | “Move this” could create another object instead of changing the selected one. | Add validated updates to known object IDs; scope selected-object requests; use the same composition helper for preview and apply. |
| There was no obvious way to stop editing one object and add another. | Students could repeatedly overwrite the selected object. | Add an explicit deselect/add-another action and clear the inspector selection. |
| Equal layer values and pointer-only movement reduced control. | Layer buttons could appear ineffective, and precise placement was difficult. | Reorder against actual visual neighbours; add arrow-key movement and bounds that retain a selectable edge. |
| Performance view did not provide native modal behavior. | Keyboard focus could remain behind the preview. | Use a native dialog and an explicit return-to-editing action. |
| An image upload could finish after its target scene changed. | A background or prop could land in the wrong scene. | Capture and validate the upload target before applying the image. |
| The motion slider could commit a change while its copy described a temporary trial. | Testing a joint could unintentionally alter the saved pose. | Separate trial pose state from committed project state; make restoration explicit. Puppet model/event tests cover this separation. |

## Visual hierarchy and accessibility review

The useful pattern in the mockups is a clear task heading, a large central work area, a quieter supporting panel, and an explicit next/return action. Their grayscale presentation is a wireframe, not a requirement to remove the current colour palette.

Current CSS provides a 46 px minimum height for ordinary buttons and inputs, visible keyboard focus, single-column layouts on narrow screens, and reduced-motion styling. Calculated contrast for the main stylesheet is:

| Colour pair | Contrast |
| --- | --- |
| Primary rust button `#a24731` / white text | 6.03:1 |
| Muted text `#56645b` / surface `#fffef9` | 6.17:1 |
| Main text `#243d35` / paper `#f5f5ee` | 10.69:1 |

These calculations cover these colour pairs only. They do not establish complete accessibility compliance. Generated artwork, user-selected script colours, imported images, disabled controls, focus order and device-specific rendering need their own checks.

Important student-facing checks remain:

- One clear primary next action per task; avoid making “Save” and “Continue” look like unrelated obligations.
- Keep the puppet path visible: **Artwork → Joints → Correct a part → Try movement**.
- Keep “Download project” distinct from saving an edit into the current open project.
- Explain a rejected joint with a visual location and an actionable adjustment, not only an error message.
- State what AI will change before applying it. Do not label advice or unimplemented pixel editing as a completed preview.

## Automated validation and its limits

The release check must include model tests, form/event-wiring tests, JSON roundtrips, safe content rendering, source syntax checks, a static build, and GitHub Pages resource checks. The recorded release checks are listed above.

Critical regression cases are:

1. Type a story or script, navigate, then ask AI: the visible edits are in context.
2. View and restore a version while an unsaved draft exists: the restored content is visible, and the displaced draft can be recovered.
3. Format selected script text, edit nearby text, export JSON, and reopen: text remains safe and formatting stays attached to the intended surviving text.
4. Update one selected stage object through AI: unrelated objects and the backdrop remain unchanged; preview and apply agree.
5. Change scenes while an upload is pending: the upload cannot silently attach to a different target.
6. Download and reopen the complete project: story, characters, script, stage, reflection, artwork and accepted edits survive.
7. Trial a motion and restore: the saved neutral pose remains unchanged until an explicit edit is applied.
8. Apply local repair to one piece, rotate it, export it, and reopen: the repair remains on that piece and preserves its outline, pivot and other parts.

These checks do not prove the relay will interpret every custom prompt correctly, that generated images are culturally accurate, or that a printed puppet can withstand repeated movement.

## Short student trial: 5–10 minutes

Use a disposable project and a small prepared puppet image. Give task goals, not button-by-button directions. Observe first clicks, hesitations, requests for help, and recovery after mistakes. Avoid coaching until the student is stuck.

| Task | Success criterion |
| --- | --- |
| 1. Start a project and write a two-sentence story. Continue to the next task. | The student finds the start action and next step without a class code or teacher intervention; typed work remains visible when revisited. |
| 2. Add one character and a scene with two lines of dialogue. Emphasize one word. | The student distinguishes character information from script dialogue, finds scene controls, and sees the formatting result. |
| 3. Review an older story version, then return to the current one. | The student can inspect a version without accidentally replacing current work and can recover after restoration. |
| 4. Open the puppet, select one real joint, change its overlap size, and try movement. | The student can identify the selected joint, distinguish size from pose, restore the starting pose, and recognize unwanted overlap. |
| 5. Repair a small region on one piece using colour or a valid texture sample. | The student understands which piece and region will change, can reject the preview, and does not alter an unrelated piece. |
| 6. Put the character and one prop on a stage. Move, resize, then add another object. | The student can select/deselect, sees relevant controls, and does not overwrite the first object while adding the second. |
| 7. Download the project, reload, and reopen the file. | The student locates the downloaded JSON file, understands why the fresh session is empty, and recovers the complete work. |

Record completion and the number/type of prompts needed for each task; do not assign a usability score without a defined sample and method. A task that requires the facilitator to name the correct button should trigger a wording or placement review.

## Physical and artistic validation

Before calling the output ready for classroom making, print a prototype at the intended scale. Confirm calibration, pin-hole clearance, rounded overlap coverage, front/back order, free movement, control-rod reach, and the absence of connections into unrelated body parts. Check the puppet against light in more than its starting pose.

A correct silhouette does not prove correct garment construction. Students and an experienced practitioner should review which fabric or pattern belongs on each hidden layer. Texture duplication and manual correction support that judgement; they do not replace it. Cultural/style claims and traditional construction choices should be reviewed with an appropriate artist or practitioner before presenting the system as an authoritative representation of the art form.

