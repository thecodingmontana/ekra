import assert from "node:assert/strict";
import { test } from "node:test";
import { enrollmentStatus } from "./enrollment.ts";

test("an enrollment's status: done, late, not begun, or under way", () => {
	const now = new Date("2026-11-02T12:00:00Z");
	const past = "2026-11-01T12:00:00Z";
	const future = "2026-11-09T12:00:00Z";
	const s = (percent: number, started: boolean, dueAt: string | null) =>
		enrollmentStatus({ percent, started, dueAt }, now);
	assert.equal(
		s(100, true, past),
		"completed",
		"finished late still counts as done",
	);
	assert.equal(s(40, true, past), "overdue");
	assert.equal(s(0, false, past), "overdue");
	assert.equal(s(0, false, future), "not_started");
	assert.equal(
		s(0, true, future),
		"in_progress",
		"opened, nothing finished yet",
	);
	assert.equal(s(65, true, null), "in_progress");
});
