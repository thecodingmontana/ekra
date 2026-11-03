import assert from "node:assert/strict";
import { test } from "node:test";
import type { QuestionPayload } from "./quiz.ts";
import {
	answerResult,
	bestAttempt,
	questionStats,
	type ReportAttempt,
} from "./report.ts";

const mc: QuestionPayload = {
	kind: "multiple_choice",
	options: [
		{ id: "a", text: "Yes" },
		{ id: "b", text: "No" },
	],
	correct: ["a"],
};
const blank: QuestionPayload = {
	kind: "fill_blank",
	text: "Say {{1}}",
	blanks: [{ id: "1", answers: ["hi"] }],
	distractors: [],
};
const questions = [
	{ id: "q1", payload: mc },
	{ id: "q2", payload: blank },
];
const attempt = (over: Partial<ReportAttempt>): ReportAttempt => ({
	userId: "u",
	questionIds: ["q1", "q2"],
	answers: {},
	submittedAt: "2026-11-01T10:00:00Z",
	score: 0,
	maxScore: 2,
	passed: false,
	...over,
});

test("the best attempt is the highest graded share, a pass breaking ties", () => {
	const open = attempt({ submittedAt: null, score: null });
	const one = attempt({ score: 1 });
	const onePassed = attempt({ score: 1, passed: true });
	const zero = attempt({ score: 0 });
	assert.equal(bestAttempt([open]), null, "nothing handed in");
	assert.equal(bestAttempt([zero, one, open]), one);
	assert.equal(bestAttempt([one, onePassed]), onePassed);
});

test("an answer is right, wrong, or null when not asked or not answered", () => {
	const a = attempt({ questionIds: ["q1"], answers: { q1: ["b"] } });
	assert.equal(answerResult(questions[0] as never, a), false);
	assert.equal(answerResult(questions[1] as never, a), null, "not asked");
	const b = attempt({ answers: { q1: ["a"] } });
	assert.equal(answerResult(questions[0] as never, b), true);
	assert.equal(answerResult(questions[1] as never, b), null, "not answered");
});

test("question stats count handed-in answers and each choice picked", () => {
	const stats = questionStats(questions, [
		attempt({ answers: { q1: ["a"], q2: { 1: "Hi " } } }),
		attempt({ answers: { q1: ["b"] } }),
		attempt({ submittedAt: null, score: null, answers: { q1: ["b"] } }),
	]);
	assert.deepEqual(stats, [
		{
			id: "q1",
			answered: 2,
			correct: 1,
			choices: [
				{ label: "Yes", right: true, picked: 1 },
				{ label: "No", right: false, picked: 1 },
			],
		},
		{ id: "q2", answered: 1, correct: 1, choices: [] },
	]);
});
