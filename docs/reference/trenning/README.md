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

| Trenning | Ekra | Status |
| --- | --- | --- |
| Kinds: Folder, Page, Course, Quiz, Assignment, Learning Path, Wiki (tabs) | Same seven kinds, one tab each | ✅ |
| Side list: Recents, Shared Content, Archived, Templates | Show menu: Recently opened, Archived, Templates. Shared waits for sharing (Phase 6) | 🟡 |
| Favorites listed in the side panel | Favorites view and stars | 🟡 side list ⬜ |
| Projects (groupings in the side panel) | Folders | 🟡 |
| "Create new content" dialog: a card per kind with a line about it, "AI Powered" / "New" badges | Kind picker in New content, lead line per kind | ✅ (AI: Phase 9) |
| Category tags and filter chips ("Category: Prototyping, Not Urgent", Add Filter, Reset) | Status filter, search, sort | ⬜ categories |
| Sort (Date Created), grid / list | Last updated, Newest, Name; grid and list | ✅ |
| Row: thumbnail, title, "by author · created", tags, path count, assigned avatars, completion ring | Kind icon, title, status, author, updated | 🟡 thumbnail, assigned, completion ⬜ |
| Upload button next to New Content | Picture upload inside pages; files Phase 4 | ⬜ |
| Org header with member avatars and invite (+) | Members and invitations | ⬜ (Phase 6) |

### Content building

| Trenning | Ekra | Status |
| --- | --- | --- |
| Rich materials with multimedia and interactivity | Editor: headings, lists, tasks, callouts, tables, toggles, code, pictures, YouTube | ✅ |
| Embeds and uploaded video in materials | YouTube embeds ✅; uploaded video | 🟡 (Phase 4) |
| Version history: view, track, restore | History panel with word diff and restore | ✅ |
| Collaboration, every change tracked | Autosave with conflict check, versions per sitting, live updates | ✅ |
| Wiki builder for resource lists | Wiki kind uses the page editor | 🟡 resource-list builder ⬜ |
| Course: sections and chapters | Sections and lessons (API) | 🟡 builder UI and player (Phase 4) |

### Learning paths

| Trenning | Ekra | Status |
| --- | --- | --- |
| Paths combining courses, pages, assignments, quizzes, wikis | Path kind exists | ⬜ (Phase 6) |
| Path wizard: 1 Overview (thumbnail, category, estimated duration, trainer, language, description) → 2 Add content (stages, sequential or free order, from library or upload) → 3 Assign learners | | ⬜ (Phase 6) |

### Quizzes

| Trenning | Ekra | Status |
| --- | --- | --- |
| Builder: question list on the side, question types (multiple choice, fill in the blank…), required, answer order random or kept, time estimate, points | | ⬜ (Phase 5) |
| Correct answers and designed wrong options | | ⬜ (Phase 5) |
| Result screen with pass / fail message | | ⬜ (Phase 5) |
| Preview, Publish, history on quizzes | Publish and history exist for pages | ⬜ (Phase 5) |
| Create questions with AI | | ⬜ (Phase 9) |

### Assignment and monitoring

| Trenning | Ekra | Status |
| --- | --- | --- |
| Assign learners (enroll) with start and due date | Lesson progress per person (API) | ⬜ (Phase 6) |
| All Assignees table: name, team, role, start, due, status (Completed, Over due, Not started, In progress %) | | ⬜ (Phase 6) |
| Send reminder (with a wait before sending again), message templates (time running out, overdue) | | ⬜ (Phase 6) |
| Bulk: edit due date (date, time, time zone), send reminder, remove; Export CSV | | ⬜ (Phase 6/10) |

### Learner portal

| Trenning | Ekra | Status |
| --- | --- | --- |
| Home / My Learning / Catalog / Favorites | Library for learners (published only), favorites, recent | 🟡 portal ⬜ (Phase 10) |
| Greeting, points, badges, certificates | | ⬜ (Phase 6 certificates, Phase 10) |
| In progress (completion, deadline, Start / Continue), new enrollments | Progress stored per lesson | ⬜ (Phase 6/10) |
| Learning time, daily goal and streak, leaderboard | | ⬜ (Phase 10) |
| Messages and notifications in the header | | ⬜ |

### Collaboration and AI

| Trenning | Ekra | Status |
| --- | --- | --- |
| Discussion between learners and trainers on materials | | ⬜ (Phase 10) |
| AI material creation | | ⬜ (Phase 9) |
| AI chatbot that guides the learning journey | | ⬜ (Phase 9) |
| AI Assist for finding content ("Ask AI", search) | Library search | 🟡 (Phase 9) |

## The screen recordings

Each desktop recording shows one flow (the phone versions show the same on a small screen). What to check in each:

| # | Recording | Shows | Ekra phase |
| --- | --- | --- | --- |
| 1 | Learning Path | Building a path: overview, stages, adding content, order | 6 |
| 2 | Assign Learner | Picking learners for a path, dates | 6 |
| 3 | Create Page With AI / Manual | New page from a prompt, or blank | 3 ✅ manual, 9 AI |
| 4 | Formatting Text | Editor toolbar and blocks | 3 ✅ |
| 5 | Video Embed | Embedding / uploading a video in a page | 3 ✅ embed, 4 upload |
| 6 | View Versioning | History panel, compare, restore | 3 ✅ |
| 7 | Manage Assignees | Assignee table, reminders, due dates, bulk actions | 6 |
| 8 | Setup Quiz | Quiz settings (pass mark, time, order) | 5 |
| 9 | Add Question From Scratch | Question builder, answer options | 5 |
| 10 | Hotspot And Multiple Images | Hotspot questions, picture answers | 5 |
| 11 | View Report By Learner | One learner's progress and scores | 10 |
| 12 | View Report | Content report (completion, scores) | 10 |
| 13 | Wiki Builder | Wiki made of resource lists | 6 / 10 |
| 14 | AI Search Engine | Ask AI search over the content | 9 |
| 15 | Start Course Page | Learner opens a course, lesson player | 4 |
| 16 | Chat Bot Scenario | AI assistant guiding a learner | 9 |
| 17 | Start Quiz | Learner takes a quiz, result screen | 5 |
| 18 | Material Update | Trainer updates content, learners see what changed | 3 ✅ history, 10 notify |
