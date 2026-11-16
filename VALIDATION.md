# Studio redesign validation — 2026-11-16

## Passed

- JavaScript syntax checks for app, model, renderer, client and server.
- 20 automated tests: blank initial state, legacy-project migration, visible age/face edits, independent garments, stable joints, enforced feature/part locks, selective AI acceptance, ignored unsupported edits, printable contours and A4 oversize guard, prop pagination, project round trips, safe imports, response validation and server request protections.
- UI state tests with a minimal DOM double: Shape, Style, Test, Make, optional Story, My puppets, empty character creation, Before / Proposed review, partial acceptance, saved versions, restore, print and Chinese labels.
- Generated HTML structure: matched container tags and no duplicate SVG IDs across nine captured states.
- Dependency-free build, offline combined-source parse and built-server asset/status smoke checks.

## Verification limits

- Browser connection returned Transport closed, so there is no live visual, touch, keyboard or print-dialog verification in this session. UI state tests are not browser tests.
- A live request to the configured Kimi puppet endpoint failed with ENOTFOUND (hostname resolution unavailable here). Mocked AI replies establish frontend behavior only. The relay URL already configured on GitHub was preserved.
- Physical materials, joints, lighting and control rods still need a classroom prototype. Animation does not simulate those properties.

GitHub Pages continues to serve main / (root), without a custom deployment workflow.
