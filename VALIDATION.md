# Validation · 16 November 2026

## Automated checks

The final local run passed **85 automated tests**, syntax checks, the portable/Worker build and the built-service smoke checks. Reproduce with `npm run check`, `npm test`, `npm run build`, and `node scripts/smoke.mjs`.

Coverage includes arbitrary image-backed polygons; branched and chained connections; exact pivot coincidence under rotation; physical scale independent of pose; pin holes and united overlap tabs; invalid outlines and overlapping holes; locked parts and their ancestors; selected-piece AI edits; exact custom prompts; malformed, truncated and advice-only responses; one bounded AI repair; protected multimodal payloads; image retrieval and visual comparison; origin/request limits; secret exclusion; portable image round-trips; failed IndexedDB transactions; and the three-stage UI event workflow.

The workflow harness imports artwork, traces two parts, connects them, adds a control rod, exports/reopens the project, requests a text revision and accepts/undoes changes. It also verifies original artwork and locks survive project import. These are DOM-double tests, not browser automation.

The build links modules into isolated scopes, syntax-checks the generated Worker and portable application, and serves both classic and new assets. Smoke tests cover 14 public assets, both API status routes, CORS preflight, foreign-origin rejection and missing resources.

## Live AI checks

The existing protected service responds at `/api/status` and reports a configured Qwen provider. Real requests tested a footballer with a separate ball, a long-skirt figure with wide sleeves, and a white-coated character with exactly six tentacles.

Early tests exposed instruction conflicts, advice-only responses, zero-area details and crossed ornamental boundaries. The client was refined to preserve the exact request, extract only parseable measurement data, validate complete geometry, and make one correction attempt. The service still retains the old fixed-character system prompt, so compatibility results are not a guarantee that arbitrary prompts will succeed.

The final repeated creation trial returned **3 structurally valid drafts out of 6 requests**: one footballer and two skirt designs. One footballer request timed out. Both tentacle cases still had invalid geometry after the repair and were rejected. This small trial measures structural validity, not visual fidelity or a general success rate. A separate live selected-sleeve revision passed and changed only that selected part.

`/api/studio/status` returned **404**. The new image endpoint was not deployed on the protected Kimi host in this session. The local environment has no configured provider credential. Image analysis/generation/editing/evaluation tests use controlled provider responses and establish protocol handling only. They do not establish account authorization, output quality or actual live vision.

## Remaining verification

- Browser control returned `Transport closed` on both attempts. Actual layout, touch/keyboard interactions and print dialogs need browser verification. No screenshot-based QA is claimed.
- Physical material strength, hole clearance, layered movement, light transmission and rod control require a prototype with the chosen material.
- Enable the updated protected relay and repeat the three live character cases, then compare generated pixels against their prompts and test a selected image revision. See `integration/STUDIO-V2-RELAY.md`.

GitHub Pages publishes the browser application; its successful deployment does not deploy or certify the separate AI service.
