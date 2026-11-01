import assert from "node:assert/strict";
import { test } from "node:test";
import { spaced } from "./spaced.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("spaced runs once per burst, and keeps runs apart", async () => {
	let runs = 0;
	const refresh = spaced(() => runs++, 120, 20);
	refresh();
	refresh();
	refresh();
	await wait(40);
	assert.equal(runs, 1, "a burst is one run");
	refresh();
	await wait(40);
	assert.equal(runs, 1, "too soon after the last run");
	await wait(100);
	assert.equal(runs, 2, "runs once the gap has passed");
	refresh();
	refresh.cancel();
	await wait(200);
	assert.equal(runs, 2, "a cancelled run never happens");
});
