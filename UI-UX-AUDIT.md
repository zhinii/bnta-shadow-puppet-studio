# UI/UX audit — 16 November 2026

## Judgment and scope

The application now supports a substantial image-to-puppet workflow, but the interface presents too much construction detail before a student knows the next action. The priorities are readable instructions, visible design decisions, and precise editing on tablets. Keep the existing warm visual identity and three core processes.

This is a source and event-workflow audit. Browser and native computer connections returned `Transport closed`, so no live screenshots, responsive-layout verification, touch testing, print-dialog testing, or student usability study is claimed. The accompanying Create and Refine concept images illustrate a proposed direction; they are not screenshots or implemented layouts.

## Recommended changes

| Priority | Observed implementation / likely consequence | Proposed change | Acceptance check |
| --- | --- | --- | --- |
| P1 | Essential instructions and controls are often 9–12 px. Some muted text colors fall below 4.5:1 against their declared surfaces. | Use 16 px body instructions and at least 14 px secondary text; reduce oversized introductory headings and strengthen muted text. | Check actual rendered contrast, 200% zoom, and English/Chinese line wrapping. Normal text meets 4.5:1; large text meets 3:1. |
| P1 | Proposals render below the canvas; mobile comparisons remain two narrow columns. Completion does not focus the review. | Make review the active central workspace, with a large proposed result, Before/After toggle and persistent Accept / Keep original controls. | From any scroll position, a completed result is announced and both decisions are reachable without searching. At 390 px the image can be inspected at useful size. |
| P1 | Image acceptance opens Prepare & export, while Refine requires pieces. The third process combines image cleanup, tracing, joints, parameters, materials and export. | Retain three processes: **Create** (idea and artwork), **Refine** (pieces, movement and contextual AI dialogue), **Make** (size, checks and fabrication). Within Refine guide Clean image → Choose pieces → Add movement → Test. Collapse advanced controls. | A student can turn a newly accepted image into a moving puppet by following one prominent next action at each point. No fourth top-level module. |
| P1 | There is no zoom/pan/Fit; vertex handles scale with artwork coordinates. Dragging lacks pointer capture/cancel handling. | Add zoom/Fit, screen-sized hit areas, pointer capture/cancel, and keyboard nudge or numeric position editing. Use a practical 44 px touch target where space permits. | Test accurate outline and hinge placement on a 390 px phone and classroom tablet, including a drag leaving the canvas and a cancelled gesture. |
| P2 | On narrow screens task controls precede the canvas and the inspector moves below it. Title, save status or New Project disappear at breakpoints. | Put the canvas first, use a compact task drawer and selected-piece sheet, and preserve a Project menu with title, saved state, New/Open/Download. | All project actions remain discoverable at 390, 768 and 1280 px; the selected piece and its controls remain visibly related. |
| P2 | Part rows show a color swatch rather than artwork; long names truncate. “Connection” also names AI settings. | Add artwork thumbnails and joint badges; show the selected name fully. Rename settings “AI status” and mechanical links “Joints”. Show capability limits beside affected actions. | Students can distinguish pieces and explain whether a status refers to the AI service or puppet movement without opening settings. |

The 44 px target is a usability recommendation, not a claim about the WCAG 2.2 AA minimum. WCAG's target-size minimum is 24 CSS px with specified spacing and other exceptions.

## Functional repairs completed during this audit

- Advice-only AI drafting replies now remain visible, explicitly state that no editable pieces were created, and offer dismissal without an inappropriate Accept action.
- Enter and Space activate interactive SVG parts and joints. Clicking a joint opens its child piece's movement controls. Selection restores focus and does not alter geometry or undo history.
- Interactive canvases expose a group with pressed-state controls; read-only previews remain images. Focused SVG controls receive a visible outline.

These fixes do not complete keyboard outline editing, modal focus management, or the proposed screen redesign.

## Workflow evidence and limitations

All **142 automated tests** pass, including **15 event-workflow tests**. Syntax, production build and Worker smoke checks pass. The complete tested route is generation → review/accept → local extraction → split and hinge → control rod → manual and natural-language parameters → pose → artwork/cut SVG and calibrated print HTML → save/reopen. Rejection, undo/redo, locks and failure handling are also covered. Provider responses and the DOM/canvas are simulated in these workflow tests.

Earlier live relay tests returned real images. The footballer matched the principal visible requirements and passed local construction/export checks. The six-tentacle scholar produced eight tentacles: geometry conversion passed, prompt fidelity failed. Generation is therefore working, but correct anatomy and exact custom-prompt matching are not guaranteed. Extraction finds connected silhouettes, not anatomical parts; students must split and review pieces. Live image analysis/editing is not available on the verified generation-only relay.

Before classroom release, complete actual browser/tablet checks and one paper prototype: print at 100%, measure the 50 mm calibration mark, assemble the joints, test travel and interference, then confirm rod control and fragile details. See [VALIDATION.md](VALIDATION.md) for detailed evidence and [CRITERIA-AUDIT.md](CRITERIA-AUDIT.md) for goal alignment.

## Reference criteria

- [W3C: Contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [W3C: Target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
