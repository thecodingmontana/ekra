import assert from "node:assert/strict";
import { test } from "node:test";
import { app } from "./app.ts";
import { fixedWindow } from "./rate-limit.ts";
import { ORIGIN } from "./test-helpers.ts";

test("a fixed window lets `limit` through, then says when to come back, then opens again", () => {
	let now = 1_000_000;
	const counter = fixedWindow(2, 60_000, () => now);
	assert.equal(counter.hit("a"), 0);
	assert.equal(counter.hit("a"), 0);
	assert.equal(counter.hit("a"), 60, "seconds until the window ends");
	assert.equal(counter.hit("b"), 0, "each key counts on its own");
	now += 59_001;
	assert.equal(counter.hit("a"), 1);
	now += 1_000;
	assert.equal(counter.hit("a"), 0, "a new window");
});

test("crash reports from one address stop at the limit with Retry-After", async () => {
	const send = () =>
		app.request("/api/client-error", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: ORIGIN,
				"x-forwarded-for": "198.51.100.77",
			},
			body: JSON.stringify({ message: "boom", path: "/" }),
		});
	const statuses = [];
	for (let i = 0; i < 20; i++) statuses.push((await send()).status);
	assert.deepEqual(new Set(statuses), new Set([204]));
	const over = await send();
	assert.equal(over.status, 429);
	assert.ok(Number(over.headers.get("retry-after")) > 0);
});
