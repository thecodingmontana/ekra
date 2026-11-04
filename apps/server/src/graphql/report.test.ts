import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { member, organization, user } from "@ekra/db";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db.ts";
import { call, cookieFrom, linkInLatestEmail, post } from "../test-helpers.ts";

const stamp = Date.now();
const NAMES = ["amina", "brian", "carol", "dave"];
const emailOf = (name: string) => `report-${name}-${stamp}@test.ekra`;
const slugs = {
	amina: `report-amina-${stamp}`,
	brian: `report-brian-${stamp}`,
};
const cookies: Record<string, string> = {};
const ids: Record<string, string> = {};

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
	for (const name of NAMES) {
		await post("/api/auth/sign-in/magic-link", {
			email: emailOf(name),
			callbackURL: "/",
		});
		cookies[name] = cookieFrom(await call(linkInLatestEmail(emailOf(name))));
		const [u] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, emailOf(name)));
		ids[name] = u?.id ?? "";
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
	await db.insert(member).values(
		["carol", "dave"].map((n) => ({
			organizationId: org?.id ?? "",
			userId: ids[n] ?? "",
			role: "learner",
		})),
	);
});

after(async () => {
	await db
		.delete(organization)
		.where(inArray(organization.slug, Object.values(slugs)));
	await db.delete(user).where(inArray(user.email, NAMES.map(emailOf)));
});

const S = slugs.amina;
const make = async (kind: string, title: string, who = "amina", slug = S) => {
	const id = data<{ id: string }>(
		await gql(
			who,
			`mutation ($slug: String!) { r: createContent(slug: $slug, input: { kind: ${kind}, title: "${title}" }) { id } }`,
			{ slug },
		),
	).id;
	return id;
};
const publish = async (id: string) =>
	data(
		await gql(
			"amina",
			`mutation ($slug: String!, $id: ID!) { r: updateContent(slug: $slug, id: $id, input: { status: published }) { id } }`,
			{ slug: S, id },
		),
	);
const enroll = async (contentId: string) =>
	data(
		await gql(
			"amina",
			`mutation ($slug: String!, $c: ID!, $u: [ID!]!) { r: enroll(slug: $slug, contentId: $c, userIds: $u) { id } }`,
			{ slug: S, c: contentId, u: [ids.carol, ids.dave] },
		),
	);
const addQuestion = async (quizId: string, input: object) =>
	data<{ id: string }>(
		await gql(
			"amina",
			`mutation ($slug: String!, $quizId: ID!, $input: QuestionInput!) { r: addQuestion(slug: $slug, quizId: $quizId, input: $input) { id } }`,
			{ slug: S, quizId, input },
		),
	).id;

/** A learner takes the quiz with these answers (question id → answer) and hands it in. */
async function take(who: string, quizId: string, answers: [string, unknown][]) {
	const attempt = data<{ id: string }>(
		await gql(
			who,
			`mutation ($slug: String!, $q: ID!) { r: startQuizAttempt(slug: $slug, quizId: $q) { id } }`,
			{ slug: S, q: quizId },
		),
	);
	for (const [q, a] of answers)
		data(
			await gql(
				who,
				`mutation ($slug: String!, $a: ID!, $q: ID!, $answer: String!) { r: saveQuizAnswer(slug: $slug, attemptId: $a, questionId: $q, answer: $answer) { saved } }`,
				{ slug: S, a: attempt.id, q, answer: JSON.stringify(a) },
			),
		);
	data(
		await gql(
			who,
			`mutation ($slug: String!, $a: ID!) { r: submitQuizAttempt(slug: $slug, attemptId: $a) { id } }`,
			{ slug: S, a: attempt.id },
		),
	);
}

const LEARNERS = `query ($slug: String!) { r: learnerReport(slug: $slug) {
	totalLearners weeklyActive { day count } mostActive { person { id } count }
	recent { at kind person { id } content { id kind } }
	learners { person { id name role } assigned completed overdue inProgress percent lastOpened { id } lastOpenedAt }
} }`;
const CONTENT = `query ($slug: String!, $kind: ContentKind!) { r: contentReport(slug: $slug, kind: $kind) {
	content { id title kind } status learners completed percent accuracy
} }`;
const QUIZ = `query ($slug: String!, $id: ID!) { r: quizReport(slug: $slug, id: $id) {
	content { id kind } questionCount accuracy completedPercent submissions averageSeconds
	questions { id position kind prompt points answered correct choices { label picked right } }
	learners { person { id } score maxScore passed attempts answers }
} }`;

let courseId = "";
let quizId = "";
let questionIds: string[] = [];

test("set up: a course and a quiz, carol finishes both, dave half the course and fails the quiz", async () => {
	courseId = await make("course", "Safety basics");
	const section = data<{ id: string }>(
		await gql(
			"amina",
			`mutation ($slug: String!, $c: ID!) { r: addSection(slug: $slug, courseId: $c, title: "Intro") { id } }`,
			{ slug: S, c: courseId },
		),
	).id;
	const lessons: string[] = [];
	for (const title of ["One", "Two"])
		lessons.push(
			data<{ id: string }>(
				await gql(
					"amina",
					`mutation ($slug: String!, $s: ID!, $t: String!) { r: addLesson(slug: $slug, sectionId: $s, kind: page, title: $t) { id } }`,
					{ slug: S, s: section, t: title },
				),
			).id,
		);
	await publish(courseId);

	quizId = await make("quiz", "Safety check");
	data(
		await gql(
			"amina",
			`mutation ($slug: String!, $id: ID!, $input: QuizSettingsInput!) { r: updateQuizSettings(slug: $slug, id: $id, input: $input) { id } }`,
			{ slug: S, id: quizId, input: { passPercent: 50 } },
		),
	);
	questionIds = [
		await addQuestion(quizId, {
			kind: "multiple_choice",
			prompt: "Wear a helmet?",
			payload: JSON.stringify({
				options: [
					{ id: "a", text: "Yes" },
					{ id: "b", text: "No" },
				],
				correct: ["a"],
			}),
		}),
		await addQuestion(quizId, {
			kind: "fill_blank",
			prompt: "Fill it in",
			points: 1,
			payload: JSON.stringify({
				text: "Safety {{1}}",
				blanks: [{ id: "1", answers: ["first"] }],
			}),
		}),
	];
	await publish(quizId);
	await enroll(courseId);
	await enroll(quizId);

	const complete = (who: string, lessonId: string) =>
		gql(
			who,
			`mutation ($slug: String!, $id: ID!) { r: completeLesson(slug: $slug, id: $id, complete: true) { id } }`,
			{ slug: S, id: lessonId },
		).then(data);
	for (const l of lessons) await complete("carol", l);
	await complete("dave", lessons[0] ?? "");
	data(
		await gql(
			"dave",
			`mutation ($slug: String!, $id: ID!) { r: viewContent(slug: $slug, id: $id) }`,
			{ slug: S, id: courseId },
		),
	);
	await take("carol", quizId, [
		[questionIds[0] ?? "", ["a"]],
		[questionIds[1] ?? "", { 1: "First" }],
	]);
	await take("dave", quizId, [
		[questionIds[0] ?? "", ["b"]],
		[questionIds[1] ?? "", { 1: "last" }],
	]);
});

test("learners can't see reports", async () => {
	for (const query of [LEARNERS, QUIZ])
		assert.equal(
			code(await gql("carol", query, { slug: S, id: quizId })),
			"FORBIDDEN",
		);
	assert.equal(
		code(await gql("carol", CONTENT, { slug: S, kind: "course" })),
		"FORBIDDEN",
	);
});

test("another organization's quiz gives null", async () => {
	const theirs = await make("quiz", "Elsewhere", "brian", slugs.brian);
	assert.equal(data(await gql("amina", QUIZ, { slug: S, id: theirs })), null);
	assert.equal(
		data(await gql("brian", QUIZ, { slug: slugs.brian, id: quizId })),
		null,
	);
});

type LearnerReport = {
	totalLearners: number;
	weeklyActive: { day: string; count: number }[];
	mostActive: { person: { id: string }; count: number }[];
	recent: { kind: string; person: { id: string }; content: { id: string } }[];
	learners: {
		person: { id: string; role: string };
		assigned: number;
		completed: number;
		overdue: number;
		inProgress: number;
		percent: number;
		lastOpened: { id: string } | null;
		lastOpenedAt: string | null;
	}[];
};

test("the learner report counts learners, weekly activity and each learner's progress", async () => {
	const r = data<LearnerReport>(await gql("amina", LEARNERS, { slug: S }));
	assert.equal(r.totalLearners, 2);
	assert.equal(r.weeklyActive.length, 8);
	const today = Math.floor(Date.now() / 86_400_000) * 86_400_000;
	assert.equal(
		r.weeklyActive.at(-1)?.day,
		new Date(today - 6 * 86_400_000).toISOString().slice(0, 10),
		"the newest week is the 7 days ending today",
	);
	assert.equal(
		r.weeklyActive.at(-1)?.count,
		2,
		"carol and dave, each once despite several things done",
	);
	assert.equal(r.weeklyActive.at(-2)?.count, 0);
	assert.deepEqual(
		r.mostActive.map((m) => m.person.id).sort(),
		[ids.carol, ids.dave].sort(),
	);
	const kinds = (who: string) =>
		new Set(
			r.recent.filter((e) => e.person.id === ids[who]).map((e) => e.kind),
		);
	assert.ok(kinds("carol").has("passed") && kinds("carol").has("completed"));
	assert.ok(kinds("dave").has("failed"));
	const row = (who: string) => r.learners.find((l) => l.person.id === ids[who]);
	assert.deepEqual(
		{ ...row("carol"), person: undefined },
		{
			person: undefined,
			assigned: 2,
			completed: 2,
			overdue: 0,
			inProgress: 0,
			percent: 100,
			lastOpened: null,
			lastOpenedAt: null,
		},
	);
	assert.equal(row("dave")?.completed, 0);
	assert.equal(row("dave")?.inProgress, 2);
	assert.equal(row("dave")?.percent, 25, "half the course, quiz not passed");
	assert.equal(row("dave")?.person.role, "learner");
	assert.equal(row("dave")?.lastOpened?.id, courseId);
	assert.ok(row("dave")?.lastOpenedAt);
});

test("the content report gives each course and quiz with its learners", async () => {
	type Row = {
		content: { id: string };
		status: string;
		learners: number;
		completed: number;
		percent: number;
		accuracy: number | null;
	};
	const courses = data<Row[]>(
		await gql("amina", CONTENT, { slug: S, kind: "course" }),
	);
	assert.deepEqual(
		courses.find((c) => c.content.id === courseId),
		{
			content: { id: courseId, title: "Safety basics", kind: "course" },
			status: "published",
			learners: 2,
			completed: 1,
			percent: 75,
			accuracy: null,
		},
	);
	const quizzes = data<Row[]>(
		await gql("amina", CONTENT, { slug: S, kind: "quiz" }),
	);
	const q = quizzes.find((c) => c.content.id === quizId);
	assert.equal(q?.learners, 2);
	assert.equal(q?.completed, 1);
	assert.equal(q?.percent, 50);
	assert.equal(q?.accuracy, 50, "carol 100%, dave 0%");
});

test("the quiz report gives totals, each question's answers and the learners' grid", async () => {
	type Report = {
		questionCount: number;
		accuracy: number;
		completedPercent: number;
		submissions: number;
		averageSeconds: number | null;
		questions: {
			id: string;
			answered: number;
			correct: number;
			choices: { label: string; picked: number; right: boolean }[];
		}[];
		learners: {
			person: { id: string };
			score: number;
			maxScore: number;
			passed: boolean;
			attempts: number;
			answers: (boolean | null)[];
		}[];
	};
	const r = data<Report>(await gql("amina", QUIZ, { slug: S, id: quizId }));
	assert.equal(r.questionCount, 2);
	assert.equal(r.accuracy, 50);
	assert.equal(r.completedPercent, 50);
	assert.equal(r.submissions, 2);
	assert.ok(r.averageSeconds != null && r.averageSeconds >= 0);
	assert.deepEqual(
		r.questions.map((q) => [q.id, q.answered, q.correct]),
		[
			[questionIds[0], 2, 1],
			[questionIds[1], 2, 1],
		],
	);
	assert.deepEqual(r.questions[0]?.choices, [
		{ label: "Yes", picked: 1, right: true },
		{ label: "No", picked: 1, right: false },
	]);
	assert.deepEqual(r.questions[1]?.choices, []);
	const grid = (who: string) =>
		r.learners.find((l) => l.person.id === ids[who]);
	assert.deepEqual(
		{ ...grid("carol"), person: undefined },
		{
			person: undefined,
			score: 2,
			maxScore: 2,
			passed: true,
			attempts: 1,
			answers: [true, true],
		},
	);
	assert.deepEqual(grid("dave")?.answers, [false, false]);
	assert.equal(grid("dave")?.passed, false);
});
