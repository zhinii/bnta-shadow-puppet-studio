# File workflow validation — v0.9.0

The current release is a static GitHub Pages application. Earlier hosted-classroom checks in `validation/v080-live-hosted.json` document a retired architecture and are not requirements of this release.

**26 November 2026:** 392 tests passed, zero failures. Syntax checks, the static build and static smoke checks passed. The file workflow, close/replacement protection, legacy author selection and failed-download recovery are covered by 19 focused controller/event tests.

## Required checks

```sh
npm run check
npm test
npm run build
node scripts/smoke.mjs
```

The file-workflow tests verify:

- No class lookup, sign-in, classroom requests or polling on startup.
- New project opens into an editable local workspace without roster setup.
- Story, puppet artwork/rig, script, stage and reflections survive JSON download, closing and reopening.
- Typed drafts remain separate from accepted work and survive a download/reopen.
- Earlier project files preserve multiple workspaces and embedded artwork.
- Malformed or oversized imports preserve the current project and drafts.
- Undownloaded accepted edits trigger close warnings; replacement can be cancelled.
- Embedded editor messages require the expected same-origin frame.
- Static build contains no classroom client, server Worker or hosting manifest. All local module imports resolve.
- Shipped assets contain no classroom API, hosted-classroom URL or ChatGPT sign-in dependency.

Existing puppet geometry, joint sizing, artwork repair, print/export, AI parsing and image cleanup regressions remain in the suite. Network-classroom tests were removed with the feature; their old count should not be compared as current feature coverage.

## Limits

Rendered-event tests use a DOM harness and do not establish actual browser layout, mobile touch behavior or print-dialog behavior. A student usability trial and physical puppet test remain outstanding.

AI still uses the existing Kimi relay when requested. Earlier live AI samples are recorded in `validation/v080-live-classroom.json`; they show both successful revisions and a square-image limitation. They do not guarantee custom-prompt accuracy or hidden-layer reconstruction.

Project files contain embedded images rather than temporary image URLs. Downloading is an explicit browser action; the app cannot verify where a browser saved a file. Loading the site and using AI require network access. Project editing and JSON export/import do not require a classroom backend or database.
