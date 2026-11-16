# 影作 · BNTA Shadow Puppet Studio

A bilingual student workspace with three processes: **Create → Refine → Make**. Projects stay in the open session; download a project file to keep your work before closing or reloading.

[Open the studio](https://zhinii.github.io/bnta-shadow-puppet-studio/)

## Design your own character

1. **Create:** describe your own historical, modern, fictional or real-world character and choose **Create character**. Optional style fields and construction templates stay under **Choose a style or starting shape**. You can also upload PNG/JPEG/WebP artwork.
2. **Refine:** choose **Remove extras**, review the proposed character, then **Add movement**. Tap two points across a knee, elbow, neck or another narrow section, preview the joint, and accept it. A compact angle control lets you try the movement. Add another joint if needed.
3. **Make:** set the **print height**, check the geometry, and choose **Print puppet**. Material settings and SVG exports are under **Materials & file options**.

The canvas presents one next action at a time. The default review shows the result; **Compare with original** switches to the original, and **Show result** returns to the proposal. Accept or keep the original before continuing. There is no required four-step Refine submenu or default three-way comparison.

The first screen contains no authored character or story. The former decoration module is absent. Optional construction templates provide different structures: an articulated figure, broad sleeves and a long skirt, wings and a tail, or six tentacles. They are editable geometry, not AI-generated images.

Artwork, cut contours and connections are separate. Imported or generated artwork retains texture and colors inside editable cut contours. Characters are not restricted to ten human body parts: a character can contain up to 80 pieces with arbitrary connection trees.

**Project** provides New, Open, Download and AI connection settings. Work stays in the open session only. Download before closing or reloading. Actual browser, tablet and print-dialog usability still needs verification; see [the UI/UX implementation audit](UI-UX-AUDIT.md).

## Keep the character, then add movement

**Remove extras** runs locally without an AI request. It removes a connected plain background and proposes keeping the largest connected foreground region. This is a starting selection, not semantic character recognition. A separate hand, prop, foot or intentional ornament may initially be excluded; decoration touching the character may remain attached.

Review the result before accepting:

- **Keep another piece or prop:** tap a separate intentional region to include it.
- **Choose a different character:** tap the region that should be the main subject instead.
- Use **Compare with original** to check that limbs, costume details and requested props remain.
- Accept only after the selection is complete. Rebuilding an existing character replaces its pieces, joints and rod points; this is disclosed in the review and can be undone. Locked pieces must be unlocked before rebuilding.

Accepting the selection creates editable cut outlines. A connected figure may still be one piece; the tool does not identify anatomical limbs or reconstruct hidden artwork. **Add movement** starts the two-point split tool. The cut must cross one narrow section twice. Review the resulting two pieces, their shared pivot and reinforcement tabs before accepting. Cuts producing multiple disconnected fragments are rejected. Try the selected joint's angle, then use **Add another joint** or continue to Make.

## Optional editing tools

The simple flow leaves detailed controls collapsed:

- **Adjust this piece:** rename or lock it, change Width and Length, edit its outline, choose artwork, change layers, or adjust joint settings. Width/length changes stretch the image, boundary and anchors together; attached pieces follow without stretching. **Set direction on the piece** defines the length axis for diagonal limbs. It preserves the current shape and resets percentages to 100%.
- **More editing tools:** manually choose a character, find all detected shapes, select a color region, remove a plain background, draw a piece, join two pieces, or add a control rod. Detected shapes can include lettering and decoration; keep only what you need. A suggested connection uses proximity, not anatomical recognition.
- **Ask AI for a change:** request a selected-piece geometry revision and review it before applying. New costume details or hidden surfaces require image editing or new artwork, not a numeric size change.
- **View tools:** Artwork/Shadow, joint/reference visibility, zoom, Fit, pan and Redo. Outline points support keyboard adjustment as well as dragging.

Adding, splitting, resizing or deleting pieces preserves the physical scale of other pieces. Changing the print height deliberately scales the whole puppet.

The original image cannot supply artwork hidden behind a sleeve or arm. Extend or reconstruct these areas deliberately. Backing color affects tabs and uncovered areas rather than the image pixels. Background cleanup can affect similar-colored clothing touching the background. Interior transparent details remain artwork and are not automatically exported as internal cutouts. Local tools preserve concave outlines and reject boundaries they cannot simplify safely.

## AI capabilities and current deployment

**Image generation is connected to the new editor.** In Create, enter a custom prompt, optionally choose a style or starting shape, and select **Create character**. Review the image in the main workspace, then accept it to continue in Refine with **Remove extras**. Existing pieces keep their original artwork until you deliberately replace or rebuild them.

The browser uses Kimi's protected `/api/puppet/image` route. Its portable image response is decoded, resized to at most 1600 pixels on the longest side and held as a normal project asset in memory. It is included when you explicitly download the project. The adapter makes one generation request and does not silently repeat paid calls after a failure. Earlier verified provider responses identified `wan2.7-image-pro`.

**Prompt limits depend on the route.** The existing Kimi image route accepts at most **800 characters in the complete prompt**, including the student's exact description and selected character, era, style and action settings. The optional v2 service and text-design requests retain a **4,000-character input limit**. Create always shows a live character count and the available input budget after selected settings are included.

The v0.5.1 adapter preserves the student's wording and all selected settings. It adds compact optional image guidance only when space remains. It does not shorten the student's text or silently discard chosen presets to make the request fit. If the required content is too long, the request is stopped before sending and the student can shorten it or change selections. Request errors and progress appear beside the Create controls, where the prompt can be corrected.

When there is room, image guidance asks for one complete character and only requested props on a plain background, without unrequested text, stars, borders or scenery. Explicitly requested details and legitimate costume motifs remain part of the student's design.

Generation, image editing and vision are separate capabilities. The working Kimi route generates new artwork from text; it does not inspect the current image or automatically identify body parts. **Image editing, image analysis and AI anatomical separation remain unavailable through this route.** Local extraction, manual correction, splitting and parametric controls remain available after acceptance.

A successful image response does not establish prompt accuracy. In live tests, the footballer matched the main requested features, but the six-tentacle scholar had eight visible tentacles. The current review asks students to check limbs, costume and requested props; anatomy and appendage counts still need their judgment. Automatic visual evaluation is not claimed. The v0.5.1 panda verification attempt timed out before an HTTP response, so it produced no fresh image or prompt-quality evidence. The earlier trials do not validate the hotfix or its optional prompt guidance.

Text cutting plans still use the older `/api/puppet` assistant in compatibility mode and may need correction. The client validates geometry and makes at most one text-plan repair request before rejecting unusable shapes. This does not apply to paid image generation.

The optional `/api/studio` server implementation supports richer text/vision/edit workflows, but that separate route was still unavailable in the live checks. See [the working image contract and optional v2 handoff](integration/IMAGE-HANDOFF.md). No API key is entered or embedded in the browser; the existing protected relay retains the provider credentials.

## Download, print and start fresh

- Neither the current nor classic editor automatically saves or restores a project. Closing, reloading or reopening starts a fresh session; browser back/forward restoration also restarts it. Project content and undo/chat history remain in memory only.
- **Project → Download project** exports a portable `.puppet.json` file containing the images, shapes, connections and settings. **Open project file** explicitly imports it later or on another device. Downloaded files are unaffected by a session reset.
- The former v2 IndexedDB snapshot and classic v1 project autosave are cleared on startup where browser storage permits. Blocked or unavailable storage does not prevent a fresh start. No unrelated browser data is cleared. The protected AI endpoint preference remains available across sessions.
- Artwork SVG and cut-outline SVG use consistent millimetre scale. The printable pack includes an assembly preview, connection guide, labelled pieces, 50 mm calibration and overlapping A4 tiles for large pieces.
- Cut outlines combine reinforcement tabs with the part boundary. Invalid or incomplete cutting geometry blocks export.
- The joint preview is planar. It does not simulate material stiffness, collisions, gravity or rod control. Make a paper prototype and check the 50 mm calibration at 100% print scale before fabrication.

Downloaded version 1 project files remain usable in the [classic editor](https://zhinii.github.io/bnta-shadow-puppet-studio/public/legacy.html), which also starts fresh and offers explicit Download/Open. The new editor rejects v1 files with a clear instruction rather than silently losing drawings or details. Former automatic browser snapshots are no longer a recovery mechanism.

## Run locally

Node.js 22 or later; no npm runtime dependencies.

```sh
npm start
```

Open `http://127.0.0.1:4237`. Without local provider configuration the browser checks the existing protected relay. For a standalone protected server, copy `.env.example` to `.env` and configure the existing account and region. Never commit credentials or place them in `public/`.

```sh
npm run check
npm test
npm run build
node scripts/smoke.mjs
```

The build creates a dependency-free Worker at `dist/server/index.js`, a portable manual editor at `START-HERE.html`, and the committed root entry used by GitHub Pages. AI from a local file depends on relay origin policy; hosted/localhost mode is preferred. Fonts fall back to installed fonts without network access.

## Source

| File | Responsibility |
| --- | --- |
| `public/studio-model.mjs` | Arbitrary geometry, transforms, locks and fabrication checks |
| `public/studio-parametric.mjs` | Width, length, axis and physical-scale controls |
| `public/studio-image-tools.mjs` | Local background cleanup, region selection and outline extraction |
| `public/studio-construction.mjs` | Piece splitting and proposed pivot connections |
| `public/studio-render.mjs` | Clipped artwork, united contours, precise holes and print packs |
| `public/studio-ai.mjs` | Exact prompt transport, capability checks, selected-piece scope, validation and one repair |
| `public/studio-storage.mjs` | Portable project files, image import and cleanup of former session snapshots |
| `public/studio-viewport.mjs` | Canvas zoom, pan and screen-scale editing calculations |
| `public/studio-app.mjs` | Three-stage student workflow and review controls |
| `server/studio-api.mjs` | Protected text, vision, generation, editing and visual evaluation |
| `public/legacy.html` | Preserved earlier editor |

[Validation evidence and limits](VALIDATION.md) · [Criteria audit](CRITERIA-AUDIT.md)

GitHub Pages serves **main / (root)**. It cannot host the provider secret or API adapter. The Check studio workflow tests changes independently of the automatic Pages deployment.
