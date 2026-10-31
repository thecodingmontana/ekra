# Plan: Ekra — multi-tenant LMS

**Source**: conversation 2026-10-31 (Trenning case study, zadaci codebase, codewithantonio course player)
**Complexity**: Large (MVP = Phases 0–6)
**Status**: awaiting confirmation — no code written yet

## Summary

Ekra (romanized اقرأ _Iqra'_, "Read!") is a self-hosted, multi-tenant LMS for **both** companies training staff
(B2B, like Trenning) and creators publishing courses (B2C, like Coursera / codewithantonio). Online-first, same
data model as zadaci: Apollo Client over GraphQL, with WebSocket "changed" pings for live updates. It ships as
Docker services on our own server — no Vercel, no Supabase, no Cloudinary. Web first; React Native and desktop later.
A separate static marketing site (`apps/site`) tells people about Ekra and is the one thing hosted on Vercel.

## Decisions (locked)

| Topic            | Decision                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hosting          | App: own server, Docker Compose, no Vercel/serverless. Exception: the static marketing site `apps/site` deploys to Vercel                                                                              |
| Marketing site   | `apps/site`: TanStack Start, prerendered to static HTML, shares `packages/ui`. No database or API. Links to GitHub, SETUP.md, Sponsors and the commercial-license contact                              |
| Repo             | pnpm workspaces + Turborepo monorepo                                                                                                                                                                   |
| Web              | TanStack Start (React 19, Router), Tailwind 4, shadcn/ui components built on Base UI (no Radix)                                                                                                        |
| API              | **Hono** server: Better Auth, GraphQL Yoga (+ graphql-armor), uploads, WebSockets                                                                                                                      |
| Auth             | **Better Auth** (Google, email links, passkeys, TOTP; `@better-auth/expo` + `bearer` later for mobile/desktop)                                                                                         |
| DB               | PostgreSQL + Drizzle ORM 1.0 RC, drizzle-kit migrations, RLS per tenant                                                                                                                                |
| Client data      | **Apollo Client 4** (as in zadaci). No offline sync.                                                                                                                                                   |
| Realtime         | Own WebSockets (`@hono/node-ws`), fan-out via Postgres LISTEN/NOTIFY; ping → Apollo refetch                                                                                                            |
| Files            | **SeaweedFS** via S3 API (`@aws-sdk/client-s3`, presigned URLs); sharp for images                                                                                                                      |
| Video            | ffmpeg → HLS in worker; Vidstack player                                                                                                                                                                |
| Transcripts      | Behind one `transcribe()` function. Default: API (Deepgram / OpenAI) first, self-hosted faster-whisper later (needs GPU) — _confirm_                                                                   |
| Live classes     | Browser-native WebRTC, our own signaling over the Hono WebSocket, coturn for STUN/TURN. Mesh for small rooms (≤6); SFU added later only for big classes (mediasoup or Pion, behind the same signaling) |
| Recording        | Browser `MediaRecorder` on the trainer's side → upload → existing HLS + transcript pipeline                                                                                                            |
| Third-party libs | Minimize: prefer platform APIs and our own code; a lib only when writing it ourselves is unreasonable                                                                                                  |
| Jobs             | pg-boss (Postgres-backed queue) in a `worker` service                                                                                                                                                  |
| Tenancy          | Organization = tenant (`kind`: company \| creator). Subdomains first, custom domains later                                                                                                             |
| Customers        | B2B **and** B2C. Payments (Stripe Connect) after MVP; schema leaves room                                                                                                                               |
| Zadaci reuse     | Copy and adapt only what we need into ekra packages                                                                                                                                                    |
| Desktop          | Tauri (later)                                                                                                                                                                                          |

## Runtime

```
web (TanStack Start SSR, :3000) ──/api/*, /ws (Vite proxy in dev)──▶ server (Hono, Node, :4000)
worker (pg-boss: ffmpeg, transcribe, embeddings, email, reminders)
postgres · seaweedfs (S3) · coturn (STUN/TURN)
```

**Local first.** Everything must run on a developer machine with `docker compose up` (postgres, seaweedfs) and
`pnpm dev`. We don't ship a reverse proxy. In dev, Vite proxies `/api` and `/ws` to `server`, so the browser sees one
origin (same-origin cookies, no CORS).

**Production (later, when we set up a server).** Operators bring their own reverse proxy (Caddy, Nginx, Traefik, …).
The only requirement: route `/api/*` and `/ws` on every tenant domain to `server`, everything else to `web`.
We'll document a sample config then; custom-domain TLS (e.g. Caddy on-demand TLS asking
`/api/domains/allowed?domain=`) is the proxy's job.

## Monorepo

```
apps/
  web/        TanStack Start
  site/       marketing homepage (static, Vercel)
  server/     Hono: auth, graphql, ws (incl. WebRTC signaling), uploads
  worker/     pg-boss jobs
  mobile/     Expo (later)
  desktop/    Tauri (later)
packages/
  db/              Drizzle schema, relations, migrations, RLS policies
  api/             GraphQL schema + resolvers + permissions (server-only)
  core/            pure TS: zod schemas, permissions matrix, quiz scoring, progress, unlock rules
  realtime/        WS message types + client
  graphql-client/  typed operations
  storage/         S3 client (SeaweedFS)
  editor/          Tiptap config + doc sanitizer
  ai/              TanStack AI tools/prompts/rotation (from zadaci)
  emails/          React Email templates
  ui/              web components
  config/          tsconfig, biome
infra/  docker-compose.yml (local services), seaweedfs/, coturn/
```

Rule: `core`, `realtime`, `graphql-client` have no DOM/Node imports (reused by mobile/desktop).

## Patterns to mirror (zadaci, `~/the-going-merry/zadaci`)

| Category    | Source                                                            | Pattern                                                                                 |
| ----------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Resolvers   | `src/graphql/*.server.ts`, `schema.server.ts`, `yoga.server.ts`   | One file per domain, Yoga + graphql-armor limits                                        |
| Client ops  | `src/graphql/*-operations.ts`                                     | Operations grouped by domain, Apollo Client                                             |
| Schema      | `src/db/*.ts`, `relations.ts`, `enums.ts`                         | One schema file per domain                                                              |
| Permissions | `src/lib/permissions.ts` (+ `.test.ts`)                           | Central role checks, unit-tested                                                        |
| Editor      | `src/lib/note-doc.ts`, `note-embeds.ts`, `note-covers.ts`         | Server-side doc sanitizer, embed allowlist, autosave that never overwrites a newer edit |
| Auth        | `src/lib/auth.ts`, `auth-client.ts`                               | Better Auth config                                                                      |
| AI          | `src/lib/ai/`                                                     | Tools, prompt, model rotation, limits, BYO keys                                         |
| Realtime    | `src/lib/realtime.server.ts`, `components/shell/live-updates.tsx` | "Changed" ping → client refetch (replace Supabase with own WS)                          |
| Jobs/cron   | `src/lib/daily.server.ts`                                         | Reminders, digests (move to pg-boss)                                                    |
| Naming      | `*.server.ts` server-only, kebab-case files                       | Same                                                                                    |
| Tests       | `tests/helpers.ts`, `node --test` + tsx, real test DB             | Same; call `app.request()` on Hono                                                      |
| Lint        | `biome.json`                                                      | Same config                                                                             |

## Domain model (first cut)

- `organization` (kind, slug, branding) · `domain` (host, verified_at, txt_token) · `member` (role: owner/admin/trainer/learner/guest) · `team`
- `project` (sidebar grouping)
- `content_item` (type: folder|page|course|quiz|assignment|path|wiki|live_session, parent_id, category, status, visibility, price_cents nullable)
- `course_section` · `lesson` (kind: video|page|quiz|assignment|live, order, unlock_rule jsonb, resources)
- `content_version` (doc jsonb, author_id, created_at) — version history + restore
- `media_asset` (s3 key, status, hls_key, duration, thumbnail) · `transcript_segment` (start_ms, end_ms, text, embedding)
- `question` (type: mcq|fill_blank|image|hotspot, payload jsonb) · `quiz_attempt`
- `enrollment` (source: assigned|self|purchased) · `assignment` (target user/team, due_at)
- `progress_event` (lesson_viewed, video_position, lesson_completed, attended)
- `live_session` (room id, schedule, max_participants) · `attendance`
- `certificate` · `discussion` / `comment`
- Every tenant table: `org_id` (RLS)

## Key screens

1. **Library** (Trenning screenshot): tabs Folder/Page/Course/Quiz/Assignment/Learning Path/Wiki, filter chips, sort, grid/list, favorites, recents, shared, archived, templates.
2. **Course landing** (codewithantonio): title, subtitle, creator card, Start/Continue Learning, resources link, Share, overview video, numbered lesson list.
3. **Lesson player**: collapsible sidebar (course thumb + title, Autoplay toggle, numbered lessons with active/completed/locked state), search, video, resources link, **Complete** toggle, **Next**, lesson body, **transcript with clickable timestamps** that seek the video, captions.
4. Editor + version history panel · Quiz builder/taker · Path builder · Assignee monitoring · Live class room · Reports.

## Tasks

### Phase 0 — Scaffold (M)

- **Action**: monorepo, Turborepo, Biome, tsconfig; `infra/docker-compose.yml` (postgres, seaweedfs); `apps/server` Hono with health + Yoga; `apps/web` Start shell with Apollo and Vite proxy to `server`; `packages/db` with first migration.
- **Mirror**: zadaci `package.json` scripts, `biome.json`, `drizzle.config.ts`.
- **Validate**: `docker compose up`, `pnpm build`, `pnpm test` (one GraphQL test via `app.request`).

### Phase 0.5 — Marketing site (S)

- **Action**: `apps/site` (TanStack Start, static prerender, shared `packages/ui`). Pages: home (hero, what Ekra does for
  trainers and learners, feature sections from the plan, screenshots or mock-ups, "self-host it" with a link to
  SETUP.md, license in plain words, Sponsors, commercial-license contact, GitHub link), plus a short roadmap that
  mirrors the phases. SEO basics: titles, Open Graph images, sitemap, robots. Vercel project with root `apps/site`.
- **Depends on**: `packages/ui` from the `apps/web` shell (EKR-17).
- **Validate**: `pnpm --filter site build` produces static HTML that runs with `pnpm --filter site preview`;
  Lighthouse 95+ on performance, accessibility, best practices and SEO; Vercel preview deploy works.
- **Open**: domain name (e.g. `ekra.app`), and whether "Ekra" clears a trademark check first.

### Phase 1 — Tenancy, auth, realtime (M)

- **Action**: organization/member/team, Better Auth in Hono, session middleware resolving host → org → role, Postgres RLS (`set_config('app.org_id')` per transaction), subdomain routing, branding. WebSocket server with session auth on upgrade, org-scoped channels, LISTEN/NOTIFY fan-out, "changed" ping → Apollo refetch.
- **Validate**: cross-tenant read test on every resolver fails closed; WS rejects other-tenant channels.

### Phase 2 — Content library (M)

- **Action**: `content_item` + library screen (tabs, filters, sort, grid/list, favorites, recents, archive, templates).

### Phase 3 — Editor, versions, uploads (M)

- **Action**: port Tiptap + sanitizer + autosave; `content_version` with author, diff, restore; presigned uploads to SeaweedFS; sharp image processing.

### Phase 4 — Video courses (M)

- **Action**: course/section/lesson; upload → pg-boss → ffmpeg HLS (360/720/1080) + thumbnail → `transcribe()` → VTT + `transcript_segment`; course landing + lesson player screens; autoplay, Complete, Next; watch progress events.
- **Validate**: sample video produces HLS + captions; clicking a timestamp seeks.

### Phase 5 — Quizzes + unlock rules (M)

- **Action**: MCQ, fill-in-blank, image, hotspot; scoring in `core`, graded on the server; manual grading; `unlock_rule` evaluator in `core` (after lesson/quiz pass, N days after enroll, date, attended live).
- **Validate**: unit tests for scorer and unlock evaluator.

### Phase 6 — Paths, assignments, progress, certificates (M)

- **Action**: learning paths, assign users/teams with due dates, completion %, slow-learner flags, reminders (pg-boss cron + email), self-enrollment for public courses, PDF certificate with verify link.

### Phase 7 — Live classes (L)

- **Action**: coturn in compose with short-lived TURN credentials (HMAC from `server`); signaling messages (join, offer, answer, ice, leave, hand-raise, mute) on the existing WebSocket, checked against session + enrollment; `live_session` content type; mesh room with raw `RTCPeerConnection` (`getUserMedia`, `getDisplayMedia` for screen share); room UI (video grid, screen share, hand raise, chat, waiting room, trainer mute/remove); attendance from join/leave signaling; trainer-side `MediaRecorder` recording → upload → Phase 4 pipeline. Cap rooms at 6.
- **Validate**: two browsers on different networks connect through TURN; recording becomes a lesson with transcript.

### Phase 7b — Large classes (L, only if needed)

- **Action**: add an SFU behind the same signaling protocol: mediasoup (Node, fits the stack) or a small Pion (Go) service. Server-side recording. Lifts the 6-person cap.

### Phase 8 — Custom domains (M)

- **Action**: domain add + TXT verification, `/api/domains/allowed` endpoint for the operator's proxy (on-demand TLS), sample proxy config in docs, central `auth.ekra.app` OAuth hand-off with one-time token.

### Phase 9 — AI (M)

- **Action**: port `lib/ai`; writing assist in editor; quiz generation from page/transcript; pgvector semantic search over content + transcripts; learner chatbot grounded in enrolled content.

### Phase 10 — Reports, portal, discussions (M)

### Later

Payments (Stripe Connect, coupons, reviews, cross-tenant marketplace), Expo app, Tauri desktop, Yjs co-editing, offline mode / offline video download, self-hosted Whisper.

## Validation

```bash
docker compose -f infra/docker-compose.yml up -d
pnpm install
pnpm db:migrate
pnpm check
pnpm test        # real test DB, calls Hono app.request
pnpm build
```

## Risks

| Risk                                                         | Likelihood | Mitigation                                                                                                     |
| ------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------- |
| Cross-tenant leaks                                           | Medium     | RLS + org-scoped DB helper + leak test per resolver                                                            |
| Ops burden (services, backups, certs)                        | High       | Compose health checks from day one, automated pg + SeaweedFS backups, hosted fallbacks (R2, transcription API) |
| Mesh WebRTC limits (each person uploads one stream per peer) | High       | Hard cap of 6 per room; Phase 7b SFU for bigger classes                                                        |
| NAT traversal (some users can't connect peer-to-peer)        | Medium     | coturn with TURN over TCP/TLS on 443                                                                           |
| Trainer-side recording lost if their tab closes              | Medium     | Upload recording in chunks during the session; server recording comes with the SFU                             |
| WS across multiple server instances                          | Low        | LISTEN/NOTIFY fan-out; swap to Valkey only if NOTIFY throughput limits                                         |
| OAuth + passkeys on custom domains                           | Medium     | Central auth domain hand-off; passkeys documented as per-domain                                                |
| Transcription cost/latency                                   | Medium     | Queue with UI progress, per-tenant minute quota                                                                |
| Scope (B2B + B2C + live + AI)                                | High       | MVP = Phases 0–6; payments after MVP                                                                           |

## Acceptance (MVP)

- [ ] A tenant on `acme.ekra.app` creates a course with video lessons; transcripts and captions appear
- [ ] A learner works through lessons, completes a quiz, progress updates live for the trainer
- [ ] Unlock rules and assignments work; certificate issued on completion
- [ ] No cross-tenant data access (tests)
- [ ] `docker compose up` runs the whole stack on one server
