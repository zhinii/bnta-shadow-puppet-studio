# Shadow Puppet Studio · UI/UX and middle-school usability audit

## v0.8.0 classroom expansion

Reference: **Shadow Puppet Studio – English.pdf**, pages 1–17, plus the reported problems with confusing controls, advice-only AI responses, oversized joints and incorrect overlap patterns.

This is an implementation and interaction-contract audit. No fresh desktop/mobile browser observation or student usability session was available for this release review. Rendered-form tests exercise application handlers with a DOM harness; they are not browser screenshots or touch-device tests.

| Student or teacher task | Finding and implemented response | Verification / remaining work |
| --- | --- | --- |
| Understand where to start | Welcome choices separate joining a class, starting/opening a project file, and quick puppet design. Local and shared saving are described explicitly. | View and controller checks; observe first-time students before declaring the choice self-explanatory |
| Enter a group | Shared class-code lookup exposes group choices without public student lists. Returning students use name and secret phrase. | API isolation and repeat-sign-in tests; teacher onboarding still depends on hosted access |
| Keep a group moving | Story handoffs are optional. Scriptwriting and design are not locked while another student decides or is absent. | Domain and rendered-workflow tests |
| Know the next task | Student workspace uses task tabs, short instructions and a next action. Detailed puppet controls remain inside the established Create/Refine/Make editor. | Responsive CSS and rendered controls checked; real phone/tablet layout not yet visually verified |
| Preserve drafts | Typed forms are kept across rerenders in the open session; unrelated saves do not clear another form's draft. Shared refresh waits when drafts need attention. | Controller and rendered-form regressions; closing still discards unsaved local drafts as disclosed |
| Understand an AI change | Story/script/stage proposals show a reviewable result and require acceptance. Stale proposals cannot overwrite newer work. Advice-only replies do not count as edits. | Transport, parse and controller tests; artistic accuracy requires live examples |
| Return from puppet design | Embedded editor loads the selected character and offers Save character / Back to group. Failed saves keep the editor open. | Same-origin/source checks, bridge and handler tests |
| Repair wrong joint artwork | Select the affected piece, choose its own printed patch and review the resulting overlap. Sample size, reset and undo are available. | Pixel mapping/export tests; still needs a student trial and actual garment examples |
| Check a joint | Visible joint diameter, bend either way and restore pose focus attention on the selected connection. Guidance asks about gaps, wrong print and unexpected movement. | Existing geometry and new trial-pose tests; no physical/cultural certification |
| Compose a stage | Select or drag objects, use numeric controls for precise placement, change layers and preview scenes. Background upload and AI generation are distinct. | Safe-render and action-handler tests; touch dragging and scene performance unverified |
| Submit confidently | Make tools remain accessible; contribution/reference/test fields precede submission. Submission is a snapshot and later work is clearly out of date. | Snapshot, review and resubmission tests |
| Grade defensibly | Teacher reviews submitted evidence, chooses rubric levels and confirms scores. AI suggests comments tied to available evidence only. | Visibility, confirmation, snapshot and CSV tests; rubric requires educator review |
| Rejoin later | Shared saved class work persists on the server; local work requires a downloaded file. No closed-session browser snapshot is restored silently. | Storage/client contracts; hosted recovery and real multi-device class pilot still needed |

## Decisions carried over from the feedback

- Remove the style/world/starting-shape option panel instead of asking children to interpret overlapping categories.
- Keep creative intent in student descriptions; no prefilled plot or cast.
- Do not turn group work into a queue: absences and incomplete assignment should not block useful work.
- Make the connection between two pieces visible. Size changes preserve the shared pivot and pin hole.
- Keep movement inspection separate from changing the accepted resting pose.
- Preserve physical making as an explicit outcome, not only digital pictures or stage composition.
- Separate a teacher's judgment from an AI's suggestion. Missing evidence should remain visibly missing.
- Use saved class projects deliberately while retaining the fresh-session behavior for local/quick work.

## Unresolved design limitations

**Hidden clothing and patterns.** Pattern sampling is an immediate repair tool. It cannot determine which obscured garment owns a region or recover an unseen motif. The next substantial improvement requires layer-specific segmentation and reviewed reconstruction. A duplicated patch must not be presented as authentic hidden artwork.

**Collaboration.** Changes are shared through saved revisions and periodic refresh. Live cursors, simultaneous text merging and joint editing of the same puppet are not implemented. Conflict messages preserve work instead of silently overwriting it.

**Physical movement.** The preview can reveal visual problems, but it does not establish pin strength, cutting quality, rod control, friction, balance or projected clarity. Those need a printed paper/material trial and observation with a light source.

**Cultural grounding.** References and explanations are collected and reflected in the rubric. The software does not certify a design as belonging to a particular regional tradition. Practitioner review and accurate source attribution remain necessary for that claim.

**Hosted access.** The owner enabled student access. The GitHub Pages entry connects to the shared classroom API; teacher management opens the hosted site for sign-in. Students use a class code, name and secret phrase without a ChatGPT account. Local downloaded-project work remains available separately.

## Next usability acceptance session

Ask a small middle-school group to complete the following without the developer directing their clicks:

1. Join the intended group or create/open a local project, and explain where its work will be saved.
2. Develop a brief story and assign characters while another member continues the script.
3. Create/upload one character, remove its background and add a workable joint.
4. Shrink an oversized overlap, replace a wrong pattern on only one layer, bend the joint and restore the pose.
5. Save the character into the group, place it on a stage and preview two scenes.
6. Open print tools, check scale, assemble a paper joint and record what changed after testing.
7. Submit; have the teacher review the submitted version, draft and confirm feedback.
8. Rejoin/open the saved file and identify which work and feedback were retained.

Record completion without help, wrong turns, recovery, saving misunderstandings, touch problems and physical defects. Do not equate passing automated tests with passing this session.
