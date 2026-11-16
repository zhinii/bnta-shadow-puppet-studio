# Criteria audit and refinement

The acceptance criteria come from the supplied character examples and the requested three-process workflow. The reference images show substantially different silhouettes, garments, anatomy and surface detail; changing the colors of one human template would not meet that intent.

| Criterion | Result | Evidence / remaining work |
| --- | --- | --- |
| Three core processes | Implemented | Create, Refine, Prepare & export; separate decoration module removed |
| Optional presets plus custom keywords | Implemented | Blank project, optional fields/templates, 4,000-character custom prompt retained verbatim |
| Modern, historical, real and imagined characters | Structurally supported | Arbitrary parts and artwork; identity is student-specified, never inferred from a face |
| Rich visual variety comparable to the references | Partial | Imported artwork retains texture and color in exported pieces; live image generation awaits protected-service deployment |
| Natural-language revisions with student autonomy | Implemented, live compatibility limited | Before/Proposed review, accept/discard, selected-piece scope, locks and undo; older relay is inconsistent |
| Custom shape/anatomy | Implemented | Editable polygons; figure, skirt, wings and six-tentacle construction structures; no fixed human skeleton |
| Image to editable pieces without generation API | Implemented, assisted | Local background cleanup, color selection, connected silhouettes and manual correction; anatomy and hidden surfaces are not inferred |
| Parametric control of imported artwork | Implemented | Width/length and direction controls deform artwork and contours together; connected children follow without stretching; locks and original assets remain protected |
| Split pieces into functional connections | Implemented for simple cuts | Two-point split with shared pivot and tabs, explicit parent suggestion, joint angle controls and undo; complex fragment-producing cuts reject |
| Joint, hinge and rod planning | Implemented as planar fabrication planning | Pivot pins, fixed overlaps, pin hinges, tabs, explicit anchors, rod points and angle limits; flexible/living hinges are not simulated |
| Make a physical puppet | Prototype-ready geometry | Scaled pieces, unioned tabs, exact holes, layered assembly guide and calibrated tiled print; material testing remains necessary |
| AI analyzes and evaluates the actual image | Implemented in server, not live verified | Multimodal pixels sent to vision; generated-image checks report met, missing or unclear features; old relay rejects this protocol |
| Reliable custom prompt results | Not yet fully met in production | Exact prompts, validation and bounded repair are implemented; remove the old relay's fixed-character instructions by deploying v2 |
| Preserve previous work | Implemented | Portable image-inclusive projects, explicit autosave errors, untouched v1 storage and classic editor |

## Repeated review and repairs

1. **Architecture:** replaced fixed ten-piece characters with artwork-backed polygons and a connection graph. Preserved the classic editor for older files.
2. **Workflow tests:** repaired image imports blocking text revisions, selected-piece context, Create appending a second character, unsaved prompt text, immobile fixed-to-pivot changes and reference art leaking into Shadow view.
3. **Artwork correctness:** adopted new images before applying references to them; image edits replace unlocked artwork only when coordinates match. Changed dimensions preserve old clipped artwork and require retracing. Locks also prevent ancestor movement from changing a protected part.
4. **Fabrication audit:** improved scale precision, checked distinct overlapping pin holes, united tab boundaries, blocked incomplete cut contours, paginated long connection guides, and added Chinese print instructions and layer order.
5. **Live prompt audit:** tested the footballer, skirt and six-tentacle cases; added geometry-informed repair after real failures. Advice-only or invalid replies never become a claimed successful design.
6. **Image-to-parametric workflow:** added local extraction, reviewed splitting, dimensions and direction controls. Event tests exercise cleanup, color selection, extraction, split/hinge acceptance, deformation, connection following, export and portable reload without AI POST requests.
7. **Second fabrication review:** fixed contour union tolerances for small image coordinates. Preserved physical scale through added/deleted geometry, including small first pieces. Forced background comparisons to show image pixels even when the main view is Shadow or the reference is hidden. Cleared unfinished click tools when importing an image or selecting another piece.

## Release judgment

The local image-to-parametric workflow is ready for user testing, with automated checks for data, geometry and UI event paths. It still needs an actual browser and physical prototype check. Rich supplied artwork can now be turned into separately adjustable, hinged pieces without the generation API. Automatic semantic separation, reconstruction of hidden artwork and reliable visual prompt matching remain incomplete; they need the protected image/vision integration Kimi is developing and live output evaluation. The three reference characters are acceptance scenarios, not a claim that their screenshots have already become verified physical puppets.
