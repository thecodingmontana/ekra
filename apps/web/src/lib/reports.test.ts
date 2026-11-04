import assert from "node:assert/strict";
import { test } from "node:test";
import {
	activeSeries,
	cellOf,
	duration,
	filterLearners,
	gridRow,
	LEARNER_SORT,
	learnersCsv,
	percentOf,
	sortRows,
} from "./reports.ts";

test("activeSeries gives one point per week, in order, labelled by its first day", () => {
	const s = activeSeries([
		{ day: "2026-10-22", count: 1 },
		{ day: "2026-10-29", count: 3 },
	]);
	assert.deepEqual(
		s.map((p) => [p.label, p.learners]),
		[
			["22 Oct", 1],
			["29 Oct", 3],
		],
	);
	assert.deepEqual(activeSeries([]), []);
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
	assignedIds: ["c"],
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

test("filterLearners keeps only rows passing every filter, with the search", () => {
	const rows = [
		{ ...row("Ana"), overdue: 1 },
		{ ...row("Ben"), person: { ...row("Ben").person, role: "admin,learner" } },
		{
			...row("Cleo"),
			assigned: 2,
			completed: 2,
			inProgress: 0,
			assignedIds: ["q"],
		},
		{
			...row("Dan"),
			assigned: 0,
			completed: 0,
			inProgress: 0,
			assignedIds: [],
		},
	];
	const names = (r: typeof rows) => r.map((x) => x.person.name);
	assert.deepEqual(names(filterLearners(rows, "", { status: "overdue" })), [
		"Ana",
	]);
	assert.deepEqual(names(filterLearners(rows, "", { status: "completed" })), [
		"Cleo",
	]);
	assert.deepEqual(names(filterLearners(rows, "", { status: "none" })), [
		"Dan",
	]);
	assert.deepEqual(names(filterLearners(rows, "", { status: "in_progress" })), [
		"Ana",
		"Ben",
	]);
	assert.deepEqual(names(filterLearners(rows, "", { role: "admin" })), ["Ben"]);
	assert.deepEqual(names(filterLearners(rows, "", { content: "q" })), ["Cleo"]);
	assert.deepEqual(
		names(
			filterLearners(rows, "a", { status: "in_progress", role: "learner" }),
		),
		["Ana"],
	);
	assert.equal(filterLearners(rows, "", {}).length, 4);
});

test("sortRows orders both ways, keeps ties in order and puts missing values last", () => {
	const rows = [
		{ id: "a", n: 2, t: "beta" },
		{ id: "b", n: null, t: "Alpha" },
		{ id: "c", n: 1, t: "alpha" },
		{ id: "d", n: 2, t: "Gamma" },
	];
	const ids = (r: typeof rows) => r.map((x) => x.id).join("");
	assert.equal(ids(sortRows(rows, (r) => r.n, "asc")), "cadb");
	assert.equal(ids(sortRows(rows, (r) => r.n, "desc")), "adcb");
	assert.equal(
		ids(sortRows(rows, (r) => r.t, "asc")),
		"bcad",
		"case ignored, ties kept",
	);
	assert.equal(ids(sortRows(rows, (r) => r.t, "desc")), "dabc");
	assert.equal(rows[0]?.id, "a", "the input stays as it was");
});

test("LEARNER_SORT orders by last opened with never-opened last", () => {
	const rows = [
		{ ...row("Old"), lastOpenedAt: "2026-01-01T00:00:00.000Z" },
		{ ...row("Never"), lastOpened: null, lastOpenedAt: null },
		{ ...row("New"), lastOpenedAt: "2026-11-01T00:00:00.000Z" },
	];
	assert.deepEqual(
		sortRows(rows, LEARNER_SORT.lastOpened, "desc").map((r) => r.person.name),
		["New", "Old", "Never"],
	);
});
