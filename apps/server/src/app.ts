import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { certificate, organization } from "@ekra/db";
import { eq } from "drizzle-orm";
import { createError, EvlogError, parseError } from "evlog";
import type { EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE } from "hono/streaming";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { assistant } from "./ai/chat.ts";
import {
	AUTH_ISSUER,
	auth,
	isTrustedOrigin,
	MCP_RESOURCE,
	MCP_SCOPES,
} from "./auth/index.ts";
import { db } from "./db.ts";
import { env } from "./env.ts";
import { orgBySlug } from "./graphql/tenant.ts";
import { yoga } from "./graphql/yoga.ts";
import { requestLogs } from "./log.ts";
import { mcpResponse } from "./mcp.ts";
import { media } from "./media.ts";
import { perMinute } from "./rate-limit.ts";
import { onChange, trackStream } from "./realtime.ts";

/** Every API route lives under /api, so a proxy (or the web app's server) can send /api/* here. */
export const app = new Hono<EvlogVariables>().basePath("/api");

// one structured log event per request (src/log.ts)
app.use(requestLogs);

app.use(
	secureHeaders({
		xFrameOptions: "DENY",
		xContentTypeOptions: "nosniff",
		referrerPolicy: "strict-origin-when-cross-origin",
		permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
		// only behind HTTPS; on a laptop it would pin http://localhost to https
		strictTransportSecurity:
			env.NODE_ENV === "production"
				? "max-age=31536000; includeSubDomains"
				: false,
		// the API serves JSON and media, not pages; the web app sets its own CSP
		contentSecurityPolicy: undefined,
		crossOriginResourcePolicy: false,
		crossOriginOpenerPolicy: false,
		crossOriginEmbedderPolicy: false,
		originAgentCluster: false,
		xDnsPrefetchControl: false,
		xDownloadOptions: false,
		xPermittedCrossDomainPolicies: false,
		xXssProtection: false,
	}),
);

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

// Caddy asks this before getting a certificate for a host (on-demand TLS): only the app's own address and the
// subdomains of organizations that exist, so nobody can make the server request certificates for random names
app.get("/domains/allowed", async (c) => {
	const domain = (c.req.query("domain") ?? "").toLowerCase();
	const appHost = new URL(env.BETTER_AUTH_URL).hostname;
	if (domain === appHost) return c.body(null, 200);
	if (!domain.endsWith(`.${appHost}`)) return c.body(null, 404);
	const slug = domain.slice(0, -appHost.length - 1);
	const [org] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, slug))
		.limit(1);
	return c.body(null, org ? 200 : 404);
});

// a page that crashed in someone's browser (the web app's error page sends it); size-capped, logged, nothing stored
const clientError = z.object({
	message: z.string().max(2000),
	stack: z.string().max(8000).optional(),
	path: z.string().max(500),
});
app.post("/client-error", perMinute(20), async (c) => {
	const body = clientError.safeParse(await c.req.json().catch(() => null));
	if (!body.success) return c.body(null, 400);
	const { message, stack, path } = body.data;
	c.get("log").error(message, { client: { path, stack } });
	return c.body(null, 204);
});

/**
 * The browser's Sec-Fetch-Mode as the web app's forwarder saw it (its own fetch replaces it with "cors"). Nothing
 * is trusted from it: a client could send either header itself; it only picks a redirect or JSON.
 */
export function withFetchMode(request: Request) {
	const mode = request.headers.get("x-forwarded-fetch-mode");
	if (!mode) return request;
	const headers = new Headers(request.headers);
	headers.delete("x-forwarded-fetch-mode");
	if (mode === "none") headers.delete("sec-fetch-mode");
	else headers.set("sec-fetch-mode", mode);
	return new Request(request, { headers });
}

// Better Auth: sign-in, sessions, organizations, members, invitations, teams
app.on(["GET", "POST"], "/auth/*", (c) =>
	auth.handler(withFetchMode(c.req.raw)),
);

// How AI agents sign in to use /api/mcp; the web app serves these at its own /.well-known/ addresses
const authServerMetadata = oauthProviderAuthServerMetadata(auth);
app.get("/.well-known/oauth-authorization-server", (c) =>
	authServerMetadata(c.req.raw),
);
// RFC 9728: /api/mcp is protected by Ekra's own sign-in (the OAuth issuer is the app itself)
app.get("/.well-known/oauth-protected-resource", (c) => {
	c.header("cache-control", "public, max-age=300");
	c.header("access-control-allow-origin", "*");
	return c.json({
		resource: MCP_RESOURCE,
		authorization_servers: [AUTH_ISSUER],
		scopes_supported: MCP_SCOPES,
		bearer_methods_supported: ["header"],
		resource_name: "Ekra",
	});
});

// Ekra for AI agents (MCP, Streamable HTTP, stateless). A bearer token only, never cookies: browsers don't send
// one by themselves, so the Origin check below isn't needed here; the agent's own limit is per person.
app.post("/mcp", mcpResponse);
// no server-sent stream or sessions to resume: stateless
app.on(["GET", "DELETE"], "/mcp", (c) => c.body(null, 405, { allow: "POST" }));

// A change to GraphQL or media must come from the app itself: browsers always send Origin on such requests, so one
// that's missing or foreign is another site (or a script) riding on the visitor's cookies. Sign-in has its own check.
const sameSiteWrites = createMiddleware(async (c, next) => {
	if (c.req.method === "GET" || c.req.method === "HEAD") return next();
	if (!(await isTrustedOrigin(c.req.header("origin"))))
		throw createError({
			message: "This request didn't come from the app.",
			status: 403,
			why: "Changes are only accepted from the app's own pages.",
		});
	return next();
});
app.use("/graphql", sameSiteWrites);
app.use("/media", sameSiteWrites);
app.use("/media/*", sameSiteWrites);
app.use("/ai/*", sameSiteWrites);

// generous for changes made in the app; tighter for starting uploads (each one is stored and processed)
app.use(
	"/graphql",
	perMinute(
		300,
		// a rough look is enough: the word in a string only counts a query too
		async (request) =>
			request.method === "POST" &&
			/\bmutation\b/.test(await request.clone().text()),
	),
);
const mediaStart = perMinute(30, (request) => request.method === "POST");
app.use("/media", mediaStart);
app.use("/media/videos", mediaStart);

app.on(["GET", "POST", "OPTIONS"], "/graphql", (c) => {
	// a form post can't send JSON, so it can't run a mutation either
	if (
		c.req.method === "POST" &&
		!c.req.header("content-type")?.toLowerCase().startsWith("application/json")
	)
		throw createError({
			message: "Send GraphQL requests as JSON.",
			status: 415,
		});
	return yoga.fetch(c.req.raw);
});

app.route("/media", media);

// the built-in assistant (src/ai/chat.ts): its own daily limit per person, plus a per-address cap on messages
app.use(
	"/ai/chat",
	perMinute(30, (request) => request.method === "POST"),
);
app.route("/ai", assistant);

// A certificate's public check (its id is the code): who, for what, from which organization, when. No sign-in.
app.get("/certificates/:id", async (c) => {
	const id = c.req.param("id");
	if (!/^[0-9A-Za-z]{16}$/.test(id)) return c.json({ error: "Not found" }, 404);
	const [row] = await db
		.select({
			id: certificate.id,
			name: certificate.name,
			title: certificate.title,
			issuedAt: certificate.issuedAt,
			organization: {
				name: organization.name,
				slug: organization.slug,
				logo: organization.logo,
				color: organization.color,
			},
		})
		.from(certificate)
		.innerJoin(organization, eq(organization.id, certificate.orgId))
		.where(eq(certificate.id, id));
	if (!row) return c.json({ error: "Not found" }, 404);
	return c.json({ ...row, issuedAt: row.issuedAt.toISOString() });
});

/** a comment line now and then keeps proxies from closing a quiet stream */
const KEEPALIVE_MS = 25_000;

// Live updates for one organization (Server-Sent Events): "changed" whenever something in it changes. Members only.
app.get("/events", async (c) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) throw createError({ message: "Sign in first.", status: 401 });
	const org = await orgBySlug({ session }, c.req.query("org") ?? "").catch(
		() => {
			throw createError({
				message: "Choose an organization you belong to.",
				status: 403,
			});
		},
	);
	return streamSSE(c, async (stream) => {
		const stop = await onChange(org.id, (from) => {
			void stream.writeSSE({
				event: "changed",
				data: JSON.stringify({ from }),
			});
		});
		let open = true;
		const untrack = trackStream(() => {
			open = false;
			void stream.close();
		});
		stream.onAbort(stop);
		await stream.writeSSE({ event: "ready", data: "{}" });
		while (open && !stream.aborted) {
			await stream.sleep(KEEPALIVE_MS);
			if (open && !stream.aborted) await stream.write(": keepalive\n\n");
		}
		untrack();
		stop();
	});
});
