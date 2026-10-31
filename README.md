# Ekra

Ekra (from the Arabic اقرأ, _iqra'_: "read!") is a self-hosted, multi-tenant learning platform for companies training
their teams and creators publishing courses.

> Early development. The plan and phases are in [PLAN.md](PLAN.md). We track our work in
> [Zadaci](https://zadaci.vercel.app) (project Ekra); contributors can use Zadaci or any tracker they prefer.

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
| Logging         | evlog (structured wide events)                                                   |
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

## License

Ekra's source is open for everyone to read, run, change and share, under the
[PolyForm Noncommercial License 1.0.0](LICENSE).

- **Free** for personal use, learning, research, schools, charities, government and other noncommercial uses.
- **Not for sale.** You may not sell Ekra, host it for paying customers, or use it to run a business without a
  commercial license.
- **Keep the credit.** Any copy, fork or changed version must include the license and its `Required Notice` lines
  naming Christopher Odhiambo ([@thecodingmontana](https://github.com/thecodingmontana)) as the owner.

For a commercial license, email [thecodingmontana@gmail.com](mailto:thecodingmontana@gmail.com).

## Support

If Ekra helps you, you can support its development through
[GitHub Sponsors](https://github.com/sponsors/thecodingmontana).

Copyright © 2026 Christopher Odhiambo.
