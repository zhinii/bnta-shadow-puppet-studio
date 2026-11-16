# Build validation — 16 November 2026

## Passed

- JavaScript syntax checks for application, model, renderer, agent, server adapter and built Worker.
- 11 automated tests: project round trip; hierarchical joint transforms; shape locks and selected-part edits; untrusted project content; A4 page bounds; relay envelope; truncated/robot-only response rejection; input/origin limits; secret exclusion; protected Kimi forwarding; six-view rendering and character creation using a minimal DOM double.
- Built Worker in-process smoke test: all six public assets, missing route and API status.
- Self-contained HTML build parsed successfully.

## Not verified

- Real-browser rendering, pointer/touch interaction, PNG download and print-dialog behavior: browser connection unavailable.
- Live Kimi inference: the execution environment could not resolve the Kimi hostname. Mocked transport checks do not establish a live connection.
- Physical material, hole sizes, fasteners, control rods and translucency: require classroom prototyping.

## Deployment status

- The user created the public GitHub repository `zhinii/bnta-shadow-puppet-studio`. Source synchronization uses the authenticated GitHub connector.
- GitHub Actions checks source on pushes and pull requests. The separate Pages workflow publishes `public/` on pushes to `main` after GitHub Pages is enabled for the repository.
- A private ChatGPT Site was registered, but no version was published. Git source synchronization failed because the execution environment could not resolve its hosting Git endpoint.
- The existing robot repository and live Kimi service were not changed. The new studio reuses the robot client's configured Kimi URL and includes a separate puppet adapter for its maintainer if server-side instructions are pinned.

## Continue

1. Extract the archive and open `START-HERE.html` to try the manual studio immediately.
2. Run `npm start` for the localhost version, or deploy the source when network access is available.
3. Choose **GitHub Actions** under repository **Settings → Pages** to enable publishing, or run `Enable-GitHub-Pages.ps1` from a network-connected, GitHub-authenticated Windows session.
4. Test AI in the studio. If the protected relay enforces robot instructions, follow `integration/KIMI-RELAY.md` to add the puppet route while preserving the robot route.
