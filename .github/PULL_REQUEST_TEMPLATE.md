## What and why

What does this change, and why? Name the Zadaci task (`EKR-n`) and any issue it closes (`Closes #123`).

## How to check it

Steps a reviewer can follow locally (see [SETUP.md](../SETUP.md)) to see it working.

## Screenshots

For anything visible, before and after.

## Checklist

- [ ] `pnpm check`, `pnpm typecheck` and `pnpm test` pass
- [ ] Works locally with `pnpm services:up` + `pnpm dev`
- [ ] Tests added or updated for new behaviour
- [ ] A migration is included if the schema in `packages/db` changed
- [ ] New GraphQL fields check the organization and role; tenant isolation is tested
- [ ] [SETUP.md](../SETUP.md) and `.env.example` updated if setup, services or env variables changed
- [ ] No new dependency without a reason (we prefer platform APIs); UI uses Base UI, not Radix
- [ ] No secrets, personal data, `Co-Authored-By` or AI attribution in code, commits or this PR
- [ ] The Zadaci task is updated
- [ ] I agree to the [license of contributions](../CONTRIBUTING.md#license-of-contributions)
