# Ekra

Ekra (from the Arabic اقرأ, _iqra'_: "read!") is a self-hosted, multi-tenant learning platform for companies training
their teams and creators publishing courses.

> Early development. The plan and phases are in [PLAN.md](PLAN.md); progress is tracked in Zadaci (project Ekra).

## What it will do

- **Learning content:** pages, courses, quizzes, assignments, learning paths and wikis, organized in projects.
- **Video courses:** upload a video and get streaming, captions and a clickable transcript; lessons unlock as learners
  progress.
- **Quizzes:** multiple choice, fill in the blank, image and hotspot questions, with grading and feedback.
- **Assignments and progress:** assign learners or teams, track completion, send reminders, issue certificates.
- **Live classes:** video sessions in the browser with screen sharing, recordings that become lessons.
- **Organizations:** each one has its own members, roles, branding and (later) custom domain.
- **AI help:** writing assistance, quiz generation from content and transcripts, and a learner assistant.

## Tech stack

| Area            | Tools                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| Web             | TanStack Start (React 19, TanStack Router), Tailwind CSS 4, shadcn/ui on Base UI |
| API             | Hono, GraphQL Yoga, Apollo Client, Better Auth                                   |
| Data            | PostgreSQL, Drizzle ORM                                                          |
| Files and video | SeaweedFS (S3 API), ffmpeg, HLS                                                  |
| Realtime        | WebSockets, WebRTC                                                               |
| Jobs            | pg-boss                                                                          |
| Tooling         | pnpm workspaces, Turborepo, Biome, Lefthook, TypeScript                          |

## Getting started

Full steps, including Docker and SeaweedFS, are in [SETUP.md](SETUP.md). In short:

```bash
pnpm install
cp .env.example .env    # then set the passwords
pnpm services:up        # Postgres + SeaweedFS in Docker
pnpm dev
```

## Repository layout

```text
apps/       web, server, worker
packages/   shared code: db, api, core, ui, …
infra/      local services (docker-compose.yml)
scripts/    repo scripts (git hooks)
```

## Docs

- [SETUP.md](SETUP.md): installing and running everything locally
- [PLAN.md](PLAN.md): product plan, decisions and phases
- [AGENTS.md](AGENTS.md): conventions for contributors and AI coding agents
- [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
