import assert from "node:assert/strict";
import { test } from "node:test";
import {
	assigneesCsv,
	fromLocalInput,
	sendAgainLabel,
	toLocalInput,
} from "./assignees.ts";

test("CSV has a header and escapes commas, quotes and line breaks", () => {
	const csv = assigneesCsv([
		{
			name: 'Leo "the Lion", Jr.',
			email: "leo@example.com",
			role: "Learner",
			startAt: "2026-01-01T09:00:00.000Z",
			dueAt: null,
			status: "in_progress",
			percent: 40,
		},
		{
			name: "Two\nLines",
			email: "",
			role: "Trainer",
			startAt: "2026-01-02T09:00:00.000Z",
			dueAt: "2026-02-01T09:00:00.000Z",
			status: "completed",
			percent: 100,
		},
	]);
	assert.equal(
		csv,
		"Name,Email,Role,Start,Due,Status,Percent\r\n" +
			'"Leo ""the Lion"", Jr.",leo@example.com,Learner,2026-01-01T09:00:00.000Z,,In progress,40\r\n' +
			'"Two\nLines",,Trainer,2026-01-02T09:00:00.000Z,2026-02-01T09:00:00.000Z,Completed,100\r\n',
	);
});

test("an empty list is just the header", () => {
	assert.equal(
		assigneesCsv([]),
		"Name,Email,Role,Start,Due,Status,Percent\r\n",
	);
});

test("send again label counts minutes up, and is null once the wait is over", () => {
	const now = Date.parse("2026-01-01T10:00:00.000Z");
	assert.equal(sendAgainLabel(null, now), null);
	assert.equal(
		sendAgainLabel("2026-01-01T10:29:10.000Z", now),
		"Send again in 30m",
	);
	assert.equal(
		sendAgainLabel("2026-01-01T10:29:00.000Z", now),
		"Send again in 29m",
	);
	assert.equal(
		sendAgainLabel("2026-01-01T10:00:20.000Z", now),
		"Send again in 1m",
	);
	assert.equal(sendAgainLabel("2026-01-01T10:00:00.000Z", now), null);
	assert.equal(sendAgainLabel("2026-01-01T09:00:00.000Z", now), null);
});

test("datetime-local values round-trip through ISO dates", () => {
	assert.equal(toLocalInput(null), "");
	assert.equal(fromLocalInput(""), null);
	const local = "2026-03-04T05:06";
	assert.equal(toLocalInput(fromLocalInput(local)), local);
});
