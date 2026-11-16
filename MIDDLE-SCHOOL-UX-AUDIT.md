# Middle-school usability audit · 17 November 2026

Scope: an initial v0.7.5 interface/source audit and the supplied panda screenshot, followed by independent inspection of the v0.7.6 implementation and workflow regressions. Published desktop evidence is recorded in [VALIDATION.md](VALIDATION.md). This is an expert inspection, not a test with children. The screenshot does not include the saved project, so the retained-background diagnosis remains an inference.

## Verdict before this revision

The normal three-step structure is understandable, but background-recovery fails the independent-use requirement. A student can reach a rejected knee dot without being shown that the editable shape may still be an image-sized rectangle. The interface then tells them to move the dot instead of helping them repair the outline. Passing geometry tests does not establish that children can discover this recovery route.

The fix should retain **Create → Refine → Make**. Within Refine, explain the current task in plain language: **Remove the background**, then **Add movement**. Do not add another navigation system or require students to understand image-processing terms.

## Findings and required corrections

| Priority | Observed problem | Required behavior | Acceptance check |
| --- | --- | --- | --- |
| P0 | There is no explicit background-picking mode. Automatic removal and silhouette extraction are buried under More editing tools. | Put **Tap background to remove it** beside the cleanup preview. After activation say **Tap the space around your character** and provide Cancel. | A new student can discover background selection without opening advanced tools. Tapping must operate on displayed image coordinates. |
| P0 | A nearly solid rectangle can survive cleanup when substantial transparency already exists; its warning is hidden in About this change. | Show **The background may still be attached** next to the image, with a direct repair action. Pause automatic progression to joints until the result is reviewed. Permit a deliberate choice for an intentional rectangular object. | A transparent margin around an opaque image cannot silently advance as a finished character silhouette. A deliberately rectangular puppet still has a usable route. |
| P0 | The panda's joint error describes a broad cut and asks for another position, although retained background is a plausible cause. | For a suspected background problem, show **Remove the background first** and a **Fix background** action. Preserve ordinary position guidance for a genuine invalid joint. | From joint review, recovery takes the student directly to background selection without discarding the source image or changing it silently. |
| P1 | Generated-image review and cleanup review both say Use this character; students cannot tell what each acceptance does. | Use task-specific headings and next actions: picture approval, background check, then movement review. | Each screen has one primary next action whose label describes the next task. |
| P1 | White artwork and a white background look similar. A small rectangle boundary does not explain what will be cut. | Use a visible checkerboard behind transparency, a clear cut outline and a short legend: **Squares show empty space**. Allow comparison with the original. | The student can identify what will remain before accepting; white face and clothing stay legible. |
| P1 | Keep another piece/prop and Choose a different character solve different problems but do not repair a background. | Keep restoration and background removal as distinct, plainly named actions. Display them when the relevant preview is visible. | A missing separate prop can be restored without undoing successful background removal. Selecting a character does not imply selecting every same-colored pixel. |
| P1 | Selection tolerance, color region, silhouette and parent part assume specialist vocabulary. | Hide technical settings by default. Prefer **Remove more / less**, **Choose what to keep**, **Cut outline**, and **Piece to attach to** in the student path. | A complete ordinary project requires no knowledge of those technical terms. |
| P1 | Mode changes can be hard to notice on touch devices; artwork competes with long advice. | Keep one short instruction directly above the image; visually mark the active tap mode; show Cancel beside it. Keep the current image and action together. | At narrow widths, controls wrap without horizontal overflow. Blank canvas scrolls; tapping/dragging only consumes the gesture in its active editing target. |
| P2 | Make exposes useful physical checks, but a student may still treat the preview as a guarantee. | Keep the existing short paper-prototype instruction and matching numbered-hole assembly guide. | Output retains real overlap tabs, aligned holes, back/front order and the 50 mm ruler. |

## Required regression scenarios

1. A normal opaque image with a plain background: automatic cleanup gives a correct draft; the student can accept it without an unnecessary click to select the background.
2. An opaque picture inside a transparent margin: show the suspected-background recovery path before joint planning.
3. A background trapped inside a frame: selecting the interior background clears it while keeping the character; the old source remains available.
4. A multicolored character with enclosed white face/clothes and a separate prop: preserve the character colors, allow the prop to be kept, and clearly preview any edge-color loss.
5. A wrong background tap: keep a reversible preview; Cancel/Keep original returns to the previous valid state.
6. A suspect rectangle already in joint review: Fix background opens the corrective task and returns to a new reviewed outline, rather than advising repeated dot movement.
7. A transparent illustration and an intentionally rectangular puppet: avoid destructive automatic recoloring or a permanent dead end.
8. A prepared character: add/remove/move a knee dot, inspect overlap and motion, accept the rest pose, then prepare print and cut output.
9. Delayed cleanup, a new image, Cancel and New project: stale results cannot replace the newer design.

## Short student trial still needed

Ask several middle-school students to work independently on a character image with a background, including one deliberately troublesome framed image. Give only the goal: **Make the character bend at one knee, then prepare it to print.** Do not explain the controls first.

Record whether each student can find background removal, recognize a wrong cut outline, repair it, add/test a joint and reach print preparation. Record wrong taps, recoveries, time spent searching, and every adult hint. Ask the student to explain which areas become paper and where the two pieces overlap. A practical release gate is completion of the normal path without adult prompts, with recoverable mistakes on the troublesome image. This gate is proposed; no child-test result is claimed here.

Implementation results and live screenshots should be recorded in VALIDATION.md after the revision. Automated checks, expert inspection, actual phone interaction and student testing are separate evidence categories.

## Revision inspection

The revised application was independently re-read after the initial audit. The key corrections are present: a visible **Tap background to remove** action, a focused tap mode with Cancel, a checkerboard and green cut-edge overlay, a visible suspected-background warning, a blocked movement transition until repair or an explicit whole-shape decision, **Fix background** from failed joint review, **Undo last removal**, and an optional removal-range adjustment. Picture approval and cleanup now use different next-action labels. Advanced image tools remain collapsed.

The new workflow regressions exercise a rectangular image with a transparent margin, replacement by a head/arms/legs outline, preservation of an enclosed white face and the original pixels, one-step undo, restoration of failed-joint review after Cancel, locked-piece protection, an already-empty tap, and a late result after New project. Test-run outcomes and browser evidence belong in VALIDATION.md; reading these tests is not proof that they passed.

This resolves the main discoverability and recovery defects identified by the inspection. The revised flow still needs a real phone/tablet interaction check and the short independent student trial above. It does not establish reliable semantic separation of every character or background.
