import assert from "node:assert/strict";
import { test } from "node:test";
import type { Course, Lesson } from "../graphql/course.ts";
import {
	allLessons,
	clock,
	dropPosition,
	lessonPlace,
	neighbor,
	resumeLesson,
	searchOutline,
	stepTarget,
} from "./course-outline.ts";
import { partRange, percent, retryable } from "./video-upload.ts";

const lesson = (id: string, sectionId: string, completed = false): Lesson => ({
	id,
	courseId: "c",
	sectionId,
	kind: "page",
	title: `Lesson ${id}`,
	position: 0,
	completed,
	positionSeconds: 0,
	video: null,
	quizId: null,
	locked: false,
});

const course = (done: string[] = []): Pick<Course, "sections"> => ({
	sections: [
		{
			id: "s1",
			title: "Basics",
			position: 0,
			lessons: ["a", "b"].map((id) => lesson(id, "s1", done.includes(id))),
		},
		{ id: "s2", title: "Empty", position: 1, lessons: [] },
		{
			id: "s3",
			title: "Advanced",
			position: 2,
			lessons: [lesson("c", "s3", done.includes("c"))],
		},
	],
});

test("lessons run across sections in order", () => {
	assert.deepEqual(
		allLessons(course()).map((l) => l.id),
		["a", "b", "c"],
	);
});

test("next and previous skip empty sections and stop at the ends", () => {
	assert.equal(neighbor(course(), "b")?.id, "c");
	assert.equal(neighbor(course(), "c"), null);
	assert.equal(neighbor(course(), "c", -1)?.id, "b");
	assert.equal(neighbor(course(), "a", -1), null);
	assert.equal(neighbor(course(), "missing"), null);
});

test("continue goes to the first lesson not done, or the first when all are", () => {
	assert.equal(resumeLesson(course())?.id, "a");
	assert.equal(resumeLesson(course(["a"]))?.id, "b");
	assert.equal(resumeLesson(course(["a", "b", "c"]))?.id, "a");
	assert.equal(resumeLesson({ sections: [] }), null);
});

test("a lesson's place counts within its section", () => {
	assert.deepEqual(lessonPlace(course(), "c"), {
		section: 3,
		sectionTitle: "Advanced",
		lesson: 1,
		of: 1,
	});
	assert.equal(lessonPlace(course(), "nope"), null);
});

test("search keeps matching lessons, whole matching sections, drops the rest", () => {
	const c = course();
	assert.equal(searchOutline(c, "  "), c.sections);
	assert.deepEqual(
		searchOutline(c, "lesson b").map((s) => [s.id, s.lessons.map((l) => l.id)]),
		[["s1", ["b"]]],
	);
	assert.deepEqual(
		searchOutline(c, "ADVANCED").map((s) => s.id),
		["s3"],
	);
});

test("drop position counts without the moving lesson", () => {
	const ids = ["a", "b", "c", "d"];
	assert.equal(dropPosition(ids, "a", "c"), 1);
	assert.equal(dropPosition(ids, "d", "a"), 0);
	assert.equal(dropPosition(ids, "b", null), 3);
	assert.equal(dropPosition(["x"], "z", null), 1);
	assert.equal(dropPosition(ids, "a", "gone"), 3);
});

test("move up and down cross into neighboring sections", () => {
	const c = course();
	assert.deepEqual(stepTarget(c, "a", 1), { sectionId: "s1", position: 1 });
	assert.deepEqual(stepTarget(c, "b", -1), { sectionId: "s1", position: 0 });
	assert.deepEqual(stepTarget(c, "b", 1), { sectionId: "s2", position: 0 });
	assert.deepEqual(stepTarget(c, "c", -1), { sectionId: "s2", position: 0 });
	assert.equal(stepTarget(c, "a", -1), null);
	assert.equal(stepTarget(c, "c", 1), null);
});

test("clock formats durations", () => {
	assert.equal(clock(0), "0:00");
	assert.equal(clock(75), "1:15");
	assert.equal(clock(3725), "1:02:05");
});

test("parts cover the file exactly, the last one smaller", () => {
	const size = 20;
	const ranges = [1, 2, 3].map((n) => partRange(size, 8, n));
	assert.deepEqual(ranges, [
		[0, 8],
		[8, 16],
		[16, 20],
	]);
});

test("percent reaches 100 only when everything is sent", () => {
	assert.equal(percent(0, 0), 0);
	assert.equal(percent(999, 1000), 99);
	assert.equal(percent(1000, 1000), 100);
	assert.equal(percent(250, 1000), 25);
});

test("only failures that may pass on a new try are retried", () => {
	assert.equal(retryable(null), true);
	assert.equal(retryable(503), true);
	assert.equal(retryable(429), true);
	assert.equal(retryable(413), false);
	assert.equal(retryable(403), false);
});
