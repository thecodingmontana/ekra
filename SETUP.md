# Setting up Ekra

Everything you need to run Ekra on your own machine, step by step. Ekra is built to run locally first:
nothing here needs a server, a domain or a cloud account.

> Keep this file current. Any change to how Ekra is installed or run (a new service, env variable, port or tool)
> updates this file in the same commit.

## Contents

1. [What you need](#1-what-you-need)
2. [Windows only: WSL 2](#2-windows-only-wsl-2)
3. [Git and GitHub CLI](#3-git-and-github-cli)
4. [Node.js and pnpm](#4-nodejs-and-pnpm)
5. [Docker](#5-docker)
6. [Get the code](#6-get-the-code)
7. [Environment variables](#7-environment-variables)
8. [Local services: Postgres and SeaweedFS](#8-local-services-postgres-and-seaweedfs)
9. [Without Docker: native Postgres and SeaweedFS](#9-without-docker-native-postgres-and-seaweedfs)
10. [Run the app](#10-run-the-app)
11. [Git hooks and commits](#11-git-hooks-and-commits)
12. [Task tracking with Zadaci (optional)](#12-task-tracking-with-zadaci-optional)
13. [Troubleshooting](#13-troubleshooting)

## 1. What you need

| Tool                           | Version                            | Why                                 |
| ------------------------------ | ---------------------------------- | ----------------------------------- |
| Git                            | any recent                         | source control                      |
| Node.js                        | 24 (see `.nvmrc`), at least 22     | runs the apps and tooling           |
| pnpm                           | 12.11.2 (pinned in `package.json`) | package manager for the monorepo    |
| Docker Engine + Compose plugin | Compose v2 or newer                | runs Postgres and SeaweedFS locally |
| GitHub CLI (`gh`)              | any recent                         | optional, for repo work             |

Supported systems: Linux, macOS, and Windows through WSL 2.

## 2. Windows only: WSL 2

Ekra is developed inside Linux. On Windows, use WSL 2 with Ubuntu.

1. Open PowerShell as administrator and run:

   ```powershell
   wsl --install -d Ubuntu
   ```
2. Restart Windows if asked, open **Ubuntu** from the Start menu and create your Linux user.
3. Make sure systemd is on (needed for Docker and services). In Ubuntu:

   ```bash
   cat /etc/wsl.conf
   ```

   It should contain:

   ```ini
   [boot]
   systemd=true
   ```

   If not, add it with `sudo nano /etc/wsl.conf`, then run `wsl --shutdown` in PowerShell and reopen Ubuntu.
4. Keep the code inside the Linux file system (for example `~/code/ekra`), not under `/mnt/c`. It's much faster.

Every command below runs in the Ubuntu terminal.

## 3. Git and GitHub CLI

**Ubuntu / WSL**

```bash
sudo apt-get update
sudo apt-get install -y git gh
```

**macOS** (with [Homebrew](https://brew.sh))

```bash
brew install git gh
```

Then sign in to GitHub and set your name for commits:

```bash
gh auth login
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## 4. Node.js and pnpm

Install Node with [nvm](https://github.com/nvm-sh/nvm), so the version in `.nvmrc` is used:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# open a new terminal, then:
nvm install 24
nvm use 24
node -v   # v24.x
```

Turn on pnpm through Corepack (ships with Node). It reads the exact version from `package.json`:

```bash
corepack enable
pnpm -v   # 12.11.2
```

## 5. Docker

Docker runs the local Postgres and SeaweedFS. You need Docker Engine and the Compose plugin.

### Ubuntu / WSL (Docker Engine)

Install from Docker's own package repository:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Let your user run Docker without `sudo`:

```bash
sudo usermod -aG docker $USER
```

This only takes effect in **new login sessions**. On WSL, run `wsl --shutdown` in PowerShell and reopen Ubuntu
(on Linux, log out and back in). Restart any open editors or terminals too.

Check it works:

```bash
docker run --rm hello-world
docker compose version
```

### macOS

Install [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/) (or
[OrbStack](https://orbstack.dev)), start it once, then check with `docker run --rm hello-world`.

### Windows with Docker Desktop instead

If you prefer Docker Desktop on Windows: install it, open **Settings → Resources → WSL integration**, turn on your
Ubuntu distro, and skip the Ubuntu steps above. Don't install both.

## 6. Get the code

```bash
gh repo clone thecodingmontana/ekra
cd ekra
pnpm install
```

`pnpm install` also installs the git hooks (see [section 11](#11-git-hooks-and-commits)).

## 7. Environment variables

All settings live in one `.env` file at the repo root. It is gitignored; `.env.example` lists every variable.

```bash
cp .env.example .env
```

Then replace each `change-me` with a strong random value. You can generate one with:

```bash
openssl rand -hex 24
```

`POSTGRES_PASSWORD` appears again inside `DATABASE_URL` and `TEST_DATABASE_URL`: use the same value in all three.

| Variable                                            | What it is                                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Database user, password and name created on first start                                                                 |
| `POSTGRES_PORT`                                     | Port on your machine for Postgres (default `5433`, so it doesn't clash with a native Postgres on 5432)                  |
| `DATABASE_URL`                                      | Connection string the apps use                                                                                          |
| `TEST_DATABASE_URL`                                 | Separate database for tests (`ekra_test`, created automatically)                                                        |
| `S3_PORT`                                           | Port on your machine for SeaweedFS's S3 API (default `8334`)                                                            |
| `S3_ENDPOINT`                                       | S3 address the apps use                                                                                                 |
| `S3_REGION`                                         | Any value; SeaweedFS ignores it but S3 clients need one                                                                 |
| `S3_BUCKET`                                         | Bucket for uploads and videos                                                                                           |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY`                    | S3 credentials. SeaweedFS creates an admin user with them on start                                                      |
| `SERVER_HOST`, `SERVER_PORT`                        | Where the API server listens (default `127.0.0.1:4000`)                                                                 |
| `NODE_ENV`                                          | `development` (default), `test` or `production`. GraphiQL is off in production                                          |
| `API_URL`                                           | Where the web app reaches the API server (default `http://127.0.0.1:4000`)                                              |
| `BETTER_AUTH_SECRET`                                | Signs sign-in sessions ([Better Auth](https://www.better-auth.com)). 32+ random characters: `openssl rand -base64 48`   |
| `BETTER_AUTH_URL`                                   | The address people open the app at (default `http://localhost:3000`, the web app)                                       |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`          | Optional. "Continue with Google" appears only when both are set (callback `<BETTER_AUTH_URL>/api/auth/callback/google`) |
| `EMAIL_PROVIDER`                                    | `resend` (default) or `console`. See [Email](#email-sign-in-links-confirmations-password-resets)                        |
| `RESEND_API_KEY`, `EMAIL_FROM`                      | Resend API key and the sender address (`Ekra <noreply@your-domain.com>`)                                                |

Each app checks its variables when it starts (with [`@t3-oss/env-core`](https://env.t3.gg) and zod, in the app's
`src/env.ts`). A missing or invalid value stops it with a message naming the variable.

## 8. Local services: Postgres and SeaweedFS

Defined in [`infra/docker-compose.yml`](infra/docker-compose.yml). Run these from the repo root:

| Command               | What it does                                                                  |
| --------------------- | ----------------------------------------------------------------------------- |
| `pnpm services:up`    | Start Postgres and SeaweedFS in the background and wait until they're healthy |
| `pnpm services:down`  | Stop them (data is kept)                                                      |
| `pnpm services:logs`  | Follow their logs (Ctrl+C to stop)                                            |
| `pnpm services:reset` | Stop them and **delete all local data** (database and files)                  |

Data lives in Docker volumes (`ekra_postgres-data`, `ekra_seaweedfs-data`), so it survives restarts.

### Postgres

- Image `postgres:18-alpine`, on `localhost:5433` by default.
- On first start it creates the `ekra` database and the `ekra_test` test database
  (from [`infra/postgres/init`](infra/postgres/init)). These scripts only run when the volume is new; after changing
  them, run `pnpm services:reset`.
- Connect with `psql` (from your machine, or inside the container without installing anything):

  ```bash
  docker compose -f infra/docker-compose.yml --env-file .env exec postgres psql -U ekra -d ekra
  ```
- Any Postgres GUI works too (TablePlus, DBeaver, pgAdmin): host `localhost`, port `5433`, user and password from `.env`.

### SeaweedFS (file and video storage)

[SeaweedFS](https://github.com/seaweedfs/seaweedfs) stores uploads, images and videos. Ekra talks to it through its
**S3-compatible API**, so any S3 tool or SDK works with it, and production can later point at any S3 service.

- Image `chrislusf/seaweedfs:4.51`, one process running the master, volume server, filer and S3 gateway.
- S3 API on `http://localhost:8334` by default. Only the S3 port is published to your machine.
- Credentials: `S3_ACCESS_KEY` / `S3_SECRET_KEY` from `.env` (passed to SeaweedFS as `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY`, which makes them an admin identity). Without credentials every S3 request is refused.

Create the bucket once (after `pnpm services:up`):

```bash
docker compose -f infra/docker-compose.yml --env-file .env exec seaweedfs \
  sh -c 'echo "s3.bucket.create -name ekra" | weed shell'
```

Check it exists:

```bash
docker compose -f infra/docker-compose.yml --env-file .env exec seaweedfs \
  sh -c 'echo "s3.bucket.list" | weed shell'
```

## 9. Without Docker: native Postgres and SeaweedFS

You can run the same two services directly on Linux instead. Then skip section 8 and point `.env` at them
(`POSTGRES_PORT=5432`, `S3_PORT=8333`, and matching URLs).

### Postgres 18

```bash
sudo apt-get install -y postgresql-18   # or `postgresql` for your distro's default version
sudo -u postgres psql -c "CREATE USER ekra WITH PASSWORD 'your-password' CREATEDB;"
sudo -u postgres createdb -O ekra ekra
sudo -u postgres createdb -O ekra ekra_test
```

If `postgresql-18` isn't in your distro, add the official repo first:
[postgresql.org/download/linux/ubuntu](https://www.postgresql.org/download/linux/ubuntu/).

### SeaweedFS

1. Download the latest Linux build from
   [github.com/seaweedfs/seaweedfs/releases](https://github.com/seaweedfs/seaweedfs/releases)
   (`linux_amd64.tar.gz`, or `linux_arm64.tar.gz` on ARM), then install the `weed` binary:

   ```bash
   tar -xzf linux_amd64.tar.gz
   sudo install -m 0755 weed /usr/local/bin/weed
   weed version
   ```
2. Create a system user and data folder:

   ```bash
   sudo useradd --system --no-create-home --shell /usr/sbin/nologin seaweedfs
   sudo install -d -o seaweedfs -g seaweedfs /var/lib/seaweedfs
   ```
3. Put the S3 credentials in a root-only env file:

   ```bash
   sudo install -d /etc/seaweedfs
   printf 'AWS_ACCESS_KEY_ID=ekra\nAWS_SECRET_ACCESS_KEY=%s\n' "$(openssl rand -hex 24)" | sudo tee /etc/seaweedfs/s3.env > /dev/null
   sudo chmod 600 /etc/seaweedfs/s3.env
   ```
4. Create `/etc/systemd/system/seaweedfs.service`:

   ```ini
   [Unit]
   Description=SeaweedFS all-in-one (master, volume, filer, S3)
   After=network.target

   [Service]
   User=seaweedfs
   EnvironmentFile=/etc/seaweedfs/s3.env
   ExecStart=/usr/local/bin/weed server -dir=/var/lib/seaweedfs -ip=127.0.0.1 -ip.bind=127.0.0.1 -s3 -s3.port=8333
   Restart=on-failure

   [Install]
   WantedBy=multi-user.target
   ```
5. Start it and create the bucket:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now seaweedfs
   echo "s3.bucket.create -name ekra" | weed shell
   ```

## 10. Run the app

> The apps are being built now (Phase 0). This section fills in as they land.

```bash
pnpm services:up   # Postgres + SeaweedFS
pnpm dev           # all apps
```

### Database (`packages/db`)

The schema lives in `packages/db/src/schema` ([Drizzle ORM](https://orm.drizzle.team)); migrations are SQL files in
`packages/db/migrations` and are committed.

```bash
pnpm db:migrate      # apply migrations to DATABASE_URL (run after pulling, and once after pnpm services:up)
pnpm db:generate     # after changing the schema: write a new migration, then commit it
pnpm db:studio       # browse the data in Drizzle Studio
```

Ids are time-ordered UUIDs made by Postgres 18 itself (`uuidv7()`), so Postgres 18 or newer is required.

Tests use the separate `ekra_test` database (`TEST_DATABASE_URL`) and apply the migrations to it themselves; they
refuse to run against a database whose name doesn't contain `test`.

### API server (`apps/server`)

```bash
pnpm --filter @ekra/server dev    # restarts on file changes
```

- Health check: <http://127.0.0.1:4000/api/health> answers `{"status":"ok"}`.
- GraphQL: `http://127.0.0.1:4000/api/graphql`. Open it in a browser for GraphiQL (development only) and try `{ health }`.
- Tests: `pnpm --filter @ekra/server test`.

Node 24 runs the TypeScript directly, so the server has no build step.

### Signing in (Better Auth)

Sign-in, sessions, organizations, members, roles, invitations and teams are handled by
[Better Auth](https://www.better-auth.com), served by the API server at `/api/auth/*`.

- **Email and password:** sign up with a name, email and password (10–128 characters). A confirmation email is sent
  and password sign-in works once the address is confirmed. "Forgot password?" emails a link (valid 60 minutes) to
  choose a new password; that signs the account out everywhere else.
- **Emailed sign-in links:** single use, valid 10 minutes.
- **Google:** set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (a Google OAuth client with the callback above).
- **Roles in an organization:** owner, admin, trainer, learner, guest. Whoever creates an organization is its owner.
- **Schema:** the auth tables live in `packages/db/src/schema/auth.ts`. They were generated with Better Auth's CLI
  (`npx auth generate`) and are kept by hand; after changing auth plugins, regenerate into a scratch file and copy
  over what changed, then `pnpm db:generate`.
- **Ids** are 16-character nanoids (`generateId()` in `packages/db`), for Better Auth's tables too.

### Email (sign-in links, confirmations, password resets)

Email goes through one small interface in `packages/email`, so you can use any provider. Pick it with
`EMAIL_PROVIDER`:

| Provider  | Set                            | Notes                                                                                        |
| --------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `resend`  | `RESEND_API_KEY`, `EMAIL_FROM` | Default. Get a key at [resend.com](https://resend.com) and verify your sending domain there. |
| `console` | nothing                        | Prints each email (with its link) in the API server terminal. For development.               |

- In development, if `EMAIL_PROVIDER=resend` but `RESEND_API_KEY` is empty, emails are printed in the terminal
  instead (with a warning), so you can sign in locally without an account anywhere.
- In production, a missing key stops the server at startup.
- **Adding a provider** (Postmark, SES, SMTP, …): add a file in `packages/email/src/providers/` that implements
  `EmailProvider` (`send(message)`), add its name to `EMAIL_PROVIDERS` and a case in `createMailer`, and document its
  settings here and in `.env.example`.

### Web app (`apps/web`)

Start the API server first, then:

```bash
pnpm --filter @ekra/web dev       # http://localhost:3000
```

- The page shows **API: ok** when the web app can reach the API.
- The browser only talks to `/api` on port 3000. The web server forwards `/api/*` to `API_URL`, in development and in
  the production build, so cookies stay on one origin.
- Production build: `pnpm --filter @ekra/web build`, then `pnpm --filter @ekra/web start` (serves `.output/`).
- UI components come from `packages/ui` (shadcn/ui on Base UI). Add one with
  `pnpm dlx shadcn@latest add <component> -c apps/web`; it lands in `packages/ui/src/components`.

### Checking the UI in a browser (agent-browser)

We check pages with [agent-browser](https://github.com/vercel-labs/agent-browser), a browser CLI that people and AI
coding agents can both drive. Install it once:

```bash
npm install -g agent-browser
agent-browser install --with-deps   # downloads Chrome and, on Linux, its system libraries
```

Then, with the apps running:

```bash
agent-browser open http://localhost:3000
agent-browser snapshot -i                      # the page's interactive elements
agent-browser get text "[data-testid=api-status]"
agent-browser screenshot home.png
agent-browser close
```

## 11. Git hooks and commits

[Lefthook](https://github.com/evilmartians/lefthook) runs these automatically after `pnpm install`:

| When           | What runs                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git commit`   | Biome fixes and checks the staged files                                                                                                                    |
| commit message | Must follow [Conventional Commits](https://www.conventionalcommits.org) (`feat(web): …`, `fix: …`); `Co-Authored-By` and AI attribution lines are rejected |
| `git push`     | Typecheck and tests                                                                                                                                        |

Run the checks yourself any time with `pnpm check`, `pnpm typecheck` and `pnpm test`. If the hooks are missing,
run `pnpm exec lefthook install`.

## 12. Task tracking with Zadaci (optional)

Work is tracked in [Zadaci](https://zadaci.vercel.app), project **Ekra** (task keys `EKR-n`). To let Claude Code read
and update tasks:

```bash
claude mcp add --transport http zadaci https://zadaci.vercel.app/api/mcp
```

The first use opens your browser to sign in and approve it.

## 13. Troubleshooting

**`permission denied while trying to connect to the docker API`**
Your shell started before you joined the `docker` group. Run `wsl --shutdown` (Windows) or log out and in (Linux),
then open a new terminal.

**`port is already allocated` / `address already in use`**
Something else uses the port. Change `POSTGRES_PORT` or `S3_PORT` in `.env` (and the matching URLs), then
`pnpm services:up` again. See what's using a port with `ss -ltnp | grep 5433`.

**`set POSTGRES_USER in .env` (or another variable)**
You haven't created `.env` yet, or a variable is missing. Run `cp .env.example .env` and fill it in.

**Init scripts didn't run / `ekra_test` is missing**
They only run on a fresh volume. `pnpm services:reset` then `pnpm services:up` (this deletes local data).

**`pnpm install` complains about ignored build scripts**
Allowed and blocked build scripts are listed under `allowBuilds` in `pnpm-workspace.yaml`. Add the package there
with `true` or `false`.

**Docker is slow or files don't update on WSL**
Keep the repo in the Linux file system (`~/…`), not under `/mnt/c`.
