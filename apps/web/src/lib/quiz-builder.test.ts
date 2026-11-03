import assert from "node:assert/strict";
import { test } from "node:test";
import {
	areaBetween,
	draftProblem,
	makeBlank,
	nextBlankId,
	removeBlank,
	sentenceParts,
	starterPayload,
	toFraction,
	withText,
} from "./quiz-builder.ts";

test("sentenceParts splits words and blanks in order", () => {
	assert.deepEqual(sentenceParts("Use {{1}} and {{2}}."), [
		{ text: "Use " },
		{ blank: "1" },
		{ text: " and " },
		{ blank: "2" },
		{ text: "." },
	]);
	assert.deepEqual(sentenceParts("{{3}}"), [{ blank: "3" }]);
});

test("nextBlankId takes the lowest free number", () => {
	assert.equal(nextBlankId([]), "1");
	assert.equal(
		nextBlankId([
			{ id: "1", answers: ["a"] },
			{ id: "3", answers: ["b"] },
		]),
		"2",
	);
});

test("makeBlank turns the selected word into a blank answered by it", () => {
	const v = { text: "The sky is blue.", blanks: [], distractors: [] };
	const out = makeBlank(v, 11, 15);
	assert.deepEqual(out, {
		text: "The sky is {{1}}.",
		blanks: [{ id: "1", answers: ["blue"] }],
		distractors: [],
	});
});

test("makeBlank keeps the spaces around a sloppy selection", () => {
	const v = { text: "The sky is blue.", blanks: [], distractors: [] };
	assert.equal(makeBlank(v, 3, 8)?.text, "The {{1}} is blue.");
});

test("makeBlank with nothing selected inserts an empty blank", () => {
	const v = { text: "Hello ", blanks: [], distractors: [] };
	assert.deepEqual(makeBlank(v, 6, 6), {
		text: "Hello {{1}}",
		blanks: [{ id: "1", answers: [] }],
		distractors: [],
	});
});

test("makeBlank refuses selections touching a blank", () => {
	const v = {
		text: "A {{1}} b",
		blanks: [{ id: "1", answers: ["x"] }],
		distractors: [],
	};
	assert.equal(makeBlank(v, 2, 7), null);
	assert.equal(makeBlank(v, 4, 4), null);
});

test("removeBlank puts the answer back", () => {
	const v = {
		text: "The sky is {{1}}.",
		blanks: [{ id: "1", answers: ["blue", "azure"] }],
		distractors: [],
	};
	assert.deepEqual(removeBlank(v, "1"), {
		text: "The sky is blue.",
		blanks: [],
		distractors: [],
	});
});

test("draftProblem explains what's missing and accepts starters", () => {
	for (const kind of ["multiple_choice", "fill_blank"] as const)
		assert.equal(draftProblem(kind, starterPayload(kind)), null);
	assert.equal(
		draftProblem("multiple_choice", {
			options: [
				{ id: "a", text: "x" },
				{ id: "b", text: "y" },
			],
			correct: [],
		}),
		"Mark the right answer.",
	);
	assert.equal(
		draftProblem("fill_blank", {
			text: "A {{1}}",
			blanks: [{ id: "1", answers: [] }],
			distractors: [],
		}),
		"Give every blank its right answer.",
	);
	assert.equal(
		draftProblem("hotspot", { image: "/api/media/o/i/1280-webp", areas: [] }),
		"Mark where to click.",
	);
});

test("toFraction and areaBetween map a drag to a box on the picture", () => {
	const box = { left: 100, top: 50, width: 200, height: 100 };
	assert.deepEqual(toFraction(200, 100, box), { x: 0.5, y: 0.5 });
	assert.deepEqual(toFraction(0, 500, box), { x: 0, y: 1 });
	assert.deepEqual(areaBetween({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 }), {
		x: 0.2,
		y: 0.1,
		w: 0.4,
		h: 0.4,
	});
	assert.equal(areaBetween({ x: 0.2, y: 0.2 }, { x: 0.205, y: 0.5 }), null);
});

test("withText drops blanks deleted from the sentence", () => {
	const v = {
		text: "A {{1}} and {{2}}",
		blanks: [
			{ id: "1", answers: ["x"] },
			{ id: "2", answers: ["y"] },
		],
		distractors: [],
	};
	assert.deepEqual(withText(v, "A {{1}} and").blanks, [
		{ id: "1", answers: ["x"] },
	]);
});
