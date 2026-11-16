# 影作 · BNTA Shadow Puppet Studio

A bilingual student workspace with three processes: **Create → Refine → Make**. Current version: **0.7.6**. Projects stay in the open session; download a project file to keep your work before closing or reloading.

[Open the studio](https://zhinii.github.io/bnta-shadow-puppet-studio/) · [Functionality list](FUNCTIONALITY.md) · [UI/UX audit](UI-UX-AUDIT.md) · [Middle-school usability audit](MIDDLE-SCHOOL-UX-AUDIT.md)

## Design your own character

1. **Create:** describe your own historical, modern, fictional or real-world character and choose **Create character**. Optional style fields and construction templates stay under **Choose a style or starting shape**. You can also upload PNG/JPEG/WebP artwork.
2. **Refine:** check the **Remove the background** preview. If background remains, choose **Tap background to remove** and tap the space around the character. Squares show empty space; the green line shows the cut edge. **Continue to movement** then prepares a plan of numbered movement dots. In **Make it move**, adjust or remove dots, try each joint, then choose **Use these joints** once for the whole plan.
3. **Make:** set the **print height**, check the geometry, and choose **Print puppet**. Material settings and SVG exports are under **Materials & file options**.

The canvas presents one next action at a time. The default review shows the result; **Compare with original** switches to the original, and **Show result** returns to the proposal. Accept or keep the original before continuing. There is no required four-step Refine submenu or default three-way comparison.

The first screen contains no authored character or story. The former decoration module is absent. Optional construction templates provide different structures: an articulated figure, broad sleeves and a long skirt, wings and a tail, or six tentacles. They are editable geometry, not AI-generated images.

Artwork, cut contours and connections are separate. Imported or generated artwork retains texture and colors inside editable cut contours. Characters are not restricted to ten human body parts: a character can contain up to 80 pieces with arbitrary connection trees.

**Project** provides New, Open, Download and AI connection settings. Work stays in the open session only. Download before closing or reloading. Live image generation, cleanup and automatic joint review were checked. The final audit fixes have automated regression coverage; live file import, phone/tablet touch, operating-system print-dialog and physical assembly remain unverified; see [the UI/UX implementation audit](UI-UX-AUDIT.md).

## Keep the character, then add movement

Uploading artwork into an empty project, or accepting its first generated image, automatically opens the character cleanup review. Existing built pieces are preserved until you deliberately choose **Remove extras** to rebuild them. Cleanup runs locally without an AI request. It removes a connected plain background and proposes keeping the largest connected foreground region. This is a starting selection, not semantic character recognition. A separate hand, prop, foot or intentional ornament may initially be excluded; decoration touching the character may remain attached.

Review the result before accepting:

- **Tap background to remove:** tap a connected background area inside the picture. Review the checkerboard and green cut outline; **Undo last removal** reverses a wrong tap. **Cancel** returns from placement to the previous review. Separate regions of the same color are retained; connected matching artwork may be removed and must be reviewed.
- **Keep a missing piece or prop:** tap a separate intentional region to include it.
- **Choose the character:** tap the region that should be the main subject instead.
- Use **Compare with original** to check that limbs, costume details and requested props remain.
- Accept only after the selection is complete. Rebuilding an existing character replaces its pieces, joints and rod points; this is disclosed in the review and can be undone. Locked pieces must be unlocked before rebuilding.

If cleanup still looks like a large opaque rectangle, the app pauses before movement and makes background repair the main action. **Is the rectangle intentional? → Keep this whole shape** is available for deliberately rectangular puppets. **Fix background** also appears in invalid or empty joint reviews for image-based designs. Repair stays in a draft until acceptance; continuing rebuilds the outlines and discloses replacement of existing pieces and joints.

Accepting the selection creates editable cut outlines. A connected figure may still be one piece; the tool does not identify anatomical limbs or reconstruct hidden artwork.

After cleanup is accepted, the app automatically prepares a **Make it move** review. The local geometry tool finds possible narrow bends. One bounded AI request chooses useful points from those candidates using the student brief and outlines; if that request is unavailable, times out or returns an invalid selection, the app labels its local outline-based suggestions honestly. An existing editable design can start the same review with **Prepare joints**.

The proposed joints appear as numbered dots. Select a dot and use **Try this joint** to inspect its movement. **Zoom to this joint** shows the overlap detail; **See whole puppet** returns to the full character without resetting the trial angle. Drag a dot, use **Move dot** and tap its new position, or adjust a focused dot with arrow keys; Shift makes a larger nudge. **Add dot** and **Remove dot** let you change the plan. Edits rebuild the proposal from the original character, so moving or removing a dot does not leave abandoned cuts behind. Broad-cut eligibility uses that unchanged source outline; an earlier cut cannot change the area threshold for a later one. These edits and movement tests run locally without another AI request.

All unsuitable dots must be moved or removed before **Use these joints** is available. Accepting applies the whole plan in one undo step and retains its original resting pose, not the slider's test angle. **Keep original** discards the plan. With no remaining dots, **Make a still puppet** continues without adding joints. The plan supports up to 12 dots and remains subject to the 80-piece project limit.

Small round magenta marks inside the retained artwork can seed the plan automatically. Under **About these suggestions**, black-dot detection is available explicitly because eyes, buttons and decorations can resemble joint marks. Every detected mark is still a suggestion to review. Image detection leaves the source pixels intact: embedded colored or black marks remain in the artwork and exported pieces. The numbered editing overlay is separate and is not printed as artwork.

Each ready dot creates a shared pivot and rounded overlap material on **both** resulting pieces. The moving piece starts in front of its retained piece. Selecting a ready dot shows the solid blue back-tab outline and dashed orange front-tab outline; **Swap front / back** changes that joint’s layer order and keeps the choice while the plan is rebuilt. Broad sections, fragile slivers, disconnected fragments or nearby existing pins may prevent a proposal. This is geometric construction, not anatomical recognition or hidden-artwork reconstruction.

Manual construction remains available under **More editing tools → Place one joint myself**: tap a narrow section and review a close-up of the joint. The solid blue outline marks the back tab, and the dashed orange outline marks the front tab; **Adjust joint** offers **Swap front / back** and **Choose another spot**. For already separate pieces, **Join two existing pieces** takes one tap on each piece and proposes matching anchors for review. Exact two-point cuts and two-anchor placement remain advanced alternatives.

Both overlap tabs are united with their own piece's outer cut boundary, so cutting does not detach the tabs. The print guide labels the back and front pieces at each connection. Keep both tabs, punch the matching holes, and pass one paper fastener through the layers loosely enough for movement. Existing artwork stays intact; these added material tabs do not reconstruct hidden image content.

## Optional editing tools

The simple flow leaves detailed controls collapsed:

- **Adjust this piece:** rename or lock it, change Width and Length, edit its outline, choose artwork, change layers, or adjust joint settings. Width/length changes stretch the image, boundary and anchors together; attached pieces follow without stretching. **Set direction on the piece** defines the length axis for diagonal limbs. It preserves the current shape and resets percentages to 100%.
- **More editing tools:** suggest another joint plan, place a single joint, manually choose a character, find silhouette pieces, select a color region, remove a plain background, draw a piece, draw a two-point cut line, place two joint anchors manually, or add a control rod. Detected shapes can include lettering and decoration; keep only what you need. Manual tools remain available when the simple joint suggestion does not fit.
- **Ask AI for a change:** request a selected-piece geometry revision and review it before applying. New costume details or hidden surfaces require image editing or new artwork, not a numeric size change.
- **View tools:** Artwork/Shadow, joint/reference visibility, zoom, Fit, pan and Redo. Outline points support keyboard adjustment as well as dragging.

Adding, splitting, resizing or deleting pieces preserves the physical scale of other pieces. Changing the print height deliberately scales the puppet contours; the separately specified pin-hole diameter remains in millimetres.

The joint defaults are starting points for a paper prototype, not universal material standards. Suggested pin joints use a ±60° range, while the batch review tests ±45° around the resting pose. Their overlap radius is based on the pin-hole radius plus the larger of 2 mm or twice the selected material thickness. Material settings and advanced joint controls can be adjusted, but the on-screen range does not establish collision-free or mechanically safe movement.

The design principles follow classroom fabrication guidance: the [Natural History Museum of Los Angeles County](https://nhm.org/learning-resource/make-your-own-dinosaur-shadow-puppet) describes overlapping moving limbs, holes/fasteners and control rods; the [Pitt Rivers Museum activity](https://www.prm.ox.ac.uk/sites/default/files/prm/documents/media/shadow_puppets.pdf) reinforces joint ends and leaves paper fasteners loose enough to move. The app's numeric defaults are implementation choices, not dimensions prescribed by those resources.

The original image cannot supply artwork hidden behind a sleeve or arm. Extend or reconstruct these areas deliberately. Backing color affects tabs and uncovered areas rather than the image pixels. Background cleanup can affect similar-colored clothing touching the background. Interior transparent details remain artwork and are not automatically exported as internal cutouts. Local tools preserve concave outlines and reject boundaries they cannot simplify safely.

## AI capabilities and current deployment

**Image generation is connected to the new editor.** In Create, enter a custom prompt, optionally choose a style or starting shape, and select **Create character**. Review the image in the main workspace. In an empty project, accepting it automatically opens the local character cleanup review; accepting cleanup then prepares the joint plan. Existing pieces keep their original artwork until you deliberately replace or rebuild them.

The browser uses Kimi's protected `/api/puppet/image` route. Its portable image response is decoded, resized to at most 1600 pixels on the longest side and held as a normal project asset in memory. It is included when you explicitly download the project. The adapter makes one generation request and does not silently repeat paid calls after a failure. Earlier verified provider responses identified `wan2.7-image-pro`.

**Prompt limits depend on the route.** The existing Kimi image route accepts at most **800 characters in the complete prompt**, including the student's exact description and selected character, era, style and action settings. The optional v2 service and text-design requests retain a **4,000-character input limit**. Create shows a live character count and the available input budget after selected settings are included. During the initial connection check, it displays “Checking allowance…” and waits before enabling AI creation, so an early click cannot unexpectedly start a text draft. Uploads and construction starters remain available.

The v0.5.1 adapter preserves the student's wording and all selected settings. It adds compact optional image guidance only when space remains. It does not shorten the student's text or silently discard chosen presets to make the request fit. If the required content is too long, the request is stopped before sending and the student can shorten it or change selections. Request errors and progress appear beside the Create controls, where the prompt can be corrected.

When there is room, image guidance asks for one complete character and only requested props on a plain background, without unrequested text, stars, borders or scenery. Explicitly requested details and legitimate costume motifs remain part of the student's design.

Generation, image editing and vision are separate capabilities. The working Kimi route generates new artwork from text; it does not inspect the current image or automatically identify body parts. **Image editing, image analysis and AI anatomical separation remain unavailable through this route.** Local extraction, manual correction, splitting and parametric controls remain available after acceptance.

A successful image response does not establish prompt accuracy. In live tests, the footballer matched the main requested features, but the six-tentacle scholar had eight visible tentacles. The current review asks students to check limbs, costume and requested props; anatomy and appendage counts still need their judgment. Automatic visual evaluation is not claimed. The v0.5.1 panda verification attempt timed out before an HTTP response, so it produced no fresh image or prompt-quality evidence. The earlier trials do not validate the hotfix or its optional prompt guidance.

**AI-assisted joint planning is separate from image generation.** It sends candidate IDs, the student's brief and measured outlines to the protected text relay. AI may select existing candidates; it cannot replace the artwork or supply unchecked geometry. The current live route does not receive image pixels for this task. One controlled live horse-planning request selected the supplied neck and foreleg candidates in about 8.2 seconds. A later full browser journey selected unrelated regions instead. The final selection prompt emphasizes the requested movements and supplies measured region descriptors; live results for the revised prompt are limited to the synthetic checks below. These trials do not establish visual anatomy recognition or a general success rate. A later live check using newly authored geometric strips passed all three requested outcomes: one lower bend, one left bend and zero joints for a still puppet. A prose-only still response initially triggered fallback; an explicit empty-selection example corrected it on retest. These synthetic cases do not validate anatomical choices on real characters. Reproduce local fixtures with `node scripts/joint-relay-smoke.mjs`; the explicit `--live` option sends only the script’s synthetic shapes to the configured relay. A future vision-capable route can include a reference image only when that capability is advertised.

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
| `public/studio-construction.mjs` | One-tap joint suggestions, piece splitting and proposed pivot connections |
| `public/studio-joint-plan.mjs` | Bounded candidate search and batch rebuilding from original geometry |
| `public/studio-joint-ai.mjs` | One bounded AI candidate-selection request and honest local fallback |
| `public/studio-joint-markers.mjs` | Local magenta/optional black mark detection without changing source pixels |
| `public/studio-render.mjs` | Clipped artwork, united contours, precise holes and print packs |
| `public/studio-ai.mjs` | Exact prompt transport, capability checks, selected-piece scope, validation and one repair |
| `public/studio-storage.mjs` | Portable project files, image import and cleanup of former session snapshots |
| `public/studio-viewport.mjs` | Canvas zoom, pan and screen-scale editing calculations |
| `public/studio-app.mjs` | Three-stage student workflow and review controls |
| `server/studio-api.mjs` | Protected text, vision, generation, editing and visual evaluation |
| `public/legacy.html` | Preserved earlier editor |

[Validation evidence and limits](VALIDATION.md) · [Criteria audit](CRITERIA-AUDIT.md)

GitHub Pages serves **main / (root)**. It cannot host the provider secret or API adapter. The Check studio workflow tests changes independently of the automatic Pages deployment.
