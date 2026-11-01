import assert from "node:assert/strict";
import { test } from "node:test";
import { ago } from "./time.ts";

test("ago says how long ago, then the date", () => {
	const now = new Date("2026-11-02T12:00:00Z");
	const before = (ms: number) => new Date(now.getTime() - ms);
	assert.equal(ago(before(20_000), now), "just now");
	assert.equal(ago(before(5 * 60_000), now), "5m ago");
	assert.equal(ago(before(3 * 3_600_000), now), "3h ago");
	assert.equal(ago(before(2 * 86_400_000), now), "2d ago");
	assert.equal(ago("2026-03-04T12:00:00Z", now), "Mar 4");
	assert.equal(ago("2025-03-04T12:00:00Z", now), "Mar 4, 2025");
});
