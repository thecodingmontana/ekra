# Security Policy

## Reporting a vulnerability

Please **don't** open a public issue for security problems.

Email **thecodingmontana@gmail.com** with:

- what the problem is and where it is (file, route or GraphQL field)
- steps to reproduce it, or a small proof of concept
- what an attacker could do with it (for example, read another organization's data)

You'll get a reply within a few days. Once the problem is confirmed, we'll work on a fix and agree with you on when to
disclose it. We're happy to credit you unless you'd rather stay anonymous.

## Supported versions

Only the latest version on the `main` branch gets security fixes.

## Good to know

- Ekra is multi-tenant. Every organization's rows carry an `org_id`, enforced both in resolvers and by Postgres
  row-level security, so a bug in one query can't expose another organization's data.
- Each API request is capped in size, depth and cost (GraphQL Yoga with graphql-armor).
- Files are uploaded with short-lived presigned S3 URLs; the S3 credentials never reach the browser.
- Never commit secrets: keep them in `.env` (gitignored) or your server's environment settings.
