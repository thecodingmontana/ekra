# Trenning: the feature reference

Ekra's product reference is Fikri Studio's **Trenning** case study:
<https://fikristudio.com/project/trenning> (fetched 2026-11-02). Its screens and text are kept here so we can
check, phase by phase, that Ekra covers what Trenning shows. The images, videos and text belong to Fikri Studio;
they're here only as design reference, not for reuse in Ekra's own UI.

- `page-text.md`: the page's text, repeated blocks removed.
- `images/`: every screenshot on the page (numbered in page order).
- `videos/`: the page's 35 screen recordings (desktop and phone). They're about 264 MB, so git keeps only their
  list (`videos.txt`); run `scripts/fetch-reference-videos.sh` to download them here.

**Rule:** before closing a phase, re-read the matching section below, open its screenshots, and update the status
column. Ekra's look follows zadaci (see AGENTS.md); Trenning sets what the product does, not its exact styling.

## Feature checklist

Status: ✅ done · 🟡 partly · ⬜ not yet (with the phase in PLAN.md that brings it).

### Library (learning content)

| Trenning                                                                                          | Ekra                                                                                           | Status                                |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------- |
| Kinds: Folder, Page, Course, Quiz, Assignment, Learning Path, Wiki (tabs)                         | Same seven kinds, one tab each                                                                 | ✅                                    |
| Side list: Recents, Shared Content, Archived, Templates                                           | Show menu: Recently opened, Archived, Templates. Shared waits for sharing (Phase 6)            | 🟡                                    |
| Favorites listed in the side panel                                                                | Favorites view and stars                                                                       | 🟡 side list ⬜                       |
| Projects (groupings in the side panel)                                                            | Folders                                                                                        | 🟡                                    |
| "Create new content" dialog: a card per kind with a line about it, "AI Powered" / "New" badges    | Kind picker in New content, lead line per kind                                                 | ✅ (AI: Phase 9)                      |
| Category tags and filter chips ("Category: Prototyping, Not Urgent", Add Filter, Reset)           | Categories on items, filter chips (Add filter, Reset), status filter, search, sort             | ✅                                    |
| Sort (Date Created), grid / list                                                                  | Last updated, Newest, Name; grid and list                                                      | ✅                                    |
| Row: thumbnail, title, "by author · created", tags, path count, assigned avatars, completion ring | Kind icon, title, status, author, updated                                                      | 🟡 thumbnail, assigned, completion ⬜ |
| Upload button next to New Content                                                                 | Picture upload inside pages; files Phase 4                                                     | ⬜                                    |
| Org header with member avatars and invite (+)                                                     | Settings > Members: invite by email with a role, invitation page (accept first), roles, remove | 🟡 header avatars ⬜                  |

### Content building

| Trenning                                         | Ekra                                                                               | Status                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------- |
| Rich materials with multimedia and interactivity | Editor: headings, lists, tasks, callouts, tables, toggles, code, pictures, YouTube | ✅                          |
| Embeds and uploaded video in materials           | YouTube embeds ✅; uploaded video in course lessons (parts upload, HLS player) ✅  | 🟡 upload inside pages ⬜   |
| Version history: view, track, restore            | History panel with word diff and restore                                           | ✅                          |
| Collaboration, every change tracked              | Autosave with conflict check, versions per sitting, live updates                   | ✅                          |
| Wiki builder for resource lists                  | Wiki kind uses the page editor                                                     | 🟡 resource-list builder ⬜ |
| Course: sections and chapters                    | Builder: sections, video / reading / quiz lessons, drag to reorder, in-order lock  | ✅                          |

### Learning paths

| Trenning                                                                                                                                                                                         | Ekra                                                                                                         | Status                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Paths combining courses, pages, assignments, quizzes, wikis                                                                                                                                      | Path builder: stages of courses, pages, quizzes, wikis, assignments; progress and locks for learners         | ✅                                            |
| Path wizard: 1 Overview (thumbnail, category, estimated duration, trainer, language, description) → 2 Add content (stages, sequential or free order, from library or upload) → 3 Assign learners | Overview = create/edit dialog (cover, category, description); stages and order in the builder; Assign button | 🟡 one page, no wizard; upload into a path ⬜ |

### Quizzes

| Trenning                                                                                                                                                  | Ekra                                                                                                                                                                                                                   | Status                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Builder: question list on the side, question types (multiple choice, fill in the blank…), required, answer order random or kept, time estimate, points    | Question list (add, drag or menu to reorder, delete), editor per kind: multiple choice (text and/or picture choices, one or several right), fill in the blank, hotspot; required, points, explanation; saves as you go | ✅ (no per-question time estimate; other Trenning kinds such as reorder, match, dropdown ⬜) |
| Settings: pass mark, attempts, random question pool, shuffle choices, show answers during / after                                                         | Settings: pass mark, time limit, attempts, random subset, shuffle questions and choices, show answers never / after each / at the end                                                                                  | ✅                                                                                           |
| Correct answers and designed wrong options                                                                                                                | Right choices, accepted answers per blank plus extra wrong words, hotspot areas drawn on the picture                                                                                                                   | ✅                                                                                           |
| Hotspot with pictures, multiple pictures as answers                                                                                                       | Hotspot (rectangles on an uploaded picture), pictures on choices                                                                                                                                                       | ✅ (point and free-form hotspot shapes ⬜)                                                   |
| Taking: Question N of M, countdown, Previous / Continue (Cmd+Enter), "not sure", quiz map (all, answered, not answered, not sure), drag tiles into blanks | Same; tiles can also be placed by clicking (keyboard, touch); time running out hands the attempt in                                                                                                                    | ✅ (focus mode, report an issue ⬜)                                                          |
| Result screen with pass / fail message                                                                                                                    | Score, passed / not, pass or fail message, per-question review with right answers and explanations when the quiz shows them                                                                                            | ✅                                                                                           |
| Preview, Publish, history on quizzes                                                                                                                      | Preview (takes it as the trainer), Publish                                                                                                                                                                             | 🟡 history of quiz questions ⬜                                                              |
| Create questions with AI                                                                                                                                  |                                                                                                                                                                                                                        | ⬜ (Phase 9)                                                                                 |

### Assignment and monitoring

| Trenning                                                                                                    | Ekra                                                                                                | Status                           |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------- |
| Assign learners (enroll) with start and due date                                                            | Enroll learners with start and due date (assignees page)                                            | ✅                               |
| All Assignees table: name, team, role, start, due, status (Completed, Over due, Not started, In progress %) | All Assignees: name, role, start, due, status ring (Completed, Overdue, Not started, In progress %) | 🟡 team column, sort, filters ⬜ |
| Send reminder (with a wait before sending again), message templates (time running out, overdue)             | Send reminder, 30-minute wait, two messages shared with the email                                   | ✅                               |
| Bulk: edit due date (date, time, time zone), send reminder, remove; Export CSV                              | Bulk edit due date, remind, remove; Export CSV                                                      | 🟡 time zone picker ⬜           |

### Learner portal

| Trenning                                                              | Ekra                                                                                                     | Status                          |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Home / My Learning / Catalog / Favorites                              | Home: My learning and Completed; library is the catalog for learners (published only), favorites, recent | 🟡 catalog tab ⬜               |
| Greeting, points, badges, certificates                                | Greeting; certificates (claim after finishing, public check page, print to PDF)                          | 🟡 points, badges ⬜ (Phase 10) |
| In progress (completion, deadline, Start / Continue), new enrollments | Home rows: progress, due date, status, start from the catalog; course page Start / Continue              | ✅                              |
| Learning time, daily goal and streak, leaderboard                     |                                                                                                          | ⬜ (Phase 10)                   |
| Messages and notifications in the header                              |                                                                                                          | ⬜                              |

### Collaboration and AI

| Trenning                                              | Ekra           | Status        |
| ----------------------------------------------------- | -------------- | ------------- |
| Discussion between learners and trainers on materials |                | ⬜ (Phase 10) |
| AI material creation                                  |                | ⬜ (Phase 9)  |
| AI chatbot that guides the learning journey           |                | ⬜ (Phase 9)  |
| AI Assist for finding content ("Ask AI", search)      | Library search | 🟡 (Phase 9)  |

## The screen recordings

Each desktop recording shows one flow (the phone versions show the same on a small screen). What to check in each:

| #   | Recording                    | Shows                                                    | Ekra phase                                      |
| --- | ---------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| 1   | Learning Path                | Building a path: overview, stages, adding content, order | 6                                               |
| 2   | Assign Learner               | Picking learners for a path, dates                       | 6                                               |
| 3   | Create Page With AI / Manual | New page from a prompt, or blank                         | 3 ✅ manual, 9 AI                               |
| 4   | Formatting Text              | Editor toolbar and blocks                                | 3 ✅                                            |
| 5   | Video Embed                  | Embedding / uploading a video in a page                  | 3 ✅ embed, 4 🟡 upload (lessons ✅)            |
| 6   | View Versioning              | History panel, compare, restore                          | 3 ✅                                            |
| 7   | Manage Assignees             | Assignee table, reminders, due dates, bulk actions       | 6                                               |
| 8   | Setup Quiz                   | Quiz settings (pass mark, time, order)                   | 5                                               |
| 9   | Add Question From Scratch    | Question builder, answer options                         | 5                                               |
| 10  | Hotspot And Multiple Images  | Hotspot questions, picture answers                       | 5                                               |
| 11  | View Report By Learner       | One learner's progress and scores                        | 10                                              |
| 12  | View Report                  | Content report (completion, scores)                      | 10                                              |
| 13  | Wiki Builder                 | Wiki made of resource lists                              | 6 / 10                                          |
| 14  | AI Search Engine             | Ask AI search over the content                           | 9                                               |
| 15  | Start Course Page            | Learner opens a course, lesson player                    | 4 ✅ (no Discussion/File tabs, certificate yet) |
| 16  | Chat Bot Scenario            | AI assistant guiding a learner                           | 9                                               |
| 17  | Start Quiz                   | Learner takes a quiz, result screen                      | 5                                               |
| 18  | Material Update              | Trainer updates content, learners see what changed       | 3 ✅ history, 10 notify                         |
