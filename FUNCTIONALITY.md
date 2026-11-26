# Functionality — v0.9.0

| Task | Available behavior |
| --- | --- |
| Start | New project with a title and optional author name; no account or class code |
| Continue | Open a downloaded project JSON file; starts in its saved workspace and step |
| Story | Original time, place, characters and plot; local version history; reviewed AI suggestions |
| Characters | Add briefs and edit every character in the project without assignment gates |
| Script | Add scenes, settings and dialogue; local version history; reviewed AI revisions |
| Design | Embedded Create/Refine/Make editor, custom prompts, upload, cleanup, splitting, rounded overlaps, joint size and pattern repair |
| Movement | Bend actual joints, inspect both overlap layers and restore the resting pose |
| Stage | Background upload/generation, characters, images, text and shapes; position, size, rotation, layers and scene rehearsal |
| Make | Scale and material settings, cut/artwork SVGs, tiled A4 printing, ruler and assembly guidance |
| Reflection | Save decisions, sources and reported movement/physical tests in the project |
| Keep work | Download one JSON with artwork, joints, story, script, stage, reflection, history and typed drafts |
| Avoid loss | Close warning for undownloaded work; explicit replacement confirmation; invalid import leaves current work intact |
| Compatibility | Earlier class-project files retain their contents; multiple workspaces remain selectable; individual puppet files open in the puppet editor |
| Languages | English and Chinese |

Removed: network classroom client, API and storage adapter; class codes; accounts and sign-in; live polling; class/group administration; online submissions and grading screens; database migrations/bindings; GPT-site routing; server/Worker build requirement.

The original JSON schema retains older class-shaped metadata so downloaded projects remain readable. That does not create a network service or database dependency.

AI remains an optional network service through the existing protected relay. Generation can misinterpret prompts. Per-piece pattern repair repeats existing pixels rather than inferring hidden clothing. A digital joint preview does not verify physical strength, rod control or cultural authenticity.
