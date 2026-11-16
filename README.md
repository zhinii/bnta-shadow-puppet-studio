# 影作 · BNTA Shadow Puppet Studio

A bilingual student workspace with three processes: **Create → Refine → Make**. Projects stay in the open session; download a project file to keep your work before closing or reloading.

[Open the studio](https://zhinii.github.io/bnta-shadow-puppet-studio/)

## Design your own character

1. **Create:** start blank, choose optional character/style fields, and describe your own historical, modern, fictional or real-world character. Import PNG/JPEG/WebP artwork, ask for an editable drawing plan, or choose an optional construction template.
2. **Refine:** follow **Clean image → Choose pieces → Add movement → Test**. Extract or trace pieces, correct outlines, split a piece, add joints and control-rod points, then test angles. Select a piece for contextual natural-language revisions. Large Before, Proposed and Side by side views keep the accept/keep-original decision visible. Locked parts and untouched artwork are preserved; undo restores accepted changes.
3. **Make:** set physical size and material settings, review geometry checks, then print the pieces and assembly guide or export SVG files.

The workspace gives the artwork more space, uses readable instructions and larger controls, and keeps advanced geometry settings collapsed until needed. The parts list includes artwork thumbnails and connection indicators. Zoom, Fit and pan help with precise editing; outline points support keyboard adjustment as well as dragging. **Project** always provides New, Open and Download. **AI status** describes service capabilities separately from puppet joints. Final browser/tablet verification remains necessary; see [the UI/UX implementation audit](UI-UX-AUDIT.md).

The first screen contains no authored character or story. The former decoration module is absent. Construction templates provide different structures: articulated figure, broad sleeves and long skirt, wings and tail, or six tentacles. They are optional editable geometry, not AI-generated images.

Artwork, cut contours and connections are separate. An ornate reference image can retain its original texture and colors inside editable cut contours. Characters are no longer restricted to ten human body parts. A character can contain up to 80 pieces, with arbitrary connection trees.

## Use imported artwork now

These tools run locally and need no image-generation API:

1. Import PNG/JPEG/WebP artwork. In **Refine → Clean image**, use **Remove plain background** if needed, inspect the transparency comparison, and accept it. The original image remains available in the open project.
2. Choose **Find silhouette pieces** for a transparent image or **Click to select a color region**. Review the boundaries before accepting. A connected character initially becomes one piece; these tools do not recognize anatomy.
3. Select a piece and choose **Split into hinged pieces**. Click two points defining the cutting line, preview the result, and accept. The two pieces retain their artwork and share a pin connection with reinforcement tabs. Cuts producing multiple disconnected fragments are rejected.
4. Change **Width** and **Length** in the selected-piece inspector. Its image, boundary and anchors stretch together; attached pieces follow the joint without stretching. **Set direction on the piece** defines the length axis for diagonal arms or tentacles. Changing that direction keeps the current shape and resets percentages to 100%.
5. For separately extracted pieces, choose a parent under **Suggest a pivot connection** and review the proposed connection. This uses proximity, not anatomical recognition. Manual **Add a connection** lets you click the parent and child anchors instead.
6. In **Add movement**, add control-rod points and joints; in **Test**, move joint angles and check **Shadow**. Continue to **Make** to print or export. Adding, splitting, resizing or deleting pieces preserves the physical scale of other pieces. **Print size → Height** deliberately scales the whole puppet.

Manual tracing remains available: choose **Draw a custom part**, click around its outline, then **Finish part**. **Edit outline points** corrects a boundary. Paint details stay in the image; changing the backing color affects tabs and uncovered areas, not the image pixels. Width/length changes deform existing pixels; new costume details or hidden surfaces need image editing or new artwork.

The original image does not contain artwork hidden behind a sleeve or arm. AI suggestions cannot recover the true hidden design; extend or reconstruct these areas deliberately. A single connected image is not automatically a functioning puppet.

Background cleanup removes similar colors connected to the image edge; clothing touching that background can be affected. Adjust the tolerance and review before accepting. Interior transparent details are not automatically exported as internal cutouts. The extraction tools retain the original pixel coordinates, preserve concave outlines, and reject boundaries they cannot simplify safely.

## AI capabilities and current deployment

**Image generation is connected to the new editor.** In Create, choose optional presets, enter a custom prompt and select **Generate artwork**. Review the image in the main workspace, then accept it to continue in **Refine → Clean image**. Existing pieces keep their original artwork until you deliberately replace or rebuild them.

The browser uses Kimi's protected `/api/puppet/image` route. Its portable image response is decoded, resized to at most 1600 pixels on the longest side and held as a normal project asset in memory. It is included when you explicitly download the project. Custom prompt text is retained in full; selected character, era, style and action fields are added as labelled context. The adapter makes one generation request and does not silently repeat paid calls after a failure. The verified provider response identifies `wan2.7-image-pro`.

Generation, image editing and vision are separate capabilities. The working Kimi route generates new artwork from text; it does not inspect the current image or automatically identify body parts. **Image editing, image analysis and AI anatomical separation remain unavailable through this route.** Local extraction, manual correction, splitting and parametric controls remain available after acceptance.

A successful image response does not establish prompt accuracy. In live tests, the footballer matched the main requested features, but the six-tentacle scholar had eight visible tentacles. The review explicitly asks students to check anatomy, appendage counts, costume and props. Automatic visual evaluation is not claimed.

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
