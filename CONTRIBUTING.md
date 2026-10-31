# Contributing to Ekra

Thanks for wanting to help. Bug reports, ideas, docs fixes and code are all welcome.

## Before you start

- **Bugs and ideas:** open an [issue](https://github.com/thecodingmontana/ekra/issues) first, using the bug or
  feature template. For a big change, wait for a reply before writing code, so nobody's work goes to waste.
- **Security problems:** don't open a public issue. See [SECURITY.md](SECURITY.md).
- **Code of conduct:** by taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- **Conventions:** read [AGENTS.md](AGENTS.md) (it's for humans too) and the plan in [PLAN.md](PLAN.md).

## Set up the project

Follow [SETUP.md](SETUP.md): Node 24, pnpm, Docker, a `.env` copied from `.env.example`, then
`pnpm services:up` and `pnpm dev`.

## Making a change

1. Create a branch from `main` named after the Zadaci task, for example `ekr-12-upload-limit`.
2. Keep the change focused: one fix or feature per pull request.
3. Follow the code around you: small modules, plain names, and a short comment only when the reason isn't obvious.
4. **Database changes:** edit the schema in `packages/db`, generate a migration and commit it.
5. **New GraphQL fields:** check the user's organization and role in the resolver, validate input with Zod, and add a
   test that another organization can't reach the data.
6. **Dependencies:** prefer platform APIs and our own small code. Explain any new dependency in the pull request.
   UI components are shadcn/ui on Base UI; don't add Radix.
7. **Setup changes:** a new service, port, tool or env variable updates [SETUP.md](SETUP.md) and `.env.example`.

## Checks to run

```bash
pnpm check        # Biome lint and format
pnpm typecheck    # TypeScript
pnpm test         # tests (needs pnpm services:up)
pnpm build
```

The git hooks run most of these for you (see SETUP.md, section 11).

## Commits and pull requests

- Write commits in the [Conventional Commits](https://www.conventionalcommits.org) style: `feat(web): …`,
  `fix(api): …`, `docs: …`, `refactor: …`, `perf: …`, `test: …`, `chore: …`. Mention the task key (`EKR-n`).
- No `Co-Authored-By` lines or AI attribution in commits or pull requests; the commit hook rejects them.
- Open the pull request against `main` and fill in the template. Add a screenshot or clip for anything visible.
- Make sure CI passes. A maintainer will review it, and may ask for changes before merging.

## License of contributions

Ekra is released under the [PolyForm Noncommercial License 1.0.0](LICENSE) and is also offered under commercial
licenses by its owner, Christopher Odhiambo. By opening a pull request, you agree that:

- your contribution is your own work (or you have the right to submit it), and
- it is licensed under the PolyForm Noncommercial License 1.0.0, **and** you grant the owner a perpetual, worldwide,
  royalty-free right to use, change and license your contribution under other terms, including commercial ones.

You keep the copyright in your contribution and are credited in the git history.
