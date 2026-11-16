# 影作 · BNTA Shadow Puppet Studio

A bilingual, component-based Chinese shadow-puppet design prototype. Students start with an unnamed, plain puppet and follow **Shape → Style → Test → Make**. Story is optional and begins empty.

## Run locally

**Quick start from the downloadable ZIP:** extract it, then open `START-HERE.html` in your browser. Manual design, movement, project files and printing work without a server. AI still needs access to the protected Kimi service, and that service may reject local-file origins. Use hosted or localhost mode for the intended AI workflow.

Requires Node.js 22 or newer. There are no npm dependencies.

```sh
npm start
```

Open `http://127.0.0.1:4237`. The AI transport preserves the dedicated protected Kimi puppet endpoint configured in the repository:

`https://6ilmssim2bz2s.kimi.site/api/puppet`

The host is Kimi Sites; this URL alone does **not** identify the underlying model provider. The request retains the six-axis client's OpenAI-compatible envelope and Qwen model hint. The hosted relay remains authoritative about the model and secret it uses.

The same-origin `/api/puppet` adapter forwards requests to that relay without copying its API key. GitHub Pages serves the repository-root entry page and uses the protected puppet relay from the browser. If the Kimi host rejects the new origin or pins robot-only instructions, update its source as explained in [integration/KIMI-RELAY.md](integration/KIMI-RELAY.md). This repository cannot publish changes to Kimi itself.

For a separate server-side Qwen connection, copy `.env.example` to `.env` and set `ALIBABA_API_KEY`, `ALIBABA_BASE_URL`, and `ALIBABA_MODEL`. Supported aliases are `QIANWEN_API_KEY` and `DASHSCOPE_API_KEY`. Never place credentials in `public/`, JSON project files, GitHub, or hosting manifests.

## Implemented

- English / Chinese interface, responsive student workspace.
- Optional empty project story, AI drafts based on a student-supplied idea, and individually accepted character suggestions.
- Up to 12 puppets, each starting as a plain, unnamed connected template. No seeded story or characters.
- Ten separately editable body parts with nine hierarchical connections.
- Visual choices for hair, face shape, costume and pattern; age-related facial details and colors. Gender is explicitly descriptive metadata, not an automatic visual preset.
- Per-part width, length and angle; independent garment sleeve width, sleeve length and hem length. Feature locks protect face, body, costume and props from AI.
- Freehand decoration on a selected part; clipped to its outline.
- Five prop types, attachment choice, drag positioning, size and rotation.
- Optional AI assistant with Before / Proposed previews, normalized per-field change checkboxes, no-op detection, local lock enforcement and stale-proposal rejection; undo / redo.
- Wave, walk and reading previews, plus custom joint angles.
- Browser autosave, project JSON import/export, last 12 revision snapshots in a Versions drawer.
- Transparent PNG, complete SVG, scaled A4 parts sheets, separate props and an assembly guide. Browser Print can save the multipage pack as PDF.
- Request size limits, bounded upstream destination, timeouts, per-process request throttles, schema normalization, safe SVG output.

Existing saved projects are preserved. Use **New project** to start a blank design; Undo can restore the preceding project. Downloads transfer projects between devices. Costume edits retain bone lengths and joint positions; short sleeves and hems preserve the joint connection areas. Oversized A4 pieces are flagged before print/export, with a suggested smaller height.

## Scope and limitations

This first release uses parameterized vector artwork. AI proposes changes to an explicit design schema; it does not run a fine-tuned image-generation model, create arbitrary bitmap imagery, or segment arbitrary uploaded photographs. Hair and costume options have deliberate bounds. The instructional templates are contemporary interpretations inspired by Chinese shadow puppetry, not authenticated regional replicas.

The animation is a planar joint preview. It does not model collisions, stiffness, gravity, rod control, or material strength. Physical joints, attachment methods and translucency must be tested with the teacher's chosen material. The template height is a neutral design envelope; props are printed separately and need a physical size check. Pattern lines are printed artwork, **not** machine cutting paths. No laser/knife G-code is emitted.

Projects are local to the current browser, not synchronized across devices. Download project JSON for backup or group exchange. There are no student accounts or shared class database in this version. Story and character data is sent to the configured AI relay only when the student requests AI assistance. The application does not log prompts, replies or API keys; provider/hosting logs are governed by those services.

The Kimi relay's live acceptance must be verified on the deployment network. A successful unit test with a mocked provider is not evidence of a live AI call. If the relay still returns robot actions, the app reports that configuration mismatch instead of pretending the design changed.

## Source layout

- `public/model.mjs`: normalized project data, joints, physical layout and edit constraints.
- `public/render.mjs`: original vector artwork, puppet assembly, print sheets.
- `public/agent.mjs`: puppet-specific instructions and protected Kimi transport.
- `public/app.mjs`: student interaction, local persistence, history, exports.
- `server/api.mjs`: same-origin relay adapter and optional direct Qwen connection.
- `server.mjs`: local Node server.
- `scripts/build.mjs`: dependency-free Cloudflare Worker build with embedded assets.
- `integration/`: protected relay adaptation instructions and a dedicated route.

## Validation

```sh
npm run check
npm test
npm run build
node --check dist/server/index.js
node scripts/smoke.mjs
```

Tests cover project round trips, joint relationships, part locks, unsafe imported content, print bounds, truncated/robot-only AI responses, origin checks, request limits, secret exclusion and the Kimi transport envelope. Browser and live-provider verification must be recorded separately.

## Hosting

The private ChatGPT Site uses `.openai/hosting.json` and `dist/server/index.js` with a default Worker fetch handler. `npm run build` creates the deployment output; it embeds only public assets and the adapter, never `.env`.

GitHub Pages serves the committed root `index.html` and `public/` assets directly. No custom deployment workflow or build is needed on GitHub. GitHub Pages cannot host a secret or the server adapter; the protected external relay must allow the published GitHub origin.

Source repository: https://github.com/zhinii/bnta-shadow-puppet-studio

In repository **Settings > Pages > Build and deployment**, choose:

- **Source:** Deploy from a branch
- **Branch:** main
- **Folder:** /(root)

Click **Save**. After GitHub finishes publishing, open https://zhinii.github.io/bnta-shadow-puppet-studio/ . Future pushes to `main` update the site automatically. GitHub may display its own internal Pages deployment in Actions; there is no custom Pages workflow to configure. The remaining `Check studio` workflow only runs automated checks and is independent of publication.

If editing `public/index.html`, run `npm run build` and commit the regenerated root `index.html` too. See [VALIDATION.md](VALIDATION.md) for verification limits.

## Research reference

Zhihao Yao et al. (2024), *ShadowMaker: Sketch-Based Creation Tool for Digital Shadow Puppetry*. CHI EA 2024. DOI: https://doi.org/10.1145/3613905.3648657.

This is an independent implementation inspired by the paper's component-first approach. No author code, training dataset, trained weights or museum artwork is included.
