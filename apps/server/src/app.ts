import { EvlogError, parseError } from "evlog";
import type { EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
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
	// a crash's own message can name hosts, SQL or settings: only errors raised on purpose
	// (createError from evlog) explain themselves to the client
	if (status >= 500 && !(error instanceof EvlogError))
		return c.json(
			{ message: "Something went wrong. Try again in a moment." },
			500,
		);
	return c.json({ message, why, fix }, status as ContentfulStatusCode);
});

app.get("/health", (c) => c.json({ status: "ok" }));

// a page that crashed in someone's browser (the web app's error page sends it); size-capped, logged, nothing stored
const clientError = z.object({
	message: z.string().max(2000),
	stack: z.string().max(8000).optional(),
	path: z.string().max(500),
});
app.post("/client-error", async (c) => {
	const body = clientError.safeParse(await c.req.json().catch(() => null));
	if (!body.success) return c.body(null, 400);
	const { message, stack, path } = body.data;
	c.get("log").error(message, { client: { path, stack } });
	return c.body(null, 204);
});

// Better Auth: sign-in, sessions, organizations, members, invitations, teams
app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

app.on(["GET", "POST"], "/graphql", (c) => yoga.fetch(c.req.raw));
