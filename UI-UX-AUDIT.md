# File workflow usability review — v0.9.0

The user identified that class codes and a second hosting address made it difficult to begin. The revised entry has **New project** and **Open project**. A new project opens directly into Story, with the complete Story/Characters/Script/Design/Stage/Make workflow available.

| Usability issue | Change | Check |
| --- | --- | --- |
| No class code or account | Removed join, login, teacher management and shared-service calls | Startup and rendered-view regressions |
| Unclear where work is saved | Header and Make step show Download project; welcome/footer explain JSON download and reopening | Both language views and complete file roundtrip |
| Saving a form confused with saving a file | Status says changes are in the open project; embedded editor says to download the project afterward | Controller and source review |
| Losing completed edits after closing | Track undownloaded accepted edits as well as typed drafts; warn before leaving | Event-harness regression |
| Replacing work accidentally | Replacement dialog offers download, cancel and explicit replace | Event-harness regression |
| A bad file destroys the open project | Validate import first; keep current work and drafts on errors | Invalid/oversized import tests |
| Student blocked by character ownership | Local author can edit every character | Imported ownership view regression |
| Earlier files lose work | Retain older schema and embedded images; show a selector for multiple imported workspaces | Roundtrip and compatibility tests |
| Online submission implies cloud saving | Make ends with reflection and JSON download | Rendered-view regression |

The intended routine is: **open the GitHub page, create or open a project, work, download JSON, and reopen that file next time**. There is no automatic restoration of a closed browser session.

These checks establish application state and event behavior. A fresh middle-school trial and visual phone/tablet review are still needed to establish independent usability. Physical printing, cutting, pin joints, rods and a backlit performance remain separate practical tests.
