import { Hono } from "hono";
import { auth } from "./auth/index.ts";
import { yoga } from "./graphql/yoga.ts";

/** Every API route lives under /api, so a proxy (or the web app's server) can send /api/* here. */
export const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ status: "ok" }));

// Better Auth: sign-in, sessions, organizations, members, invitations, teams
app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

app.on(["GET", "POST"], "/graphql", (c) => yoga.fetch(c.req.raw));
