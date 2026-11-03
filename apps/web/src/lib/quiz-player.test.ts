import assert from "node:assert/strict";
import { test } from "node:test";
import {
	addClick,
	clock,
	fillBlank,
	freeTiles,
	isAnswered,
	quizMap,
	toggleChoice,
} from "./quiz-player.ts";

test("isAnswered ignores empty answers", () => {
	assert.equal(isAnswered(undefined), false);
	assert.equal(isAnswered([]), false);
	assert.equal(isAnswered({ "1": " " }), false);
	assert.equal(isAnswered(["a"]), true);
	assert.equal(isAnswered({ "1": "x" }), true);
	assert.equal(isAnswered([{ x: 0.1, y: 0.2 }]), true);
});

test("quizMap counts answered, unanswered and not sure", () => {
	const map = quizMap(
		["q1", "q2", "q3"],
		{ q1: ["a"], q2: [] },
		new Set(["q2", "q3"]),
	);
	assert.deepEqual(map.counts, {
		all: 3,
		answered: 1,
		unanswered: 2,
		unsure: 2,
	});
	assert.deepEqual(
		map.pick("unanswered").map((i) => i.index),
		[1, 2],
	);
});

test("clock shows minutes and seconds, hours only when needed", () => {
	assert.equal(clock(295_000), "04:55");
	assert.equal(clock(3_725_000), "01:02:05");
	assert.equal(clock(-5), "00:00");
	assert.equal(clock(400), "00:01");
});

test("freeTiles removes one tile per placed word, even with duplicates", () => {
	assert.deepEqual(freeTiles(["a", "b", "a"], { "1": "a" }), [
		{ word: "b", index: 1 },
		{ word: "a", index: 2 },
	]);
});

test("fillBlank places, replaces and clears", () => {
	assert.deepEqual(fillBlank({}, "1", "x"), { "1": "x" });
	assert.deepEqual(fillBlank({ "1": "x" }, "1", "y"), { "1": "y" });
	assert.deepEqual(fillBlank({ "1": "x", "2": "z" }, "1", ""), { "2": "z" });
});

test("toggleChoice replaces with one pick and adds with several", () => {
	assert.deepEqual(toggleChoice(["a"], "b", 1), ["b"]);
	assert.deepEqual(toggleChoice(["a"], "b", 2), ["a", "b"]);
	assert.deepEqual(toggleChoice(["a", "b"], "a", 2), ["b"]);
});

test("addClick stops at the number of places to click", () => {
	const one = addClick([], { x: 0.1, y: 0.1 }, 1);
	assert.equal(one.length, 1);
	assert.equal(addClick(one, { x: 0.5, y: 0.5 }, 1), one);
});
