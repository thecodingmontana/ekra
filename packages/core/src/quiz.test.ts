import assert from "node:assert/strict";
import { test } from "node:test";
import {
	isCorrect,
	publicQuestion,
	type QuestionPayload,
	questionPayload,
	questionProblem,
	seededShuffle,
} from "./quiz.ts";

const choice: QuestionPayload = {
	kind: "multiple_choice",
	options: [
		{ id: "a", text: "User Interface" },
		{ id: "b", text: "Unique Idea" },
		{ id: "c", text: "Universal Index" },
	],
	correct: ["a"],
};
const pickAll: QuestionPayload = { ...choice, correct: ["a", "c"] };
const blanks: QuestionPayload = {
	kind: "fill_blank",
	text: "To align text left we use {{1}}; to center it, {{2}}.",
	blanks: [
		{ id: "1", answers: ["Align Left"] },
		{ id: "2", answers: ["Align Center", "Center"] },
	],
	distractors: ["Align Right", "Align Top"],
};
const hotspot: QuestionPayload = {
	kind: "hotspot",
	image: "/api/media/o/i/1280-webp",
	areas: [
		{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
		{ x: 0.6, y: 0.6, w: 0.2, h: 0.2 },
	],
};

test("multiple choice: exactly the right choices", () => {
	assert.equal(isCorrect(choice, ["a"]), true);
	assert.equal(isCorrect(choice, ["b"]), false);
	assert.equal(
		isCorrect(choice, ["a", "b"]),
		false,
		"an extra choice is wrong",
	);
	assert.equal(isCorrect(pickAll, ["c", "a"]), true, "order doesn't matter");
	assert.equal(isCorrect(pickAll, ["a"]), false, "missing one is wrong");
	assert.equal(isCorrect(choice, []), false);
});

test("fill in the blank: every blank, case and spaces don't matter", () => {
	assert.equal(isCorrect(blanks, { 1: "align  left", 2: "CENTER" }), true);
	assert.equal(isCorrect(blanks, { 1: "Align Left", 2: "Align Right" }), false);
	assert.equal(
		isCorrect(blanks, { 1: "Align Left" }),
		false,
		"a blank left empty",
	);
	assert.equal(isCorrect(blanks, ["Align Left"]), false, "the wrong shape");
});

test("hotspot: one click in each place, none elsewhere", () => {
	const hit = [
		{ x: 0.2, y: 0.2 },
		{ x: 0.7, y: 0.65 },
	];
	assert.equal(isCorrect(hotspot, hit), true);
	assert.equal(isCorrect(hotspot, [{ x: 0.2, y: 0.2 }]), false, "one missing");
	assert.equal(
		isCorrect(hotspot, [
			{ x: 0.2, y: 0.2 },
			{ x: 0.5, y: 0.5 },
		]),
		false,
		"one outside",
	);
	assert.equal(
		isCorrect(hotspot, [
			{ x: 0.2, y: 0.2 },
			{ x: 0.21, y: 0.2 },
		]),
		false,
		"both in the same place",
	);
	assert.equal(isCorrect(hotspot, "nonsense"), false);
});

test("a question that can't be answered is refused", () => {
	const problem = (p: unknown) => {
		const parsed = questionPayload.safeParse(p);
		return parsed.success ? questionProblem(parsed.data) : "invalid";
	};
	assert.equal(problem(choice), null);
	assert.equal(problem(blanks), null);
	assert.equal(problem(hotspot), null);
	assert.match(problem({ ...choice, correct: ["z"] }) ?? "", /isn't one of/);
	assert.equal(problem({ ...choice, options: [choice.options[0]] }), "invalid");
	assert.match(
		problem({ ...blanks, text: "Only {{1}} here." }) ?? "",
		/Every blank/,
	);
	assert.equal(
		problem({ ...hotspot, areas: [{ x: 0.9, y: 0, w: 0.5, h: 0.1 }] }),
		"invalid",
		"an area off the picture",
	);
});

test("learners never get the right answers", () => {
	const shown = JSON.stringify([
		publicQuestion("q1", choice),
		publicQuestion("q2", blanks),
		publicQuestion("q3", hotspot),
	]);
	assert.doesNotMatch(shown, /correct|answers|areas/);
	const tiles = publicQuestion("q2", blanks);
	assert.ok("tiles" in tiles);
	assert.deepEqual(
		[...(tiles.tiles ?? [])].sort(),
		["Align Center", "Align Left", "Align Right", "Align Top"],
		"the right words and the distractors, as tiles",
	);
	assert.deepEqual(
		publicQuestion("q2", blanks),
		publicQuestion("q2", blanks),
		"same order every time",
	);
});

test("seededShuffle keeps every item and depends only on the seed", () => {
	const list = [1, 2, 3, 4, 5, 6, 7, 8];
	assert.deepEqual([...seededShuffle(list, "x")].sort(), list);
	assert.deepEqual(seededShuffle(list, "x"), seededShuffle(list, "x"));
	assert.notDeepEqual(seededShuffle(list, "x"), seededShuffle(list, "y"));
});
