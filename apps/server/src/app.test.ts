import assert from "node:assert/strict";
import { test } from "node:test";
import { createError } from "evlog";
import { app } from "./app.ts";
import { LIMITS } from "./graphql/yoga.ts";

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

const graphql = (query: string) =>
	app.request("/api/graphql", {
		method: "POST",
		headers: { "content-type": "application/json" },
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
