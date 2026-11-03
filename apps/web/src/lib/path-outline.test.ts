import assert from "node:assert/strict";
import { test } from "node:test";
import type { ContentItem, ContentKind } from "../graphql/library.ts";
import type { LearningPath, PathStep } from "../graphql/path.ts";
import { nextStep, pickable, stepTarget } from "./path-outline.ts";

const item = (
	id: string,
	kind: ContentKind = "course",
	extra: Partial<ContentItem> = {},
): ContentItem => ({
	id,
	kind,
	title: `Item ${id}`,
	description: null,
	status: "published",
	isTemplate: false,
	parentId: null,
	archivedAt: null,
	createdAt: "",
	updatedAt: "",
	author: null,
	isFavorite: false,
	viewedAt: null,
	tags: [],
	cover: null,
	...extra,
});

const step = (id: string, percent = 0, locked = false): PathStep => ({
	id,
	position: 0,
	content: item(`c-${id}`),
	percent,
	locked,
});

const path = (...stages: PathStep[][]): Pick<LearningPath, "stages"> => ({
	stages: stages.map((steps, i) => ({
		id: `s${i + 1}`,
		title: `Stage ${i + 1}`,
		position: i,
		steps,
	})),
});

test("nextStep is the first open step not done, null when all are done", () => {
	assert.equal(nextStep(path([step("a", 100), step("b", 40)]))?.id, "b");
	assert.equal(nextStep(path([step("a", 100)], [step("b")]))?.id, "b");
	assert.equal(nextStep(path([step("a", 100)], [step("b", 100)])), null);
	assert.equal(nextStep(path([step("a", 0, true)])), null);
	assert.equal(nextStep(path()), null);
});

test("stepTarget moves within a stage and across stage edges", () => {
	const p = path([step("a"), step("b")], [], [step("c")]);
	assert.deepEqual(stepTarget(p, "a", 1), { stageId: "s1", position: 1 });
	assert.deepEqual(stepTarget(p, "b", -1), { stageId: "s1", position: 0 });
	// down from the last step: to the start of the next stage, even an empty one
	assert.deepEqual(stepTarget(p, "b", 1), { stageId: "s2", position: 0 });
	// up from the first step: to the end of the previous stage
	assert.deepEqual(stepTarget(p, "c", -1), { stageId: "s2", position: 0 });
	assert.equal(stepTarget(p, "a", -1), null);
	assert.equal(stepTarget(p, "c", 1), null);
	assert.equal(stepTarget(p, "nope", 1), null);
});

test("pickable hides what's in the path, folders, paths, templates and archived items", () => {
	const p = path([step("a")]);
	const items = [
		item("c-a"),
		item("f", "folder"),
		item("p", "path"),
		item("t", "page", { isTemplate: true }),
		item("x", "quiz", { archivedAt: "2026-01-01" }),
		item("ok1", "page", { title: "Safety handbook" }),
		item("ok2", "quiz"),
		item("ok3", "wiki"),
		item("ok4", "assignment"),
	];
	assert.deepEqual(
		pickable(items, p, "all", "").map((i) => i.id),
		["ok1", "ok2", "ok3", "ok4"],
	);
	assert.deepEqual(
		pickable(items, p, "quiz", "").map((i) => i.id),
		["ok2"],
	);
	assert.deepEqual(
		pickable(items, p, "all", " SAFETY ").map((i) => i.id),
		["ok1"],
	);
});
