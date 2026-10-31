# AGENTS.md

Guide for AI coding agents (Claude Code, Codex, Cursor, …) and humans working on Ekra.

## What Ekra is

A self-hosted, multi-tenant learning platform for companies training staff and creators publishing courses.
The full plan, decisions and phases live in [PLAN.md](PLAN.md). Read it before starting a phase.

## Stack

TanStack Start (web) · Tailwind 4 + shadcn/ui on Base UI · Hono (API server) · Better Auth · GraphQL Yoga + Apollo Client · Drizzle ORM + PostgreSQL ·
own WebSockets and WebRTC · SeaweedFS (S3 API) · pg-boss worker · Docker Compose on our own server.
No Vercel, Supabase or Cloudinary.

## Layout

```
apps/       web, server, worker, site (marketing, the only thing on Vercel); mobile and desktop later
packages/   db, api, core, realtime, graphql-client, storage, editor, ai, emails, ui, config
infra/      docker-compose.yml for local services (postgres, seaweedfs), service configs
scripts/    repo scripts (git hooks)
```

`packages/core`, `realtime` and `graphql-client` must not import DOM or Node APIs: mobile and desktop reuse them.

## Commands

| Command                         | What it does                                       |
| ------------------------------- | -------------------------------------------------- |
| `pnpm install`                  | Install everything and set up git hooks (Lefthook) |
| `pnpm dev`                      | Run all apps (Turborepo)                           |
| `pnpm build`                    | Build all apps and packages                        |
| `pnpm typecheck`                | TypeScript in every workspace                      |
| `pnpm test`                     | Tests in every workspace                           |
| `pnpm check` / `pnpm check:fix` | Biome lint + format check / auto-fix               |
| `pnpm --filter <name> <script>` | Run a script in one workspace                      |

## Conventions

- **Local first.** Everything must work on a developer machine (`docker compose up` + `pnpm dev`) before anything
  else. No reverse proxy is shipped: in dev, Vite proxies `/api` and `/ws` to the server; in production the operator
  brings their own proxy (Caddy, Nginx, …). No server/deploy setup until we decide to set up a server.
- **Document every setup step in [SETUP.md](SETUP.md).** A new service, env variable, port or tool updates SETUP.md
  (and `.env.example`) in the same commit.

- **Biome** formats and lints everything: tabs, double quotes. Run `pnpm check:fix` before committing. No ESLint/Prettier.
- **TypeScript strict** everywhere; each workspace's `tsconfig.json` extends `tsconfig.base.json`.
- **UI:** shadcn/ui components on **Base UI** (`@base-ui/react`), kept in `packages/ui` and added with the shadcn CLI.
  Never use Radix (`radix-ui`, `@radix-ui/*`), even when copying components from zadaci: port them to Base UI.
- Files are kebab-case. Server-only modules end in `.server.ts`.
- **Few third-party libraries.** Prefer platform APIs (WebRTC, MediaRecorder, fetch, Web Crypto) and our own small code.
  Add a dependency only when writing it ourselves is unreasonable, and say why in the PR.
- **Reuse zadaci.** `~/the-going-merry/zadaci` has the same stack. Copy and adapt what's needed (auth, editor, AI,
  permissions, emails, tests helpers) instead of writing from scratch.
- Every tenant table has `org_id`, enforced by Postgres row-level security. Never query tenant data without it.
- Validate input at boundaries with zod. Never commit secrets; use `.env.local` (gitignored) and keep `.env.example` current.
- Tests use Node's built-in runner against a real test database; API tests call the Hono app with `app.request()`.

## Git

- Conventional Commits: `feat(web): course player sidebar`, `fix(api): EKR-12 upload size check`.
  Mention the Zadaci task key (`EKR-n`) in the message or branch name (`ekr-12-upload-limit`) so it links to the task.
- **No `Co-Authored-By` lines and no AI attribution** ("Generated with …") in commits, PRs or code.
  The `commit-msg` hook rejects them.
- Hooks (Lefthook): pre-commit runs Biome on staged files; commit-msg checks the message; pre-push runs typecheck and tests.

## Tracking work in Zadaci

All work is tracked in Zadaci: workspace `the-goods-lab`, project **Ekra** (task keys `EKR-n`), via the Zadaci MCP.

- Before starting: find the task (or create one under its phase), set it to `in_progress`.
- While working: add subtasks for real steps; comment on decisions and blockers.
- When done: set it to `completed` (or `in_review` if it needs a check) and add a short comment on what changed.
- Keep [PLAN.md](PLAN.md) in sync when a decision changes.

## Definition of done

- `pnpm check`, `pnpm typecheck` and `pnpm test` pass.
- New logic has a test; tenant isolation is tested for new resolvers.
- The Zadaci task is updated.
