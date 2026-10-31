import { parseError } from "evlog";
import type { EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { auth } from "./auth/index.ts";
import { yoga } from "./graphql/yoga.ts";
import { requestLogs } from "./log.ts";

/** Every API route lives under /api, so a proxy (or the web app's server) can send /api/* here. */
export const app = new Hono<EvlogVariables>().basePath("/api");

// one structured log event per request (src/log.ts)
app.use(requestLogs);

// the full error goes into the request's log event; the client gets the safe parts only
app.onError((error, c) => {
	c.get("log").error(error);
	const { message, status, why, fix } = parseError(error);
	return c.json({ message, why, fix }, status as ContentfulStatusCode);
});

app.get("/health", (c) => c.json({ status: "ok" }));

// Better Auth: sign-in, sessions, organizations, members, invitations, teams
app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

app.on(["GET", "POST"], "/graphql", (c) => yoga.fetch(c.req.raw));
