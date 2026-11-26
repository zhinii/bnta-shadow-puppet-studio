# BNTA Shadow Puppet Studio

**Version 0.10.0** is a bilingual, file-based shadow-puppet workflow hosted on GitHub Pages.

[Open the studio](https://zhinii.github.io/bnta-shadow-puppet-studio/)

## Use the studio

1. Choose **New project**, enter a project name and optionally your name.
2. Work through **Story → Characters → Script → Design → Stage → Make**. You can return to any step.
3. Choose **Download project** to save a `.shadow-project.json` file.
4. On a later visit, choose **Open project** and select that JSON file.

The JSON file includes story text, characters, embedded artwork, joints, scripts, stage backgrounds and objects, reflections, versions and typed form drafts. Artwork reused in history is stored once. Downloading does not silently apply an unaccepted AI proposal.

Closing or reloading starts a fresh session. The app warns before leaving undownloaded edits or replacing them with another file. An in-app **Keep changes** button updates the open project; **Download project** keeps a copy after closing.

No class code, account, shared-classroom service, database or GPT-hosted site is required. Projects are processed in the browser and are not uploaded for saving. AI requests still use the existing protected Kimi relay and require an internet connection. Loading the website itself also requires a connection; this release is not an offline-installable app.

## Design and making

- Original stories and custom character prompts, with English/Chinese controls.
- Reviewable AI story, dialogue and selected-stage-object changes; visible edits carry forward into the next step.
- View-before-restore history, draft recovery, script emphasis/colour and character counts.
- Existing **Create → Refine → Make** puppet editor: generated/uploaded artwork, background cleanup, piece splitting, rounded overlapping joints, adjustable diameters, mirrored pieces and movement tests.
- Local colour/pattern correction on a marked region of one piece, plus overlap pattern sampling. These reuse visible artwork; they do not reconstruct hidden garments automatically.
- Repositionable pivots, temporary slider/drag trials, and five named motion tests recorded from actual joints. Restore returns to the saved pose; Keep this pose explicitly commits it.
- Stage backgrounds, characters, images, shapes and text; scene rehearsal.
- Physical scale, printable artwork/cut outlines, tiled A4 pages and assembly guidance.
- Reflection fields for decisions, tests and references.

Earlier `.shadow-class.json` downloads remain readable. Existing multi-workspace files show a workspace selector and retain the other work in the downloaded file. Old ownership assignments do not prevent editing a local file. Old classroom metadata is retained for compatibility, but class administration, online submission and teacher sign-in screens have been removed.

The independent puppet editor remains available from **Just make a puppet** and can open its earlier `.puppet.json` files.

## Development and deployment

Node.js 22 or later is needed for development checks, not for students using GitHub Pages.

```sh
npm run check
npm test
npm run build
node scripts/smoke.mjs
npm start
```

The build creates static `dist/` files, the root GitHub Pages entry and the portable individual puppet editor `START-HERE.html`. GitHub Pages serves the root entry and `public/` assets. No Worker, D1, R2 or database migration is needed. The optional Node development server serves static files and the existing AI proxy routes; it stores no projects.

[Functionality](FUNCTIONALITY.md) · [UI/UX review](UI-UX-AUDIT.md) · [Validation](VALIDATION.md)

[Slides 3–12 usability audit and validation limits](docs/slides-3-12-usability-audit.md)
