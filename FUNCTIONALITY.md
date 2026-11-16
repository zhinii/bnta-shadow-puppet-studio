# Shadow Puppet Studio · functionality and acceptance review

The student workflow is **Create → Refine → Make**. AI prepares proposals; students retain control over the character, movement and final result.

| Process | Available functionality | Practical boundary |
| --- | --- | --- |
| Create | Custom prompts, live character budget, optional character/world/style presets, image generation through the protected relay | Generation can misinterpret details; review the returned image |
| Create | Upload PNG/JPEG/WebP, draw custom shapes, four editable construction starters | Uploads are processed locally; templates are optional |
| Refine | Automatic subject cleanup, background removal, retain another piece/prop, choose a different subject | Complex backgrounds and connected decorations may need correction |
| Refine | AI selects among validated movement candidates; editable numbered dots | Current relay uses the brief and outline measurements, not visual anatomy recognition |
| Refine | Add, move, drag, keyboard-nudge and remove dots; detect magenta markers, opt-in black markers | Embedded dots remain source artwork; eyes and decoration can resemble black markers |
| Refine | Split at local movement sections; retain artwork; add real overlap tabs and aligned pin holes | Hidden artwork is not reconstructed; not a material-strength simulation |
| Refine | Motion preview, close-up, front/back swap, one acceptance and one undo for a whole joint plan | Trial poses do not change the accepted resting pose |
| Refine | Natural-language design proposals, selected-piece edits, before/after review, reject, undo/redo | Supported AI capabilities depend on the connected relay |
| Refine | Width/length controls, direction, editable outline vertices, drawing, manual splitting/joining, layers, locks and control-rod points | Advanced controls are optional; custom geometry still requires review |
| Make | Physical size, material/hole settings, fabrication validation, artwork SVG and cut SVG | Scale and fit must be checked on a paper prototype |
| Make | Tiled A4 print document, calibration ruler, numbered assembly instructions and front/back order | Printer-dialog behavior and physical assembly are separate checks |
| Project | English/Chinese interface, artwork/shadow view, zoom/pan, explicit project download/open | No automatic saving or restoration of closed sessions |

The detailed evidence, defects found and corrections are recorded in [UI-UX-AUDIT.md](UI-UX-AUDIT.md) and [VALIDATION.md](VALIDATION.md). Automated checks establish geometry, state transitions and request handling; they do not establish independent student usability or physical puppet strength.
