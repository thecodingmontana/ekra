import assert from "node:assert/strict";
import { test } from "node:test";
import {
	activeSeries,
	cellOf,
	duration,
	filterLearners,
	gridRow,
	learnersCsv,
	percentOf,
} from "./reports.ts";

test("activeSeries fills missing days with 0, oldest first, and labels them", () => {
	const s = activeSeries([
		{ day: "2026-11-03", count: 3 },
		{ day: "2026-10-31", count: 1 },
		{ day: "2026-11-01", count: 2 },
	]);
	assert.deepEqual(
		s.map((p) => [p.day, p.learners]),
		[
			["2026-10-31", 1],
			["2026-11-01", 2],
			["2026-11-02", 0],
			["2026-11-03", 3],
		],
	);
	assert.equal(s[0]?.label, "31 Oct");
	assert.deepEqual(activeSeries([]), []);
});

test("activeSeries keeps 56 days across a month end", () => {
	const days = Array.from({ length: 56 }, (_, i) => ({
		day: new Date(Date.UTC(2026, 8, 9 + i)).toISOString().slice(0, 10),
		count: i % 3,
	}));
	const s = activeSeries(days);
	assert.equal(s.length, 56);
	assert.equal(s.at(-1)?.day, "2026-11-03");
});

const row = (name: string) => ({
	person: { id: name, name, image: null, role: "learner" },
	roleLabel: "Learner",
	assigned: 3,
	completed: 1,
	overdue: 0,
	inProgress: 2,
	percent: 40,
	lastOpened: { id: "c", title: "=SUM(A1)", kind: "course" as const },
	lastOpenedAt: "2026-11-03T10:00:00.000Z",
});

test("filterLearners matches names in any case and ignores blank search", () => {
	const rows = [row("Leo Learner"), row("Nina Wanjiru")];
	assert.equal(filterLearners(rows, "  ").length, 2);
	assert.deepEqual(
		filterLearners(rows, "NINA").map((r) => r.person.name),
		["Nina Wanjiru"],
	);
});

test("learnersCsv writes a header, one line per learner and guards formulas", () => {
	const csv = learnersCsv([row('Leo "Lion", Jr.')]);
	const lines = csv.replace("﻿", "").trim().split("\r\n");
	assert.equal(
		lines[0],
		"Name,Role,Assigned,Completed,In progress,Overdue,Percent,Last opened,Last opened at",
	);
	assert.equal(
		lines[1],
		`"Leo ""Lion"", Jr.",Learner,3,1,2,0,40,'=SUM(A1),2026-11-03T10:00:00.000Z`,
	);
	assert.ok(csv.startsWith("﻿"));
});

test("gridRow gives one cell per question: tick, cross or dash", () => {
	assert.deepEqual(gridRow([true, false, null], 4), [
		"right",
		"wrong",
		"none",
		"none",
	]);
	assert.equal(cellOf(undefined), "none");
});

test("percentOf rounds and has nothing to say about zero", () => {
	assert.equal(percentOf(1, 3), 33);
	assert.equal(percentOf(2, 3), 67);
	assert.equal(percentOf(0, 0), null);
});

test("duration reads as minutes then hours", () => {
	assert.equal(duration(45), "0:45");
	assert.equal(duration(723), "12:03");
	assert.equal(duration(12738), "3h 32m");
	assert.equal(duration(null), "—");
});
