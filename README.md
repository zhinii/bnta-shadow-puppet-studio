# 影作 · BNTA Shadow Puppet Studio

A bilingual student workspace with three processes: **Create → Refine → Prepare & export**.

[Open the studio](https://zhinii.github.io/bnta-shadow-puppet-studio/)

## Design your own character

1. **Create:** start blank, choose optional character/style fields, and describe your own historical, modern, fictional or real-world character. Import PNG/JPEG/WebP artwork, ask for an editable drawing plan, or choose an optional construction template.
2. **Refine:** describe a change, select a particular piece when needed, compare Before and Proposed, then accept or discard. Locked parts and untouched artwork are preserved. Undo restores accepted changes.
3. **Prepare & export:** trace arbitrary pieces, edit their outline points, connect parent and child pivots, add fixed overlaps or pin hinges and control-rod points, test joint angles, then print or export.

The first screen contains no authored character or story. The former decoration module is absent. Construction templates provide different structures: articulated figure, broad sleeves and long skirt, wings and tail, or six tentacles. They are optional editable geometry, not AI-generated images.

Artwork, cut contours and connections are separate. An ornate reference image can retain its original texture and colors inside editable cut contours. Characters are no longer restricted to ten human body parts. A character can contain up to 80 pieces, with arbitrary connection trees.

## Use imported artwork now

Import the image, click around each moving piece, and choose **Finish part**. Select **Add a connection**, click the parent pivot, then the child pivot. Use the parts list to select a specific piece when images overlap. Holes and overlap tabs are generated from the connection settings. **Edit outline points** adjusts the boundary. **Shadow** hides the reference and shows the actual cut silhouette.

The original image does not contain artwork hidden behind a sleeve or arm. AI suggestions cannot recover the true hidden design; extend or reconstruct these areas deliberately. A single connected image is not automatically a functioning puppet.

## AI capabilities and current deployment

The published browser uses the existing protected Kimi-hosted Qwen relay. It first checks for the new `/api/studio` service, then uses the known `/api/puppet` text service when necessary.

The older service still pins fixed-character instructions. It can sometimes provide arbitrary polygon cutting plans as design advice, but live testing found inconsistent compliance and invalid outlines. The client validates returned geometry, makes at most one corrective request, and rejects unusable results without changing the project. Compatibility mode is labelled; it is not equivalent to a fully deployed v2 AI service.

**Image generation, image analysis, image editing and image-based part suggestions require the updated protected service.** The implementation is included, but publishing GitHub Pages does not deploy that separate host. Qwen vision analyzes images through chat; Qwen Image generates/edits pixels through a different endpoint, even if the same account key covers both. [Install and verify the updated relay](integration/STUDIO-V2-RELAY.md).

The new service also compares each generated image against the exact student request using vision. It reports missing or uncertain features for student review. This is a visual critique, not proof of identity, historical accuracy, material strength or successful fabrication. These image paths have protocol tests; their live provider behavior must be verified after deployment.

No API key is requested by or embedded in the browser. The Connection panel accepts a protected endpoint URL only. There is no unannounced fallback to another provider.

## Save, print and continue

- IndexedDB autosave stores the project and its artwork on this device. A failed save is reported explicitly.
- **Save project** downloads a portable `.puppet.json` file containing the images, shapes, connections and settings. **Open** restores it on another device.
- Artwork SVG and cut-outline SVG use consistent millimetre scale. The printable pack includes an assembly preview, connection guide, labelled pieces, 50 mm calibration and overlapping A4 tiles for large pieces.
- Cut outlines combine reinforcement tabs with the part boundary. Invalid or incomplete cutting geometry blocks export.
- The joint preview is planar. It does not simulate material stiffness, collisions, gravity or rod control. Make a paper prototype and check the 50 mm calibration at 100% print scale before fabrication.

Older version 1 projects remain usable in the [classic editor](https://zhinii.github.io/bnta-shadow-puppet-studio/public/legacy.html). Their existing browser storage is untouched. The new editor rejects them with a clear instruction rather than silently losing drawings or details.

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
| `public/studio-render.mjs` | Clipped artwork, united contours, precise holes and print packs |
| `public/studio-ai.mjs` | Exact prompt transport, capability checks, selected-piece scope, validation and one repair |
| `public/studio-storage.mjs` | Portable projects, image import and IndexedDB saves |
| `public/studio-app.mjs` | Three-stage student workflow and review controls |
| `server/studio-api.mjs` | Protected text, vision, generation, editing and visual evaluation |
| `public/legacy.html` | Preserved earlier editor |

[Validation evidence and limits](VALIDATION.md) · [Criteria audit](CRITERIA-AUDIT.md)

GitHub Pages serves **main / (root)**. It cannot host the provider secret or API adapter. The Check studio workflow tests changes independently of the automatic Pages deployment.
