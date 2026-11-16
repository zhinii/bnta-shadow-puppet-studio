# UI/UX re-audit — simplicity first
16 November 2026. Based on the student's mobile horse screenshot, the current application source, and the earlier concept images.

## Judgment
The current interface does not yet meet the intended simplicity. Larger text and buttons improved legibility, but the student still encounters an editor's tool inventory before completing a clear task. The next iteration must reduce the default choices, rather than add another instruction panel. Passing functional tests does not establish usability.

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

## Acceptance checks for the next implementation

- At a 390 px phone width, the current task, character and primary action are visible together in the normal working view; no toolbar pushes the image offscreen.
- Exactly one prominent next action appears in each normal task state. Tools are disclosed only when needed.
- A new student can proceed through Create, Refine and Make without understanding “Reference,” “Pan,” “alpha,” or “detected components.”
- A horse with separate lettering, stars and a border is reviewed as a character-selection task, not accepted as 40 finished pieces.
- A separate intended prop, such as a footballer's ball, can be retained. No original asset or locked work is silently overwritten.
- Touching decoration and complex/opaque backgrounds receive an honest manual-selection fallback; cleanup does not claim anatomical understanding.
- The selected piece remains visibly associated with its controls; AI revisions still require review and preserve scope/locks.
- Fresh-session behavior remains: no automatic project save/restore, with explicit Download/Open.
- Test the complete journey in a real browser, on a phone/tablet, and with one printed paper prototype. Source-level and simulated-event checks remain supporting evidence.

## Implementation status
The workspace disconnected during this iteration. This re-audit and concept board are complete; the simplified interface is **not yet applied or published**. Subject-cleanup and production-prompt changes were prepared locally, but the combined workflow has not been integrated or verified. The last published application remains v0.4.0 with 158 automated tests (19 workflow tests). Those totals do not certify the proposed simplification.

---
## Previous v0.4 implementation record


## Current release

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

The current release passes **158 automated tests**, including **19 event-workflow tests**. These include fresh-session lifecycle, explicit file round-trips, AI reset races, review isolation and editing/navigation regressions. See [VALIDATION.md](VALIDATION.md) for the verification details.

The workflow under test is generation → review/accept → local extraction → split and hinge → control rod → manual and natural-language parameters → pose → artwork/cut SVG and calibrated print HTML → download → fresh session → explicit file import. Rejection, undo/redo, locks and failure handling are also covered. Provider responses and the DOM/canvas are simulated in event-workflow tests.

Earlier live relay tests returned real images. The footballer matched the principal visible requirements and passed local construction/export checks. The six-tentacle scholar produced eight tentacles: geometry conversion passed, prompt fidelity failed. Generation works, but correct anatomy and exact custom-prompt matching are not guaranteed. Extraction finds connected silhouettes rather than anatomical parts; students must split and review pieces. Live image analysis/editing remains unavailable on the verified generation-only relay.

Before classroom release, complete actual browser/tablet checks and one paper prototype: print at 100%, measure the 50 mm calibration mark, assemble joints, test travel and interference, then confirm rod control and fragile details. See [VALIDATION.md](VALIDATION.md) for evidence and [CRITERIA-AUDIT.md](CRITERIA-AUDIT.md) for goal alignment.

## Reference criteria

- [W3C: Contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [W3C: Target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
