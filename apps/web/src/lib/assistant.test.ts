import assert from "node:assert/strict";
import { test } from "node:test";
import {
	APPROVAL_TOOLS,
	assistantThread,
	describeChange,
	namesFrom,
	stepLabel,
} from "./assistant.ts";

test("only the tools that change something wait for approval", () => {
	assert.deepEqual(APPROVAL_TOOLS.map((t) => t.name).sort(), [
		"assignContent",
		"createContent",
		"markDone",
		"unassignContent",
	]);
	assert.ok(APPROVAL_TOOLS.every((t) => t.needsApproval));
});

test("an approval card names what it's about, from earlier tool results", () => {
	const names = namesFrom([
		{ library: { items: [{ id: "c1", title: "Fire safety" }] } },
		JSON.stringify({ members: [{ id: "u1", name: "Amina" }] }),
	]);
	const change = describeChange(
		"assignContent",
		{ contentId: "c1", userIds: ["u1", "u2"], dueAt: "2026-12-01T00:00:00Z" },
		names,
	);
	assert.equal(change.title, "Assign “Fire safety” to 2 people?");
	assert.deepEqual(change.lines.slice(0, 3), ["Amina", "u2", "Due 2026-12-01"]);
	assert.equal(
		describeChange("markDone", { contentId: "c1", done: false }, names).title,
		"Mark “Fire safety” as not done?",
	);
});

test("steps read as work in progress, then done; the thread id is per person per organization", () => {
	assert.equal(
		stepLabel("learnerReport", false),
		"Reading the learners report",
	);
	assert.equal(stepLabel("learnerReport", true), "Read the learners report");
	assert.equal(stepLabel("somethingNew", true), "somethingNew");
	assert.equal(assistantThread("org", "me"), "org-me");
});
