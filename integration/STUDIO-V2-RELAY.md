# Studio image and custom-design relay

The existing protected `/api/puppet` service is operational. It pins the previous ten-part vector editor's instructions and accepts text messages only. The new browser can request **editable drawing plans**, expressed as measurable paper-cutting advice, but live tests show this compatibility path sometimes refuses custom geometry. It is a limited fallback, not a reliable replacement for the updated relay. It does not claim that flat vector plans are generated reference artwork. Image import, tracing, connections and export work without an AI image service.

The repository also implements the protected `/api/studio` service with actual Qwen text, visual analysis, part-outline proposals, and Qwen Image generation/editing. Installing this service on the existing Kimi host reuses its environment key; no key is moved to the browser. A successful `/api/studio/status` means configuration is present, not proof that the account has access to every model.

## Install on the protected host

Copy `public/studio-model.mjs`, `public/studio-ai.mjs`, and `server/studio-api.mjs`, retaining their relative paths. Route `GET /api/studio/status`, `POST /api/studio`, and `OPTIONS` to `handleStudioApi(request, env)`. The supplied local `server.mjs` and generated Worker already route these paths. For a Next server, a catch-all route `app/api/studio/[[...path]]/route.ts` can export:

```ts
import {handleStudioApi} from '../../../../puppet/server/studio-api.mjs';

const env = {
  ALIBABA_API_KEY: process.env.ALIBABA_API_KEY,
  QIANWEN_API_KEY: process.env.QIANWEN_API_KEY,
  DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY,
  ALIBABA_BASE_URL: process.env.ALIBABA_BASE_URL,
  ALIBABA_MODEL: process.env.ALIBABA_MODEL,
  ALIBABA_STUDIO_MODEL: process.env.ALIBABA_STUDIO_MODEL,
  ALIBABA_VISION_MODEL: process.env.ALIBABA_VISION_MODEL,
  ALIBABA_IMAGE_MODEL: process.env.ALIBABA_IMAGE_MODEL,
  ALIBABA_IMAGE_ENDPOINT: process.env.ALIBABA_IMAGE_ENDPOINT,
  STUDIO_ALLOWED_ORIGINS: process.env.STUDIO_ALLOWED_ORIGINS,
};
export const GET = (request: Request) => handleStudioApi(request, env);
export const POST = (request: Request) => handleStudioApi(request, env);
export const OPTIONS = (request: Request) => handleStudioApi(request, env);
```

Adjust the import path to the deployed files. Retain the host's authentication and account-level rate limiting around these handlers. Default permitted browser origins include `https://zhinii.github.io`, `http://127.0.0.1:4237`, and `http://localhost:4237`. Additional exact origins can be listed in `STUDIO_ALLOWED_ORIGINS`, comma-separated. CORS is not authentication.

## Provider configuration

- Reuse `ALIBABA_API_KEY`, `QIANWEN_API_KEY`, or `DASHSCOPE_API_KEY` from the protected environment.
- Preserve the existing regional `ALIBABA_BASE_URL` for chat. The default is the existing Token Plan chat alias.
- `ALIBABA_STUDIO_MODEL` defaults to the existing `ALIBABA_MODEL`, then `qwen3.8-flash`.
- `ALIBABA_VISION_MODEL` can be `qwen3.8-max` if the account grants it; it otherwise defaults to the text model. These models analyze image input and return text/JSON.
- Set `ALIBABA_IMAGE_ENDPOINT` explicitly for image generation. For the documented Singapore Token Plan service: `https://token-plan.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`. The key, model and endpoint must belong to a compatible region/account.
- `ALIBABA_IMAGE_MODEL` defaults to `qwen-image-3.0-pro`.

Do not set an image endpoint merely because text requests succeed. Confirm the account/region first. A key may cover both services, but the request paths and model types differ. No provider URL or model override is accepted from student requests.

## Verify after deployment

1. Open `/api/studio/status`. Confirm `version: 2`, `text: true`, and the intended capabilities. No credential appears in status.
2. In the studio, use the protected `/api/studio` URL. Create a football player with a separate ball, a figure with a long skirt and wide sleeves, and a scholar with exactly six tentacles. Inspect the returned parts and accept the draft only when appropriate.
3. Import a known image and ask **Analyze** to describe visible colors and count visible appendages. Use a deliberately different brief and ensure the response identifies the discrepancy. A text-only endpoint must display an unavailable message, never claim to see the pixels.
4. Run **Generate artwork**, then **Revise artwork**. The server downloads the provider's temporary PNG promptly and returns its bytes, so accepted projects do not depend on expiring URLs. It then makes one bounded visual comparison using the configured vision model, checking the actual PNG against the exact prompt. Missing or uncertain features are returned in warnings. If the visual check fails, the artwork remains available with an explicit review warning; there is no automatic regeneration or claim of success.
5. Ask for only the sleeve color to change; compare the candidate with the original. Pixel edits have no exact mask guarantee and are blocked when pieces are locked. Students must review the candidate.
6. Ask for part outlines and test each joint in Prepare. AI polygons are approximate, and obscured artwork must be repaired manually. No AI result is treated as a physically tested puppet.

The client validates every editable proposal against the real part geometry model. It allows at most one AI repair attempt using the original prompt, prior proposal, and precise validation error. Invalid geometry after that attempt is rejected, and the original project remains unchanged. Selected-part refinement keeps that part's source artwork and filters unrelated edits. Locked parts are protected locally.

The source-only adapter and mocked protocol tests do not constitute a live image-service test. Record actual provider outcomes after the protected host is updated. The older text service has been tested live; its pinned instructions can still refuse nonhuman shapes, so UI capability status explicitly marks its custom drawing support as limited.

## Recorded live checks — 2026-11-16

The final compatibility test sent each custom creation prompt twice through the actual protected `/api/puppet` endpoint, using the shipped parser, geometry validation and at most one repair per request:

| Prompt category | Structurally valid drafts | Other outcomes |
| --- | ---: | --- |
| Modern soccer player, blue/yellow uniform, separate football | 1 of 2 | 1 connection timeout |
| Traditional-inspired figure, wide red sleeves and long bell skirt | 2 of 2 | — |
| White-coated scholar with exactly six separate tentacles | 0 of 2 | Both rejected after one repair because coordinates were invalid |

Thus **3 of 6 creation attempts produced structurally valid drafts**, not a reliable general-purpose result. These checks confirm editable coordinates, not visual fidelity, cultural accuracy or physical fabrication. The earlier legacy system sometimes refused any custom polygons, reinforcing the need to update its instructions and endpoint rather than treating the fallback as production-ready custom generation.

A separate live selected-sleeve refinement returned a valid width change and modified only `forearmFront`; the client kept the source artwork and other parts unchanged. This was one successful case, not a general reliability claim. The server returned CORS headers for `https://zhinii.github.io` on the existing status endpoint; `/api/studio/status` returned 404, confirming the updated route is not deployed. No live image generation or vision evaluation is claimed.

The 15 automated AI/protocol tests cover prompt preservation, scoped edits, malformed output, geometry repair limits, protected endpoint behavior, multimodal payloads, image persistence, post-generation visual comparison and credential isolation. Provider calls in those tests are mocked and are reported separately from the live checks above.

## Official API references

- [Qwen image/video understanding](https://www.alibabacloud.com/help/en/model-studio/vision)
- [Token Plan image generation](https://www.alibabacloud.com/help/en/model-studio/token-plan-image-generation)
- [Qwen Image generation and editing](https://www.alibabacloud.com/help/en/model-studio/qwen-image-generation-and-editing-api-reference)

Reviewed 2026-11-16. Qwen Image uses `input.messages[].content` with image/text entries at the DashScope image endpoint; Qwen vision uses image_url/text content blocks at chat/completions. The browser never receives the provider key.
