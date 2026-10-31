import assert from "node:assert/strict";
import { test } from "node:test";
import { app } from "./app.ts";
import { LIMITS } from "./graphql/yoga.ts";

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
