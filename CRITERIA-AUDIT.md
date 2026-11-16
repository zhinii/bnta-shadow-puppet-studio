# Criteria audit and refinement

The acceptance criteria come from the supplied character examples and the requested three-process workflow. The reference images show substantially different silhouettes, garments, anatomy and surface detail; changing the colors of one human template would not meet that intent.

| Criterion | Result | Evidence / remaining work |
| --- | --- | --- |
| Three core processes | Implemented | Create, Refine, Make; Refine guides Clean image, Choose pieces, Add movement and Test; separate decoration module removed |
| Optional presets plus custom keywords | Implemented | Blank project, optional fields/templates, 4,000-character custom prompt retained verbatim |
| Modern, historical, real and imagined characters | Structurally supported | Arbitrary parts and artwork; identity is student-specified, never inferred from a face |
| Rich visual variety comparable to the references | Implemented with review | Imported and generated artwork retain texture and color in exported pieces; live Kimi generation is connected, with prompt fidelity reviewed by the student |
| Natural-language revisions with student autonomy | Implemented, live compatibility limited | Before/Proposed review, accept/discard, selected-piece scope, locks and undo; older relay is inconsistent |
| Custom shape/anatomy | Implemented | Editable polygons; figure, skirt, wings and six-tentacle construction structures; no fixed human skeleton |
| Image to editable pieces without generation API | Implemented, assisted | Local background cleanup, color selection, connected silhouettes and manual correction; anatomy and hidden surfaces are not inferred |
| Parametric control of imported artwork | Implemented | Width/length and direction controls deform artwork and contours together; connected children follow without stretching; locks and original assets remain protected |
| Split pieces into functional connections | Implemented for simple cuts | Two-point split with shared pivot and tabs, explicit parent suggestion, joint angle controls and undo; complex fragment-producing cuts reject |
| Joint, hinge and rod planning | Implemented as planar fabrication planning | Pivot pins, fixed overlaps, pin hinges, tabs, explicit anchors, rod points and angle limits; flexible/living hinges are not simulated |
| Make a physical puppet | Prototype-ready geometry | Scaled pieces, unioned tabs, exact holes, layered assembly guide and calibrated tiled print; material testing remains necessary |
| AI analyzes and evaluates the actual image | Not connected in the working relay | Optional v2 implementation exists; the verified Kimi generation route accepts text only, so automatic visual evaluation remains unavailable |
| Reliable custom prompt results | Partial | Custom text and presets reach the working generation route. Footballer matched main visible features; a six-tentacle request produced eight. Review remains required, with no automatic fidelity claim |
| Preserve work explicitly | Implemented | Download/Open portable image-inclusive files; classic editor supports downloaded v1 files. Closing/reloading intentionally starts fresh; automatic snapshots are no longer retained or restored |
| Start fresh after a closed session | Implemented | Current and classic editors keep projects in memory only; prior project snapshots are cleaned best-effort. AI endpoint preference remains; unrelated browser settings are untouched |
| Clear student workflow and readable controls | Implemented; browser verification pending | Larger artwork workspace, prominent proposal decisions, guided Refine stages, thumbnails, contextual AI, collapsed advanced settings, larger text/controls and canvas navigation |

## Repeated review and repairs

1. **Architecture:** replaced fixed ten-piece characters with artwork-backed polygons and a connection graph. Preserved the classic editor for older files.
2. **Workflow tests:** repaired image imports blocking text revisions, selected-piece context, Create appending a second character, unsaved prompt text, immobile fixed-to-pivot changes and reference art leaking into Shadow view.
3. **Artwork correctness:** adopted new images before applying references to them; image edits replace unlocked artwork only when coordinates match. Changed dimensions preserve old clipped artwork and require retracing. Locks also prevent ancestor movement from changing a protected part.
4. **Fabrication audit:** improved scale precision, checked distinct overlapping pin holes, united tab boundaries, blocked incomplete cut contours, paginated long connection guides, and added Chinese print instructions and layer order.
5. **Live prompt audit:** tested the footballer, skirt and six-tentacle cases; added geometry-informed repair after real failures. Advice-only or invalid replies never become a claimed successful design.
6. **Image-to-parametric workflow:** added local extraction, reviewed splitting, dimensions and direction controls. Event tests exercise cleanup, color selection, extraction, split/hinge acceptance, deformation, connection following, export and portable reload without AI POST requests.
7. **Second fabrication review:** fixed contour union tolerances for small image coordinates. Preserved physical scale through added/deleted geometry, including small first pieces. Forced background comparisons to show image pixels even when the main view is Shadow or the reference is hidden. Cleared unfinished click tools when importing an image or selecting another piece.
8. **Live image relay integration:** connected the new editor to Kimi's existing image route without altering the provider service. Added separate generation/editing/vision capabilities, exact prompt plus preset transport, bounded image decoding, and visible image acceptance. Verified real generated PNGs through local geometry conversion and SVG export. The tentacle count failure is recorded as a visual defect, not a successful custom design.
9. **Student interface revision:** implemented the Create/Refine concept direction with a dominant canvas, large review view and persistent decisions, guided construction within Refine, selected-piece AI dialogue, part thumbnails, readable controls, collapsed advanced properties and zoom/pan/outline interaction improvements. These are implementation changes, not evidence of classroom usability or verified device rendering.
10. **Fresh-session requirement:** removed automatic project save/restore from both editors. Explicit file downloads and imports remain. Old v2/v1 snapshots are cleaned best-effort, reopening/reloading starts fresh, and the protected AI endpoint preference is kept separately.

## Release judgment

The earlier UI/UX audit repaired visible advice-only replies and keyboard/mouse selection. Its broader layout recommendations have now been implemented as described in [UI-UX-AUDIT.md](UI-UX-AUDIT.md). **Current release verification: 158 automated tests pass, including 19 workflow tests.** Syntax, build and Worker smoke checks also pass. No live screen or tablet verification is claimed.

The generate-or-import → review → local pieces/hinges/parameters → export workflow is ready for user testing, with automated checks and real generated-image geometry trials. It still needs an actual browser and physical prototype check. Automatic anatomical separation, hidden artwork reconstruction and dependable prompt matching remain incomplete. Image generation now works; it does not itself solve those later stages. The supplied reference characters remain acceptance scenarios, not verified physical puppets.
