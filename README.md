# BNTA Shadow Puppet Studio

**Version 0.8.0** expands the studio into a bilingual classroom platform for stories, puppet design, performance preparation and teacher review. The individual puppet editor still uses **Create → Refine → Make**.

[Open the public platform](https://zhinii.github.io/bnta-shadow-puppet-studio/) · [Functionality](FUNCTIONALITY.md) · [UI/UX audit](UI-UX-AUDIT.md) · [Validation](VALIDATION.md)

The source is based on the 17-page **Shadow Puppet Studio – English.pdf** proposal and the earlier student feedback. No story or character is prewritten for students.

## Two ways to work

| Mode | How it works | How work is kept |
| --- | --- | --- |
| **Project file** | Start a class project on this device, add groups and members, or open a downloaded project. Local student/teacher views support planning and review on a shared device. | Download a `.shadow-class.json` file. Nothing is automatically restored when the tab closes or reloads. Local role switching is a convenience, not authentication or multi-device collaboration. |
| **Shared classroom** | A signed-in teacher creates a class and groups. Students enter an eight-character class code, their sign-in name and a secret phrase of 8–128 characters. | Explicit saves are stored on the classroom server. Rejoin the class to continue. Unsaved form drafts and session tokens stay only in the current browser session. |
| **Quick puppet** | Open the original independent character editor directly. | Download a `.puppet.json` file before closing or reloading. |

The public GitHub Pages address serves the file-based platform. Shared classrooms require the server-backed deployment with D1 and R2 configured. The retained hosted Site is currently owner-private; **student access must be enabled separately before a class can use it**. A class code does not bypass the hosting access policy. An unavailable server is reported explicitly; the app does not pretend that local work is synchronized.

For a teacher-added roster name, the teacher sets the student's initial secret phrase and shares it privately. Students who register a new permitted name choose their phrase on first join and reuse it afterward. The teacher can reset a forgotten phrase without deleting the student's work.

## Student workflow

1. **Story:** develop the time, place, characters and plot. Optional relay assignments make responsibilities visible without locking everyone behind a handoff. Save versions and restore an earlier idea.
2. **Characters:** create character briefs and assign ownership. Students can claim an unassigned character; the teacher can reassign responsibility.
3. **Script:** add scenes, write dialogue and revise it with AI suggestions. Review and accept a draft before it replaces saved text.
4. **Design:** open a character in the existing puppet editor. Create or upload artwork, remove the background, split pieces, size rounded joints, repair overlap patterns and test movement. Save the character back to the group.
5. **Stage:** add a background, characters, shapes, images and text. Drag objects or use position, size, rotation and layer controls. Preview scenes in sequence. AI stage layouts and generated backgrounds are proposals to review.
6. **Make and submit:** open each puppet's print tools, record references and tests, explain individual contributions, and submit a snapshot of the group project.

Groups can develop stories, scripts and character designs in parallel. Saving a new edit after submission marks that submission out of date; the submitted snapshot remains available for review. Resubmitting creates a new snapshot instead of changing the old evidence.

## Puppet construction and artwork

The design editor preserves the earlier custom-character tools:

- Description-only image generation, character count, image upload and editable outlines.
- Local background cleanup with visible cut edges, undo and missing-prop recovery.
- Suggested movement dots, manual joints, full rounded overlaps on both pieces, aligned holes, front/back order and a visible joint-diameter control.
- Geometry revisions and mirrors with a real preview, apply/reject and undo.
- Independent printable pieces, artwork/cut SVGs, tiled A4 pages, scale calibration and assembly guidance.

**Overlap pattern repair** lets a student choose a patch from the selected piece and use that print on its own rounded joint end. Sample size is adjustable; the connected piece's design, geometry, pivot and hole stay unchanged. Review, undo and reset remain available. The selected print travels with the piece through movement, resizing, mirroring and export.

This is a practical correction tool, **not semantic reconstruction of hidden clothing**. Repeating a visible patch cannot recover a concealed motif exactly. Students must review both layers through the bend and may need new artwork or practitioner guidance. The movement buttons bend the actual selected joint and restore the pose; they do not assume every character has human anatomy.

## Teacher workflow and evidence

Teachers can manage classes, groups and member names, move students between groups, reset a student's secret phrase, archive a class, review submitted versions and export confirmed results to CSV.

The starting rubric has five criteria, each with explicit levels from 0 to 4:

- Story and expression.
- Design and tradition.
- Construction.
- Testing and revision.
- Contribution and reflection.

Teachers may edit the rubric, draft comments and scores, then confirm them against a submitted snapshot. Students see confirmed group feedback and their own confirmed individual feedback; draft grades and classmates' individual grades remain private.

AI provides **formative observations with references to available evidence**, not numerical grades. It must not infer effort, collaboration, physical strength or cultural authenticity from an attractive image. A student's test record is reported as their record, not independently verified physical success.

## Saving and collaboration boundaries

Shared classrooms use server-side role checks, hashed secret phrases and session tokens, and revision checks. Concurrent saves cannot silently overwrite newer work: a conflict asks the user to load the latest version while keeping open drafts. Background refresh checks for newer saved work every 15 seconds and waits when unsaved forms need attention.

This is shared saved-work collaboration, not simultaneous character-canvas editing or live cursor presence. Character ownership prevents one student from changing another student's assigned puppet. Story, script and stage work are shared within the group.

Portable downloads and hosted documents deduplicate identical artwork across current work, histories and submission snapshots. Recent editable histories are bounded; assessed submission snapshots are retained within explicit limits. A large-class fixture checks 30 distinct artwork strings with five repeated histories under 32 MiB; this is a storage regression test, not a real classroom load test.

## AI connection

The app uses the existing protected Kimi relay. Provider credentials are never placed in browser code or project files. Hosted routes proxy only the supported requests to that fixed relay; GitHub Pages and portable puppet files use the existing direct relay transport.

- Text story, script, layout and formative-feedback requests: up to 4,000 characters.
- Character and stage image generation through the legacy image route: up to 800 characters.
- Stage prompts preserve scenery instructions and do not inherit character-only background rules.
- New image generation, image editing and visual analysis are separate capabilities. Existing generation access does not establish pixel editing or automatic anatomical recognition.

## Run and verify

Requires Node.js 22 or later.

```sh
npm run check
npm test
npm run build
node scripts/smoke.mjs
npm start
```

Local serving defaults to `http://127.0.0.1:4237`. The dependency-free Worker build is emitted at `dist/server/index.js`; the build also refreshes the GitHub Pages entry and portable puppet editor.

For shared hosting, retain the existing Site identity in `.openai/hosting.json` and bind `d1: "DB"` and `r2: "BUCKET"`. Schema-only migrations live in `drizzle/`. Hosted teacher identity comes from the Sites platform, not a role selected in the browser. Standalone teacher-token configuration is for controlled server use; never expose it to students or embed it in a client bundle.

See [VALIDATION.md](VALIDATION.md) for checks and remaining limits. Automated verification does not replace a middle-school usability pilot, a multi-device classroom trial, or a printed puppet and backlight test.
