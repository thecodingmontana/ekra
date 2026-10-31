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
| Files            | **SeaweedFS** via S3 API (`@aws-sdk/client-s3`, presigned URLs)                                                                                                                                        |
| Images           | **Always compressed before storing** (sharp/libvips): auto-rotate, strip metadata (EXIF/GPS), cap at 2560px, AVIF + WebP at 320/640/1280/1920 widths. Raw uploads are never kept or served             |
| Video            | **Always transcoded** in the worker (ffmpeg): probe first, adaptive HLS ladder up to the source size, loudness normalized, poster + scrub thumbnails, MP4 download copy; original kept for re-encodes  |
| Rust             | Considered per service, not by default. Media heavy lifting is already native (libvips, ffmpeg). First real candidate: the Phase 7b SFU. Any Rust service talks over Postgres jobs or HTTP             |
| Transcripts      | Behind one `transcribe()` function. Default: API (Deepgram / OpenAI) first, self-hosted faster-whisper later (needs GPU) — _confirm_                                                                   |
| Live classes     | Browser-native WebRTC, our own signaling over the Hono WebSocket, coturn for STUN/TURN. Mesh for small rooms (≤6); SFU added later only for big classes (mediasoup or Pion, behind the same signaling) |
| Recording        | Browser `MediaRecorder` on the trainer's side → upload → existing HLS + transcript pipeline                                                                                                            |
| Third-party libs | Minimize: prefer platform APIs and our own code; a lib only when writing it ourselves is unreasonable                                                                                                  |
| Logging          | **evlog**: one structured wide event per request/job, structured errors (`why`/`fix`), PII masked in production; JSON on stdout, local `.evlog/logs` files in dev                                      |
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
  media/           image pipeline (sharp) and video job definitions (ffmpeg args), shared by server and worker
  editor/          Tiptap config + doc sanitizer
  ai/              TanStack AI tools/prompts/rotation (from zadaci)
  emails/          React Email templates
  ui/              web components
  config/          tsconfig, biome
infra/  docker-compose.yml (local services), seaweedfs/, coturn/
```

Rule: `core`, `realtime`, `graphql-client` have no DOM/Node imports (reused by mobile/desktop).

## Where Rust fits

Rust earns its place where a service runs for a long time, holds many connections, moves a lot of bytes, or needs
predictable latency and memory. It doesn't where the code is mostly glue around TypeScript libraries we rely on
(Better Auth, Drizzle, Yoga) or calls into code that is already native (libvips, ffmpeg).

| Service                                            | Rust?                    | Why                                                                                                                                                       | When                                              |
| -------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Desktop app                                        | **Yes** (Tauri)          | Tauri's core is Rust: native file access, offline downloads, OS integration                                                                               | Desktop phase                                     |
| SFU for big live classes                           | **Yes**, first choice    | Forwards many media streams per room with low latency and stable memory (str0m or webrtc-rs)                                                              | Phase 7b                                          |
| Realtime gateway (WebSockets, signaling, presence) | **Yes, when load grows** | One Rust process holds far more open connections than Node, with less memory. Same message types as `packages/realtime`; checks sessions against Postgres | Split out of `server` once connection counts hurt |
| Video streaming gateway                            | **Yes, when needed**     | Serves HLS segments from SeaweedFS with per-learner signed tokens, so paid/private videos can't be shared. High throughput, simple logic                  | With paid courses or private video at scale       |
| Self-hosted transcription                          | **Likely**               | Wraps whisper.cpp (whisper-rs) or candle as a small job worker; no Python stack to run                                                                    | When we move off the transcription API            |
| Certificates (PDF)                                 | **Maybe**                | Typst (a Rust typesetting engine) renders crisp PDF certificates from a template, fast and without a headless browser                                     | Phase 6, if HTML-to-PDF looks poor                |
| Search                                             | **Maybe**                | Postgres full-text + pgvector first; if it outgrows that, Tantivy (Rust) or Meilisearch (built in Rust)                                                   | Phase 9+, only if Postgres search is too slow     |
| Admin CLI for self-hosters                         | **Maybe**                | One static binary for backups, restores, creating the first organization                                                                                  | After the first real server install               |
| API server (GraphQL, auth)                         | No                       | Shares types and code with web; Better Auth, Drizzle, Yoga are TypeScript                                                                                 | —                                                 |
| Image and video pipeline                           | No                       | sharp (libvips) and ffmpeg already do the heavy work in native code; Rust would only orchestrate                                                          | —                                                 |
| Quiz scoring, unlock rules                         | No                       | Must run in the browser and React Native too; TypeScript in `packages/core`                                                                               | —                                                 |

**How Rust services join the monorepo** (only when the first one is built, not before):

- They live in `services/<name>/` as a Cargo workspace (root `Cargo.toml`), next to the pnpm workspace.
- Each has a tiny `package.json` whose scripts call `cargo`, so `pnpm dev/build/test` and Turborepo run them too.
- Contracts are explicit: Postgres tables (jobs, sessions) or HTTP/WebSocket messages described once (JSON Schema or
  shared type definitions) and checked on both sides.
- Tooling: `rustfmt` and `clippy` in the Lefthook hooks and CI, a Docker image per service, and SETUP.md gains the
  `rustup` install step.

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
- **Done (1c, 2026-11-01)**: GraphQL context carries the active organization and role, re-checked against `member`
  on every request; `requireOrg` refuses tenant resolvers without one; leak tests. RLS moved to Phase 2, where the
  first tenant table is (decided 2026-11-01: there was no tenant data to protect yet).

### Phase 2 — Content library (M)

- **Action**: `content_item` + library screen (tabs, filters, sort, grid/list, favorites, recents, archive, templates).
  Postgres row-level security arrives with this first tenant table: a limited app database user (RLS doesn't apply
  to the table owner or a superuser), a separate migration URL, the org-scoped DB helper
  (`set_config('app.org_id')` per transaction) and policies, with a leak test per resolver.

### Phase 3 — Editor, versions, uploads (M)

- **Action**: port Tiptap + sanitizer + autosave; `content_version` with author, diff, restore; presigned uploads to SeaweedFS; image pipeline (below).
- **Image pipeline** (`packages/media`, used by server and worker): uploads land in a private `incoming/` prefix;
  sharp checks the real format from the bytes (JPEG, PNG, WebP, AVIF, GIF, HEIC; SVG is rejected or rasterized),
  refuses decompression bombs (`limitInputPixels`), auto-rotates, strips metadata, caps the long edge at 2560px and
  writes AVIF (quality ~55) and WebP (~75) at 320/640/1280/1920 widths (never larger than the source), plus width,
  height and a tiny blur placeholder for the database. Animated GIFs become animated WebP. Then `incoming/` is deleted.
  Pages render `<picture>` with `srcset`, so browsers fetch the smallest file that looks sharp.
- **Validate**: tests with a large JPEG (smaller output, no EXIF/GPS left), a PNG with transparency (kept), a
  fake image (refused), a pixel bomb (refused).

### Phase 4 — Video courses (M)

- **Action**: course/section/lesson; upload → pg-boss → ffmpeg HLS (360/720/1080) + thumbnail → `transcribe()` → VTT + `transcript_segment`; course landing + lesson player screens; autoplay, Complete, Next; watch progress events.
- **Video pipeline** (worker): large files upload straight to S3 with resumable multipart uploads. Then:
  1. `ffprobe` checks it's really video, and its duration, size, frame rate and audio; per-tenant limits apply.
  2. ffmpeg builds an HLS ladder of H.264 + AAC renditions (360p, 540p, 720p, 1080p, only up to the source size),
     quality-based encoding (CRF) with bitrate caps, 2-second aligned keyframes for smooth quality switching.
  3. Audio is loudness-normalized (EBU R128) so every lesson plays at the same volume.
  4. A poster frame, a thumbnail sprite for scrubbing previews, and a fast-start MP4 for downloads.
  5. `transcribe()` → captions (VTT) and transcript segments.
     The original stays in a private prefix so videos can be re-encoded later (new codecs like AV1, better settings)
     without asking trainers to upload again. Job progress shows in the UI; a failed step retries, then reports clearly.
- **Validate**: sample video produces HLS + captions; clicking a timestamp seeks; a phone video (portrait, 60fps,
  quiet audio) and a long 4K screen recording both play smoothly and sound right; a renamed non-video file is refused.

### Phase 5 — Quizzes + unlock rules (M)

- **Action**: MCQ, fill-in-blank, image, hotspot; scoring in `core`, graded on the server; manual grading; `unlock_rule` evaluator in `core` (after lesson/quiz pass, N days after enroll, date, attended live).
- **Validate**: unit tests for scorer and unlock evaluator.

### Phase 6 — Paths, assignments, progress, certificates (M)

- **Action**: learning paths, assign users/teams with due dates, completion %, slow-learner flags, reminders (pg-boss cron + email), self-enrollment for public courses, PDF certificate with verify link.

### Phase 7 — Live classes (L)

- **Action**: coturn in compose with short-lived TURN credentials (HMAC from `server`); signaling messages (join, offer, answer, ice, leave, hand-raise, mute) on the existing WebSocket, checked against session + enrollment; `live_session` content type; mesh room with raw `RTCPeerConnection` (`getUserMedia`, `getDisplayMedia` for screen share); room UI (video grid, screen share, hand raise, chat, waiting room, trainer mute/remove); attendance from join/leave signaling; trainer-side `MediaRecorder` recording → upload → Phase 4 pipeline. Cap rooms at 6.
- **Validate**: two browsers on different networks connect through TURN; recording becomes a lesson with transcript.

### Phase 7b — Large classes (L, only if needed)

- **Action**: add an SFU behind the same signaling protocol: a small Rust service (str0m or webrtc-rs), mediasoup
  (Node, fits the stack) or Pion (Go). Rust is the leading candidate here: long-running, latency-sensitive media
  forwarding is where its speed and memory safety pay off. Server-side recording. Lifts the 6-person cap.

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
