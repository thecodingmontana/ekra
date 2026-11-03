import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
	lessonProgress,
	member,
	organization,
	quizAttempt,
	user,
} from "@ekra/db";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db.ts";
import { call, cookieFrom, linkInLatestEmail, post } from "../test-helpers.ts";

const stamp = Date.now();
const emailOf = (name: string) => `quiz-${name}-${stamp}@test.ekra`;
const slugs = { amina: `quiz-amina-${stamp}`, brian: `quiz-brian-${stamp}` };
const cookies: Record<string, string> = {};

type Result = {
	data?: Record<string, unknown> | null;
	errors?: { message: string; extensions?: { code?: string } }[];
};
async function gql(who: string, query: string, variables: object) {
	const res = await post("/api/graphql", { query, variables }, cookies[who]);
	return (await res.json()) as Result;
}
const code = (r: Result) => r.errors?.[0]?.extensions?.code;
function data<T>(r: Result): T {
	assert.ok(!r.errors, JSON.stringify(r.errors));
	return r.data?.r as T;
}

before(async () => {
	for (const name of ["amina", "brian", "carol", "dan"]) {
		await post("/api/auth/sign-in/magic-link", {
			email: emailOf(name),
			callbackURL: "/",
		});
		cookies[name] = cookieFrom(await call(linkInLatestEmail(emailOf(name))));
	}
	for (const name of ["amina", "brian"] as const)
		await post(
			"/api/auth/organization/create",
			{ name: `${name}'s school`, slug: slugs[name] },
			cookies[name],
		);
	const [org] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, slugs.amina));
	// Carol and Dan learn in Amina's organization
	for (const name of ["carol", "dan"]) {
		const [u] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, emailOf(name)));
		await db.insert(member).values({
			organizationId: org?.id ?? "",
			userId: u?.id ?? "",
			role: "learner",
		});
	}
});

after(async () => {
	await db
		.delete(organization)
		.where(inArray(organization.slug, Object.values(slugs)));
	await db.delete(user).where(
		inArray(
			user.email,
			["amina", "brian", "carol", "dan"].map((n) => emailOf(n)),
		),
	);
});

const S = slugs.amina;
const PICTURE = "/api/media/AAAAAAAAAAAAAAAA/BBBBBBBBBBBBBBBB/1280-webp";
const QUESTIONS = [
	{
		kind: "multiple_choice",
		prompt: "What does UI stand for?",
		payload: {
			options: [
				{ id: "a", text: "User Interface" },
				{ id: "b", text: "Unique Idea" },
			],
			correct: ["a"],
		},
		points: 2,
	},
	{
		kind: "fill_blank",
		prompt: "Fill the blank",
		payload: {
			text: "Align text left with {{1}}.",
			blanks: [{ id: "1", answers: ["Align Left"] }],
			distractors: ["Align Right"],
		},
	},
	{
		kind: "hotspot",
		prompt: "Click the button",
		payload: { image: PICTURE, areas: [{ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }] },
		required: false,
	},
];
const RIGHT: Record<string, unknown> = {
	multiple_choice: ["a"],
	fill_blank: { 1: "align left" },
	hotspot: [{ x: 0.5, y: 0.5 }],
};

async function newQuiz(title: string, settings: object) {
	const made = await gql(
		"amina",
		`mutation ($slug: String!) { r: createContent(slug: $slug, input: { kind: quiz, title: "${title}" }) { id } }`,
		{ slug: S },
	);
	const id = data<{ id: string }>(made).id;
	data(
		await gql(
			"amina",
			`mutation ($slug: String!, $id: ID!, $input: QuizSettingsInput!) { r: updateQuizSettings(slug: $slug, id: $id, input: $input) { id } }`,
			{ slug: S, id, input: settings },
		),
	);
	for (const q of QUESTIONS)
		data(
			await gql(
				"amina",
				`mutation ($slug: String!, $quizId: ID!, $input: QuestionInput!) { r: addQuestion(slug: $slug, quizId: $quizId, input: $input) { id } }`,
				{
					slug: S,
					quizId: id,
					input: { ...q, payload: JSON.stringify(q.payload) },
				},
			),
		);
	await gql(
		"amina",
		`mutation ($slug: String!, $id: ID!) { r: updateContent(slug: $slug, id: $id, input: { status: published }) { id } }`,
		{ slug: S, id },
	);
	return id;
}

type Attempt = {
	id: string;
	questions: { id: string; kind: string; data: string }[];
	result: {
		score: number;
		maxScore: number;
		passed: boolean | null;
		message: string | null;
		review: { correct: boolean; correctAnswer: string | null }[];
	} | null;
};
const ATTEMPT_FIELDS =
	"id questions { id kind data } result { score maxScore passed message review { correct correctAnswer } }";
const start = (who: string, quizId: string, slug = S) =>
	gql(
		who,
		`mutation ($slug: String!, $quizId: ID!) { r: startQuizAttempt(slug: $slug, quizId: $quizId) { ${ATTEMPT_FIELDS} } }`,
		{ slug, quizId },
	);
const answer = (
	who: string,
	attemptId: string,
	questionId: string,
	a: unknown,
) =>
	gql(
		who,
		`mutation ($slug: String!, $a: ID!, $q: ID!, $answer: String!) { r: saveQuizAnswer(slug: $slug, attemptId: $a, questionId: $q, answer: $answer) { saved correct } }`,
		{ slug: S, a: attemptId, q: questionId, answer: JSON.stringify(a) },
	);
const submit = (who: string, attemptId: string) =>
	gql(
		who,
		`mutation ($slug: String!, $a: ID!) { r: submitQuizAttempt(slug: $slug, attemptId: $a) { ${ATTEMPT_FIELDS} } }`,
		{ slug: S, a: attemptId },
	);

test("a trainer builds a quiz; a question that can't be answered is refused", async () => {
	const id = await newQuiz("Basics", { passPercent: 60 });
	const add = (input: object) =>
		gql(
			"amina",
			`mutation ($slug: String!, $quizId: ID!, $input: QuestionInput!) { r: addQuestion(slug: $slug, quizId: $quizId, input: $input) { id } }`,
			{ slug: S, quizId: id, input },
		);
	const bad = await add({
		kind: "multiple_choice",
		prompt: "?",
		payload: JSON.stringify({
			options: [
				{ id: "a", text: "x" },
				{ id: "b", text: "y" },
			],
			correct: ["z"],
		}),
	});
	assert.equal(code(bad), "BAD_USER_INPUT");
	const outside = await add({
		kind: "hotspot",
		prompt: "?",
		payload: JSON.stringify({
			image: "https://tracker.example/a.png",
			areas: [{ x: 0, y: 0, w: 0.1, h: 0.1 }],
		}),
	});
	assert.equal(code(outside), "BAD_USER_INPUT");
	const editor = data<{ questions: { kind: string; payload: string }[] }>(
		await gql(
			"amina",
			"query ($slug: String!, $id: ID!) { r: quizEditor(slug: $slug, id: $id) { questions { kind payload } } }",
			{ slug: S, id },
		),
	);
	assert.deepEqual(
		editor.questions.map((q) => q.kind),
		["multiple_choice", "fill_blank", "hotspot"],
	);
	assert.match(
		editor.questions[0]?.payload ?? "",
		/"correct"/,
		"trainers see the answers",
	);
	assert.equal(
		code(
			await gql(
				"carol",
				"query ($slug: String!, $id: ID!) { r: quizEditor(slug: $slug, id: $id) { id } }",
				{ slug: S, id },
			),
		),
		"FORBIDDEN",
		"learners don't",
	);
});

test("a learner takes the quiz: no answers sent, graded on hand-in, attempts limited", async () => {
	const id = await newQuiz("Graded", {
		passPercent: 60,
		maxAttempts: 2,
		passMessage: "Well done",
	});
	const attempt = data<Attempt>(await start("carol", id));
	assert.doesNotMatch(
		JSON.stringify(attempt.questions),
		/correct|\\"answers\\"|areas/,
		"the right answers never reach the learner",
	);
	assert.equal(
		data<Attempt>(await start("carol", id)).id,
		attempt.id,
		"an open attempt resumes",
	);

	// required question (fill in the blank) left empty: can't hand in yet
	const byKind = Object.fromEntries(
		attempt.questions.map((q) => [q.kind, q.id]),
	);
	await answer(
		"carol",
		attempt.id,
		byKind.multiple_choice ?? "",
		RIGHT.multiple_choice,
	);
	assert.equal(code(await submit("carol", attempt.id)), "BAD_USER_INPUT");
	await answer("carol", attempt.id, byKind.fill_blank ?? "", {
		1: "Align Right",
	});
	const done = data<Attempt>(await submit("carol", attempt.id));
	assert.deepEqual(
		[done.result?.score, done.result?.maxScore, done.result?.passed],
		[2, 4, false],
		"2 of 4 points is under 60%",
	);
	assert.ok(
		done.result?.review.every((r) => r.correctAnswer),
		"answers shown at the end",
	);
	assert.equal(
		code(
			await answer("carol", attempt.id, byKind.fill_blank ?? "", { 1: "x" }),
		),
		"FORBIDDEN",
		"handed in",
	);

	const second = data<Attempt>(await start("carol", id));
	for (const q of second.questions)
		await answer("carol", second.id, q.id, RIGHT[q.kind]);
	const passed = data<Attempt>(await submit("carol", second.id));
	assert.deepEqual(
		[passed.result?.score, passed.result?.passed, passed.result?.message],
		[4, true, "Well done"],
	);
	assert.equal(
		code(await start("carol", id)),
		"FORBIDDEN",
		"two attempts used",
	);

	// someone else's attempt can't be read or answered
	assert.equal(
		(
			await gql(
				"dan",
				"query ($slug: String!, $id: ID!) { r: quizAttempt(slug: $slug, id: $id) { id } }",
				{ slug: S, id: second.id },
			)
		).data?.r,
		null,
	);
	assert.equal(
		code(await answer("dan", second.id, byKind.fill_blank ?? "", { 1: "x" })),
		"NOT_FOUND",
	);
	// nor anyone in another organization
	assert.equal(code(await start("brian", id, slugs.brian)), "NOT_FOUND");
	assert.equal(code(await start("brian", id)), "FORBIDDEN");
});

test("answers shown after each question: told at once, and locked", async () => {
	const id = await newQuiz("Instant", { showAnswers: "after_each" });
	const attempt = data<Attempt>(await start("dan", id));
	const q = attempt.questions.find((x) => x.kind === "multiple_choice");
	const checked = data<{ correct: boolean }>(
		await answer("dan", attempt.id, q?.id ?? "", ["b"]),
	);
	assert.equal(checked.correct, false);
	assert.equal(
		code(await answer("dan", attempt.id, q?.id ?? "", ["a"])),
		"FORBIDDEN",
	);
});

test("when time runs out, answers stop and handing in still works", async () => {
	const id = await newQuiz("Timed", { timeLimitSeconds: 60 });
	const attempt = data<Attempt>(await start("dan", id));
	await db
		.update(quizAttempt)
		.set({ deadline: new Date(Date.now() - 60_000) })
		.where(eq(quizAttempt.id, attempt.id));
	assert.equal(
		code(
			await answer("dan", attempt.id, attempt.questions[0]?.id ?? "", ["a"]),
		),
		"FORBIDDEN",
	);
	const done = data<Attempt>(await submit("dan", attempt.id));
	assert.equal(done.result?.score, 0, "handed in with nothing answered");
});

test("a timed-out attempt is graded with the answers saved so far, and completes its lesson", async () => {
	const id = await newQuiz("Late", {
		timeLimitSeconds: 60,
		maxAttempts: 1,
		passPercent: 50,
	});
	const course = data<{ id: string }>(
		await gql(
			"amina",
			`mutation ($slug: String!) { r: createContent(slug: $slug, input: { kind: course, title: "Late course" }) { id } }`,
			{ slug: S },
		),
	).id;
	const section = data<{ id: string }>(
		await gql(
			"amina",
			`mutation ($slug: String!, $c: ID!) { r: addSection(slug: $slug, courseId: $c, title: "Only") { id } }`,
			{ slug: S, c: course },
		),
	).id;
	const lessonId = data<{ id: string }>(
		await gql(
			"amina",
			`mutation ($slug: String!, $s: ID!, $q: ID!) { r: addLesson(slug: $slug, sectionId: $s, kind: quiz, title: "Check", quizId: $q) { id } }`,
			{ slug: S, s: section, q: id },
		),
	).id;
	const attempt = data<Attempt>(await start("carol", id));
	const mc = attempt.questions.find((q) => q.kind === "multiple_choice");
	// the required fill-in-the-blank stays empty: it doesn't matter after the deadline
	await answer("carol", attempt.id, mc?.id ?? "", RIGHT.multiple_choice);
	await db
		.update(quizAttempt)
		.set({ deadline: new Date(Date.now() - 120_000) })
		.where(eq(quizAttempt.id, attempt.id));

	const overview = data<{
		attempts: { score: number | null; passed: boolean | null }[];
		attemptsLeft: number;
		openAttemptId: string | null;
	}>(
		await gql(
			"carol",
			"query ($slug: String!, $id: ID!) { r: quizOverview(slug: $slug, id: $id) { attempts { score passed } attemptsLeft openAttemptId } }",
			{ slug: S, id },
		),
	);
	assert.deepEqual(overview.attempts, [{ score: 2, passed: true }]);
	assert.equal(overview.attemptsLeft, 0);
	assert.equal(overview.openAttemptId, null);
	const [done] = await db
		.select({ completedAt: lessonProgress.completedAt })
		.from(lessonProgress)
		.where(eq(lessonProgress.lessonId, lessonId));
	assert.ok(done?.completedAt, "passing late still completes the lesson");
	assert.equal(code(await start("carol", id)), "FORBIDDEN");
});

test("a timed-out attempt shows in your learning as handed in, without opening the quiz again", async () => {
	const id = await newQuiz("Late on Home", {
		timeLimitSeconds: 60,
		passPercent: 50,
	});
	const attempt = data<Attempt>(await start("carol", id));
	const mc = attempt.questions.find((q) => q.kind === "multiple_choice");
	await answer("carol", attempt.id, mc?.id ?? "", RIGHT.multiple_choice);
	await db
		.update(quizAttempt)
		.set({ deadline: new Date(Date.now() - 120_000) })
		.where(eq(quizAttempt.id, attempt.id));

	const mine = data<{ status: string; content: { id: string } }[]>(
		await gql(
			"carol",
			"query ($slug: String!) { r: myLearning(slug: $slug) { status content { id } } }",
			{ slug: S },
		),
	);
	assert.equal(mine.find((m) => m.content.id === id)?.status, "completed");
});
