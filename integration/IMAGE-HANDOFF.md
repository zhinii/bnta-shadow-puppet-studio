# Working image relay and optional v2 handoff

The new three-process editor now adapts Kimi's working image route directly. No server change or browser API key is required to use generation with the local extraction, splitting and parametric tools.

## Verified generation route — 16 November

`POST https://6ilmssim2bz2s.kimi.site/api/puppet/image`

```json
{"application":"shadow-puppet-studio","kind":"reference","prompt":"The student's character description"}
```

The verified response has `dataUrl`, `model` and `kind`; it does not supply image dimensions:

```json
{"dataUrl":"data:image/png;base64,...","model":"wan2.7-image-pro","kind":"reference"}
```

`public/studio-ai.mjs` preserves the exact custom prompt and all selected preset choices. The known legacy image route accepts **800 characters maximum in the complete `prompt`**, including those choices and any internal guidance. The v0.5.1 adapter adds compact optional rules only within the remaining budget. It never truncates student text or silently drops a selected preset; if the required description and settings do not fit, it rejects the request locally before a POST. It posts once, validates raster bytes and uses the existing browser importer to decode actual dimensions and resize to at most 1600 pixels on the longest side. It returns the editor's normal portable asset. The accepted asset can immediately use background cleanup, extraction, splitting and hinges. The original `public/agent.mjs` helper and classic image UI are preserved.

The public `/api/status` reports the configured Shadow Puppet Studio relay without individual image capability flags. For this verified known relay, the client exposes generation only. `/api/studio/status` and `/api/puppet/image/status` returned 404. A custom endpoint never falls back to another host; an advertised image endpoint must share its configured relay's origin. Generation is not automatically retried after a failed response.

This route is **text-to-image generation**, not image editing or vision. Existing project images are not sent to it. Do not enable `imageEditing`, `vision` or anatomical separation merely because generation works. Generated anatomy and counts remain unverified: the live six-tentacle request returned eight visible tentacles, which is why the student review remains necessary.

## v0.5.1 compatibility correction

The v0.5 internal generation rules expanded a 37-character panda description into a 1,335-character payload. This exceeded the existing image client's 800-character complete-prompt contract and produced the raw service error `prompt`. The fix applies that limit to the final legacy payload while preserving the exact description and selected settings. Optional compact guidance can be shortened or omitted; student content cannot.

The Create form derives its allowance from the route and selected fields, always shows the live character count against that allowance, and presents validation/request errors beside the creation action. The optional v2/text contract below continues to accept up to 4,000 characters of input; that limit does not apply to the legacy image prompt above.

The panda network verification attempt timed out before an HTTP response. It established neither a new successful generation nor image fidelity. Keep the earlier live PNG evidence separate from the hotfix's controlled payload and UI tests.

## Optional v2 service

The envelope below is still supported for a future richer service. It is not required for the working generation bridge above.

## Endpoint and capabilities

The default endpoint is `https://6ilmssim2bz2s.kimi.site/api/studio`. A different protected HTTPS endpoint can be entered in the studio's Connection panel.

Support:

- `GET /api/studio/status`
- `POST /api/studio`
- `OPTIONS /api/studio` and the status route as needed for CORS

Example status response:

```json
{
  "version": 2,
  "service": "Shadow Puppet Studio",
  "configured": true,
  "text": true,
  "vision": true,
  "imageGeneration": true,
  "imageEditing": true,
  "status": "Protected studio services configured."
}
```

Set each capability only when that route is implemented and configured. `vision` means the service accepts actual image pixels for analysis/part suggestions. `imageGeneration` enables generation and `imageEditing` independently enables editing; missing editing capability means unavailable. Generation alone establishes neither editing nor vision access. A configured flag is not a claim of verified model quality.

Allow the published origin `https://zhinii.github.io` and, for development, `http://127.0.0.1:4237` / `http://localhost:4237`. Return the allowed Origin in `Access-Control-Allow-Origin`, include `Vary: Origin`, allow `GET, POST, OPTIONS` and the `Content-Type` header. Keep host authentication and rate limits. CORS alone is not authentication.

## Browser request

The same request envelope handles text and image tasks. Extra context is useful but generation must retain the exact `prompt`.

```json
{
  "application": "shadow-puppet-studio",
  "version": 2,
  "task": "generate-image",
  "prompt": "A white-coated scholar with exactly six separate black tentacles and glasses.",
  "language": "en",
  "project": {
    "title": "",
    "brief": {"kind":"creature","era":"imagined","style":"paper-cut","keywords":"","action":""},
    "canvas": {"width":800,"height":1000},
    "conceptAssetId": null,
    "assets": [],
    "parts": [],
    "joints": [],
    "rods": [],
    "heightMm": 280,
    "holeMm": 3
  },
  "history": []
}
```

`prompt` is 1–4,000 characters. `language` is `en` or `zh`. Image editing uses `task: "edit-image"` and adds `imageDataUrl: "data:image/png;base64,..."`. Generation may also include an image reference. Image data currently accepts PNG, JPEG and WebP, up to 12,000,000 data-URL characters in a request. Treat existing artwork as a reference, not permission to change every region. Report inability to preserve requested features honestly.

## Image response

Return the image bytes in a portable asset, not a provider URL that expires:

```json
{
  "reply": "Review this character before accepting it.",
  "mode": "image",
  "proposal": null,
  "asset": {
    "id": "art-unique-id",
    "name": "Scholar concept",
    "mime": "image/png",
    "dataUrl": "data:image/png;base64,...",
    "width": 1024,
    "height": 1536
  },
  "warnings": []
}
```

The relay must download temporary provider output promptly, validate it, and return its actual dimensions. Use a unique ID containing letters, digits, `_` or `-` (maximum 96 characters). The client accepts raster data URLs only, at most 20 MiB of data-URL text, and dimensions from 1 to 8,192. PNG is preferred for transparency. Do not return executable SVG, HTML, credentials or arbitrary remote image URLs.

Keep the whole character inside the frame, with clear separated limbs and a plain or transparent background. Preserve the requested silhouette, garment shape and appendage count. Do not bake hinge holes, tabs, numbers or construction labels into the artwork: the editor adds precise construction geometry later.

For an image edit, retaining the source canvas dimensions helps preserve existing cut boundaries. Equal dimensions do not guarantee equal framing; the student must inspect alignment. If dimensions change, the editor retains existing piece artwork and presents the new image for retracing.

An optional `evaluation` object can contain a short `summary` and `checks` with `requirement`, `status` (`met`, `not_met`, `unclear`) and visible `evidence`. Put unmet or uncertain requirements in `warnings`, too. Evaluate actual returned pixels, not just the original prompt. A visual check is not proof of material strength or correct fabrication.

Return useful non-2xx errors as `{"error":"code","message":"clear explanation"}`. A provider timeout or unavailable model must not be reported as successful generation. The browser permits a longer image request and provides cancellation.

## Optional image-to-parts and parametric dialogue

If the service supports vision, `task: "segment"` includes the source `imageDataUrl` and its dimensions/ID in `project`. Return proposed part polygons in that source image's pixel coordinate system, each referencing the exact source `assetId`. The studio expects visible boundaries with finite numeric coordinate pairs and no self-crossings; hidden geometry must be flagged for reconstruction. Never infer that a whole visually connected shape must be one rigid piece.

For an already separated part, context includes:

```json
{
  "id": "sleeve",
  "assetId": "art-unique-id",
  "artworkMatrix": [1,0,0,1,0,0],
  "parameters": {"width":1,"length":1,"axisAngle":0,"origin":[400,300]}
}
```

When a student asks for a simple width or length change, reply with a proposal such as:

```json
{
  "reply": "Review a sleeve that is 20% longer.",
  "proposal": {"parts":[{"id":"sleeve","parameters":{"length":1.2}}]},
  "warnings": []
}
```

Width and length are **absolute multipliers from 0.25 to 4** relative to the part's baseline since its last manual axis change. If the current length is 1.5, “20% longer” means 1.8. Omit unchanged fields. Return only `parameters.width` and/or `parameters.length`; never combine them with a polygon edit in the same patch. `artworkMatrix`, parameter origin and axis are read-only context. The editor calculates the artwork deformation, cut boundary, anchor movement and physical scale. Other pieces keep their own shapes and follow their parent connections. Locked pieces and descendants are checked locally. If `selectedPartId` is supplied, modify only that part.

## What works without this API

Imported artwork can be processed on the student's device: plain edge-connected background cleanup, color-region selection, connected silhouette extraction, manual boundary correction, cut splitting, hinge placement and dimension controls. These deterministic tools do not perform semantic AI segmentation and cannot reconstruct hidden artwork. They remain usable when image generation is unavailable or a prompt must be corrected.

Keep the existing `/api/puppet` route available for the classic editor. For the complete supplied server adapter and configuration examples, see [STUDIO-V2-RELAY.md](STUDIO-V2-RELAY.md).
