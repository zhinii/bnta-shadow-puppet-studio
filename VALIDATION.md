# Validation · 16 November 2026

## Automated checks

The image-to-parametric release passes **142 automated tests**, including **15 workflow tests**. Reproduce with `npm run check`, `npm test`, `npm run build`, and `node scripts/smoke.mjs`.

Coverage includes arbitrary image-backed polygons; branched and chained connections; exact pivot coincidence under rotation; physical scale independent of pose; pin holes and united overlap tabs; invalid outlines and overlapping holes; locked parts and their ancestors; selected-piece AI edits; exact custom prompts; malformed, truncated and advice-only responses; one bounded AI repair; protected multimodal payloads; image retrieval and visual comparison; origin/request limits; secret exclusion; portable image round-trips; failed IndexedDB transactions; and the three-stage UI event workflow.

The 15 workflow tests cover the complete sequence: generated artwork and custom prompt/preset transport; review, discard and acceptance; local silhouette extraction; splitting with a hinge; adding a control rod; manual width changes and a selected-piece natural-language length revision; proposal acceptance, undo/redo and joint posing; artwork/cut SVG export and print HTML preparation; and portable save/reopen with artwork, dimensions, connections and rods preserved. The generation route uses controlled relay responses and real PNG pixel fixtures in a DOM/canvas double. Text revisions send numeric geometry without image bytes, and local construction/export operations make no additional AI POST requests.

Additional fixtures cover background-removal review, preserved originals and locked artwork, color-region selection, direction selection, attached-piece motion, stale proposals, and selection/import tool resets. New regressions ensure advice-only drawing responses remain visible without an Accept action, Enter/Space activate advertised SVG part/joint controls, keyboard selection requests focus restoration, and clicking a joint opens its child's movement controls without altering geometry. These tests verify event wiring and persistence, not actual browser focus, touch interaction, rendering or printing.

Model tests verify stable physical scale when adding, removing, splitting and resizing parts, including a small first piece. Raster tests check enclosed white regions, concave boundaries, disconnected pieces and rejection of unsupported opaque/complex outlines. Renderer regressions verify one closed reinforced boundary at four image resolutions and exact circular pin-hole diameters after artwork deformation. The split/export flow initially exposed a sub-unit segment tolerance defect; it was fixed and is now covered.

The build links modules into isolated scopes, syntax-checks the generated Worker and portable application, and serves both classic and new assets. Smoke tests cover 17 public assets, both API status routes, CORS preflight, foreign-origin rejection and missing resources.

## Working image relay checks

The new editor now calls the existing protected `POST /api/puppet/image` route with `{application,kind:"reference",prompt}`. Three real image-generation requests returned PNG data URLs and identified `wan2.7-image-pro`. A prior capability check timed out before sending the footballer request; retrying with the already verified capability succeeded. The browser now reuses its checked capability while making a request rather than repeating that preliminary network check. A subsequent live capability check correctly reported generation available, editing/vision unavailable.

Two outputs were retained and inspected, and were tested through the new adapter and local geometry tools:

| Prompt | Image response | Visible result | Local construction result |
| --- | --- | --- | --- |
| Blue/yellow footballer with separate ball | 1024×1024 PNG, about 52 seconds | Main costume, two arms/two legs, running pose and separate ball present | Background cleanup found figure and ball; split/hinge, pose, resize and artwork/cut SVG export passed |
| White-coated scholar with exactly six tentacles | 1024×1024 PNG, about 54 seconds | **Failed count:** eight visible tentacles, only one visible human arm | One connected silhouette; geometry-only split, hinge, pose, resize and both SVG exports passed |

The first long-robed scholar request established the live route and PNG response but was not retained for visual assessment; no fidelity claim is made for it. These are small concrete trials, not a general success-rate estimate.

The real image trials used a Node PNG header reader for the adapter, followed by independent System.Drawing pixel decoding for local extraction. Browser image decoding/resizing and UI acceptance are covered by DOM-double tests, not live browser automation. Sampled costume, face and ball pixels stayed unchanged after background cleanup. Physical scale remained unchanged through pose and resizing. Several unsuitable footballer split lines were rejected before a valid simple cut succeeded; the UI now explains that the line must cross one narrow section twice.

Generation is separate from automatic visual evaluation. Returned artwork is explicitly marked as unverified and students must check anatomy, counts, costume and props. Editing and vision remain disabled for the generation-only route. No provider credential is exposed and no paid generation call is automatically retried. The Kimi share link supplied by the user yielded only a public app shell; its full handoff text could not be read, so the integration is based on the verified live contract and repository client.

## Earlier live AI checks (before the local image-tools work)

The existing protected service responds at `/api/status` and reports a configured Qwen provider. Real requests tested a footballer with a separate ball, a long-skirt figure with wide sleeves, and a white-coated character with exactly six tentacles.

Early tests exposed instruction conflicts, advice-only responses, zero-area details and crossed ornamental boundaries. The client was refined to preserve the exact request, extract only parseable measurement data, validate complete geometry, and make one correction attempt. The service still retains the old fixed-character system prompt, so compatibility results are not a guarantee that arbitrary prompts will succeed.

The final repeated creation trial returned **3 structurally valid drafts out of 6 requests**: one footballer and two skirt designs. One footballer request timed out. Both tentacle cases still had invalid geometry after the repair and were rejected. This small trial measures structural validity, not visual fidelity or a general success rate. A separate live selected-sleeve revision passed and changed only that selected part.

At that earlier stage, `/api/studio/status` returned **404**, and the new image endpoint had not been deployed on the protected Kimi host. The local environment had no configured provider credential. Image analysis/generation/editing/evaluation tests then used controlled provider responses and established protocol handling only. They did not establish account authorization, output quality or actual live vision; the later real generation trials are documented separately above.

The initial local image-tools release made no live generation requests. The later bridge described above connects Kimi's now-working image route while preserving its classic client. The provider service and model selection are unchanged. Placeholder replacements for the classic app and CSS were restored, and a later syntax typo was repaired.

## Remaining verification

- Earlier browser-control attempts returned `Transport closed`. During the current audit, both browser control and the native computer connection were unavailable. Actual layout, touch/keyboard interactions, focus behavior and print dialogs still need browser verification. No live-browser or screenshot-based QA is claimed.
- Physical material strength, hole clearance, layered movement, light transmission and rod control require a prototype with the chosen material.
- Add and verify vision/image-editing capabilities separately. Test automatic image critique and selected-region revisions before advertising them. See `integration/IMAGE-HANDOFF.md` and `integration/STUDIO-V2-RELAY.md`.

GitHub Pages publishes the browser application; its successful deployment does not deploy or certify the separate AI service.
