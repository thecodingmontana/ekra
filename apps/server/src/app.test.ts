import assert from "node:assert/strict";
import { test } from "node:test";
import { createError } from "evlog";
import { app } from "./app.ts";
import { LIMITS } from "./graphql/yoga.ts";
import { ORIGIN } from "./test-helpers.ts";

// routes for the error test, added before any request (Hono builds its router on the first one)
app.get("/test-crash", () => {
	throw new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2");
});
app.get("/test-declined", () => {
	throw createError({
		message: "Card declined",
		status: 402,
		why: "Insufficient funds",
		fix: "Use another card",
	});
});

const graphql = (query: string, headers: Record<string, string> = {}) =>
	app.request("/api/graphql", {
		method: "POST",
		headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
		body: JSON.stringify({ query }),
	});

test("GET /api/health answers ok", async () => {
	const res = await app.request("/api/health");
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), { status: "ok" });
});

test("GraphQL health query answers ok", async () => {
	const res = await graphql("{ health }");
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), { data: { health: "ok" } });
});

test("GraphQL refuses a query with too many aliases", async () => {
	const aliases = Array.from(
		{ length: LIMITS.aliases + 1 },
		(_, i) => `a${i}: health`,
	);
	const body = (await (await graphql(`{ ${aliases.join(" ")} }`)).json()) as {
		data?: unknown;
		errors?: { message: string }[];
	};
	assert.equal(body.data, undefined);
	assert.match(body.errors?.[0]?.message ?? "", /aliases/i);
});

test("unknown routes are 404", async () => {
	const res = await app.request("/api/nope");
	assert.equal(res.status, 404);
});

test("a crash tells the client nothing; an error raised on purpose explains itself", async () => {
	const crash = await app.request("/api/test-crash");
	assert.equal(crash.status, 500);
	const body = JSON.stringify(await crash.json());
	assert.doesNotMatch(body, /ECONNREFUSED|hunter2|10\.0\.0\.5/);

	const declined = await app.request("/api/test-declined");
	assert.equal(declined.status, 402);
	assert.deepEqual(await declined.json(), {
		message: "Card declined",
		why: "Insufficient funds",
		fix: "Use another card",
	});
});

test("a browser crash report is accepted, and junk is refused", async () => {
	const send = (body: unknown) =>
		app.request("/api/client-error", {
			method: "POST",
			headers: { "content-type": "application/json", origin: ORIGIN },
			body: JSON.stringify(body),
		});
	assert.equal(
		(await send({ message: "boom", stack: "at x", path: "/o/acme" })).status,
		204,
	);
	assert.equal((await send({ nope: true })).status, 400);
	assert.equal(
		(await send({ message: "x".repeat(5000), path: "/" })).status,
		400,
		"too long",
	);
});

const MUTATION = 'mutation { startLearning(slug: "x", contentId: "y") }';
const SUBDOMAIN = ORIGIN.replace("//", "//acme.");

test("a write from another site, or with no Origin, is refused before GraphQL or media see it", async () => {
	assert.equal(
		(await graphql(MUTATION, { origin: "https://evil.example" })).status,
		403,
	);
	const noOrigin = await app.request("/api/graphql", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ query: MUTATION }),
	});
	assert.equal(noOrigin.status, 403);
	assert.ok(((await noOrigin.json()) as { message: string }).message);
	const media = await app.request("/api/media?org=x", {
		method: "POST",
		headers: { origin: "https://evil.example" },
		body: new FormData(),
	});
	assert.equal(media.status, 403);
	// the app and its organizations' subdomains are fine
	assert.equal(
		(await graphql("{ health }", { origin: SUBDOMAIN })).status,
		200,
	);
});

test("GraphQL takes only JSON bodies, and no mutations over GET", async () => {
	const form = await app.request("/api/graphql", {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			origin: ORIGIN,
		},
		body: new URLSearchParams({ query: MUTATION }).toString(),
	});
	assert.equal(form.status, 415);
	const overGet = await app.request(
		`/api/graphql?query=${encodeURIComponent(MUTATION)}`,
		{ headers: { accept: "application/json" } },
	);
	assert.equal(overGet.status, 405);
});

test("CORS lets only the app's own origins read with credentials", async () => {
	const preflight = (origin: string) =>
		app.request("/api/graphql", {
			method: "OPTIONS",
			headers: {
				origin,
				"access-control-request-method": "POST",
				"access-control-request-headers": "content-type",
			},
		});
	const evil = await preflight("https://evil.example");
	assert.equal(evil.headers.get("access-control-allow-origin"), null);
	const ours = await preflight(SUBDOMAIN);
	assert.equal(ours.headers.get("access-control-allow-origin"), SUBDOMAIN);
	assert.equal(ours.headers.get("access-control-allow-credentials"), "true");
});

test("API responses carry the security headers", async () => {
	const res = await app.request("/api/health");
	assert.equal(res.headers.get("x-frame-options"), "DENY");
	assert.equal(res.headers.get("x-content-type-options"), "nosniff");
	assert.equal(
		res.headers.get("referrer-policy"),
		"strict-origin-when-cross-origin",
	);
	assert.match(res.headers.get("permissions-policy") ?? "", /camera=\(\)/);
	// HSTS only in production
	assert.equal(res.headers.get("strict-transport-security"), null);
});
