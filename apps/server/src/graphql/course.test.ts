import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { lesson, mediaAsset, member, organization, user } from "@ekra/db";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db.ts";
import { call, cookieFrom, linkInLatestEmail, post } from "../test-helpers.ts";

const stamp = Date.now();
const emailOf = (name: string) => `course-${name}-${stamp}@test.ekra`;
const slugs = {
	amina: `course-amina-${stamp}`,
	brian: `course-brian-${stamp}`,
};
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
const data = <T>(r: Result) => {
	assert.ok(!r.errors, JSON.stringify(r.errors));
	return r.data?.r as T;
};

before(async () => {
	for (const name of ["amina", "brian", "carol"]) {
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
	const [carol] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, emailOf("carol")));
	await db.insert(member).values({
		organizationId: org?.id ?? "",
		userId: carol?.id ?? "",
		role: "learner",
	});
});

after(async () => {
	await db
		.delete(organization)
		.where(inArray(organization.slug, Object.values(slugs)));
	await db.delete(user).where(
		inArray(
			user.email,
			["amina", "brian", "carol"].map((n) => emailOf(n)),
		),
	);
});

const OUTLINE = `query ($slug: String!, $id: ID!) { r: course(slug: $slug, id: $id) { lessonCount completedCount sections { id title position lessons { id title position completed kind } } } }`;
type Outline = {
	lessonCount: number;
	completedCount: number;
	sections: {
		id: string;
		title: string;
		lessons: {
			id: string;
			title: string;
			position: number;
			completed: boolean;
		}[];
	}[];
};
const titles = (o: Outline) =>
	o.sections.map((s) => [s.title, ...s.lessons.map((l) => l.title)]);

async function newCourse(title: string) {
	const r = await gql(
		"amina",
		`mutation ($slug: String!) { r: createContent(slug: $slug, input: { kind: course, title: "${title}" }) { id } }`,
		{ slug: slugs.amina },
	);
	return data<{ id: string }>(r).id;
}
const addSection = async (courseId: string, title: string) =>
	data<{ id: string }>(
		await gql(
			"amina",
			`mutation ($slug: String!, $c: ID!, $t: String!) { r: addSection(slug: $slug, courseId: $c, title: $t) { id } }`,
			{ slug: slugs.amina, c: courseId, t: title },
		),
	).id;
const addLesson = async (sectionId: string, title: string, kind = "video") =>
	data<{ id: string }>(
		await gql(
			"amina",
			`mutation ($slug: String!, $s: ID!, $t: String!, $k: LessonKind!) { r: addLesson(slug: $slug, sectionId: $s, kind: $k, title: $t) { id } }`,
			{ slug: slugs.amina, s: sectionId, t: title, k: kind },
		),
	).id;
const outline = async (who: string, courseId: string, slug = slugs.amina) =>
	(await gql(who, OUTLINE, { slug, id: courseId })).data?.r as
		| Outline
		| null
		| undefined;

test("a course is built from sections and lessons, kept in order when moved", async () => {
	const course = await newCourse("Safety");
	const intro = await addSection(course, "Intro");
	const deep = await addSection(course, "Going deeper");
	const welcome = await addLesson(intro, "Welcome");
	const rules = await addLesson(intro, "House rules", "page");
	await addLesson(deep, "Fire exits");

	assert.deepEqual(titles((await outline("amina", course)) as Outline), [
		["Intro", "Welcome", "House rules"],
		["Going deeper", "Fire exits"],
	]);

	// House rules to the top of Going deeper; then Going deeper first
	const moved = await gql(
		"amina",
		`mutation ($slug: String!, $id: ID!, $s: ID!) { r: moveLesson(slug: $slug, id: $id, sectionId: $s, position: 0) }`,
		{ slug: slugs.amina, id: rules, s: deep },
	);
	assert.equal(data<boolean>(moved), true);
	await gql(
		"amina",
		`mutation ($slug: String!, $id: ID!) { r: moveSection(slug: $slug, id: $id, position: 0) }`,
		{ slug: slugs.amina, id: deep },
	);
	const o = (await outline("amina", course)) as Outline;
	assert.deepEqual(titles(o), [
		["Going deeper", "House rules", "Fire exits"],
		["Intro", "Welcome"],
	]);
	assert.equal(o.sections[0]?.lessons[0]?.id, rules);
	assert.equal(o.sections[1]?.lessons[0]?.id, welcome);

	// deleting a lesson closes the gap
	await gql(
		"amina",
		`mutation ($slug: String!, $id: ID!) { r: deleteLesson(slug: $slug, id: $id) }`,
		{ slug: slugs.amina, id: rules },
	);
	const after = (await outline("amina", course)) as Outline;
	assert.deepEqual(titles(after)[0], ["Going deeper", "Fire exits"]);
	assert.deepEqual(
		after.sections[0]?.lessons.map((l) => l.position),
		[0],
	);
});

test("learners see a published course and keep their own progress; drafts and other organizations stay closed", async () => {
	const course = await newCourse("Onboarding");
	const section = await addSection(course, "Day one");
	const lesson = await addLesson(section, "Meet the team");
	await addLesson(section, "Your first task");

	// a draft course: invisible to learners
	assert.equal(await outline("carol", course), null);
	await gql(
		"amina",
		`mutation ($slug: String!, $id: ID!) { r: updateContent(slug: $slug, id: $id, input: { status: published }) { id } }`,
		{ slug: slugs.amina, id: course },
	);
	const seen = (await outline("carol", course)) as Outline;
	assert.equal(seen.lessonCount, 2);

	const done = await gql(
		"carol",
		`mutation ($slug: String!, $id: ID!) { r: completeLesson(slug: $slug, id: $id, complete: true) { completed } }`,
		{ slug: slugs.amina, id: lesson },
	);
	assert.equal(data<{ completed: boolean }>(done).completed, true);
	assert.equal(((await outline("carol", course)) as Outline).completedCount, 1);
	assert.equal(
		((await outline("amina", course)) as Outline).completedCount,
		0,
		"progress is per person",
	);
	const at = await gql(
		"carol",
		`mutation ($slug: String!, $id: ID!) { r: saveLessonPosition(slug: $slug, id: $id, seconds: 99999999) }`,
		{ slug: slugs.amina, id: lesson },
	);
	assert.equal(data<boolean>(at), true);
	const lessonNow = await gql(
		"carol",
		`query ($slug: String!, $id: ID!) { r: lesson(slug: $slug, id: $id) { positionSeconds } }`,
		{ slug: slugs.amina, id: lesson },
	);
	assert.equal(
		data<{ positionSeconds: number }>(lessonNow).positionSeconds,
		86400,
		"capped",
	);

	// learners can't build it
	const learnerAdds = await gql(
		"carol",
		`mutation ($slug: String!, $s: ID!) { r: addLesson(slug: $slug, sectionId: $s, kind: page, title: "Mine") { id } }`,
		{ slug: slugs.amina, s: section },
	);
	assert.equal(code(learnerAdds), "FORBIDDEN");

	// another organization: nothing, even with the right ids
	assert.equal(
		code(await gql("brian", OUTLINE, { slug: slugs.amina, id: course })),
		"FORBIDDEN",
	);
	assert.equal(await outline("brian", course, slugs.brian), null);
	for (const [query, vars] of [
		[
			`mutation ($slug: String!, $id: ID!) { r: completeLesson(slug: $slug, id: $id, complete: true) { id } }`,
			{ id: lesson },
		],
		[
			`mutation ($slug: String!, $id: ID!) { r: deleteLesson(slug: $slug, id: $id) }`,
			{ id: lesson },
		],
		[
			`mutation ($slug: String!, $id: ID!) { r: renameSection(slug: $slug, id: $id, title: "x") { id } }`,
			{ id: section },
		],
		[
			`mutation ($slug: String!, $id: ID!) { r: moveLesson(slug: $slug, id: $id, sectionId: $id, position: 0) }`,
			{ id: lesson },
		],
	] as const) {
		const r = await gql("brian", query, { slug: slugs.brian, ...vars });
		assert.equal(code(r), "NOT_FOUND", query);
	}
	assert.equal((await outline("amina", course))?.lessonCount, 2, "untouched");
});

test("a lesson's text saves and refuses a save on top of a newer one", async () => {
	const course = await newCourse("Reading");
	const lesson = await addLesson(
		await addSection(course, "Part 1"),
		"Read me",
		"page",
	);
	const doc = (text: string) =>
		JSON.stringify({
			type: "doc",
			content: [{ type: "paragraph", content: [{ type: "text", text }] }],
		});
	const SAVE = `mutation ($slug: String!, $id: ID!, $doc: String!, $base: String) { r: saveLessonBody(slug: $slug, id: $id, doc: $doc, baseBodyUpdatedAt: $base) { bodyUpdatedAt doc } }`;
	const first = data<{ bodyUpdatedAt: string }>(
		await gql("amina", SAVE, {
			slug: slugs.amina,
			id: lesson,
			doc: doc("One"),
			base: null,
		}),
	);
	assert.equal(
		code(
			await gql("amina", SAVE, {
				slug: slugs.amina,
				id: lesson,
				doc: doc("Stale"),
				base: null,
			}),
		),
		"CONFLICT",
	);
	const second = data<{ doc: string }>(
		await gql("amina", SAVE, {
			slug: slugs.amina,
			id: lesson,
			doc: doc("Two"),
			base: first.bodyUpdatedAt,
		}),
	);
	assert.match(second.doc, /Two/);
	const bad = await gql("amina", SAVE, {
		slug: slugs.amina,
		id: lesson,
		doc: JSON.stringify({ type: "doc", content: [{ type: "iframe" }] }),
		base: null,
	});
	assert.equal(code(bad), "BAD_USER_INPUT");
});

const publish = (id: string) =>
	gql(
		"amina",
		`mutation ($slug: String!, $id: ID!) { r: updateContent(slug: $slug, id: $id, input: { status: published }) { id } }`,
		{ slug: slugs.amina, id },
	);
const LOCKS = `query ($slug: String!, $id: ID!) { r: course(slug: $slug, id: $id) { sequential sections { lessons { id locked completed } } } }`;
const locks = async (who: string, courseId: string) =>
	data<{
		sequential: boolean;
		sections: {
			lessons: { id: string; locked: boolean; completed: boolean }[];
		}[];
	}>(
		await gql(who, LOCKS, { slug: slugs.amina, id: courseId }),
	).sections.flatMap((s) => s.lessons);

test("a course taken in order: each lesson opens when the ones before are done", async () => {
	const course = await newCourse("In order");
	const one = await addSection(course, "One");
	const two = await addSection(course, "Two");
	const first = await addLesson(one, "First", "page");
	const second = await addLesson(two, "Second", "page");
	data(
		await gql(
			"amina",
			`mutation ($slug: String!, $id: ID!) { r: updateContent(slug: $slug, id: $id, input: { sequential: true }) { sequential } }`,
			{ slug: slugs.amina, id: course },
		),
	);
	await publish(course);

	assert.deepEqual(
		(await locks("carol", course)).map((l) => l.locked),
		[false, true],
	);
	assert.deepEqual(
		(await locks("amina", course)).map((l) => l.locked),
		[false, false],
		"trainers are never locked",
	);
	const early = await gql(
		"carol",
		`mutation ($slug: String!, $id: ID!) { r: completeLesson(slug: $slug, id: $id, complete: true) { id } }`,
		{ slug: slugs.amina, id: second },
	);
	assert.equal(code(early), "FORBIDDEN");
	assert.equal(
		code(
			await gql(
				"carol",
				`query ($slug: String!, $id: ID!) { r: lesson(slug: $slug, id: $id) { id doc } }`,
				{ slug: slugs.amina, id: second },
			),
		),
		"FORBIDDEN",
		"a locked lesson's content isn't sent",
	);
	data(
		await gql(
			"carol",
			`mutation ($slug: String!, $id: ID!) { r: completeLesson(slug: $slug, id: $id, complete: true) { id } }`,
			{ slug: slugs.amina, id: first },
		),
	);
	assert.deepEqual(
		(await locks("carol", course)).map((l) => l.locked),
		[false, false],
	);
});

test("a quiz lesson is finished by passing its quiz", async () => {
	const quizItem = data<{ id: string }>(
		await gql(
			"amina",
			`mutation ($slug: String!) { r: createContent(slug: $slug, input: { kind: quiz, title: "Check" }) { id } }`,
			{ slug: slugs.amina },
		),
	).id;
	const question = data<{ id: string }>(
		await gql(
			"amina",
			`mutation ($slug: String!, $q: ID!, $input: QuestionInput!) { r: addQuestion(slug: $slug, quizId: $q, input: $input) { id } }`,
			{
				slug: slugs.amina,
				q: quizItem,
				input: {
					kind: "multiple_choice",
					prompt: "2 + 2?",
					payload: JSON.stringify({
						options: [
							{ id: "a", text: "4" },
							{ id: "b", text: "5" },
						],
						correct: ["a"],
					}),
				},
			},
		),
	).id;
	await publish(quizItem);
	const course = await newCourse("With a quiz");
	const section = await addSection(course, "Only");
	const noQuiz = await gql(
		"amina",
		`mutation ($slug: String!, $s: ID!) { r: addLesson(slug: $slug, sectionId: $s, kind: quiz, title: "Check") { id } }`,
		{ slug: slugs.amina, s: section },
	);
	assert.equal(code(noQuiz), "BAD_USER_INPUT", "a quiz lesson needs a quiz");
	const lessonId = data<{ id: string }>(
		await gql(
			"amina",
			`mutation ($slug: String!, $s: ID!, $q: ID!) { r: addLesson(slug: $slug, sectionId: $s, kind: quiz, title: "Check", quizId: $q) { id } }`,
			{ slug: slugs.amina, s: section, q: quizItem },
		),
	).id;
	await publish(course);

	const tick = await gql(
		"carol",
		`mutation ($slug: String!, $id: ID!) { r: completeLesson(slug: $slug, id: $id, complete: true) { id } }`,
		{ slug: slugs.amina, id: lessonId },
	);
	assert.equal(code(tick), "FORBIDDEN", "it can't just be ticked off");

	const attempt = data<{ id: string }>(
		await gql(
			"carol",
			`mutation ($slug: String!, $q: ID!) { r: startQuizAttempt(slug: $slug, quizId: $q) { id } }`,
			{ slug: slugs.amina, q: quizItem },
		),
	).id;
	await gql(
		"carol",
		`mutation ($slug: String!, $a: ID!, $q: ID!) { r: saveQuizAnswer(slug: $slug, attemptId: $a, questionId: $q, answer: "[\\"a\\"]") { saved } }`,
		{ slug: slugs.amina, a: attempt, q: question },
	);
	data(
		await gql(
			"carol",
			`mutation ($slug: String!, $a: ID!) { r: submitQuizAttempt(slug: $slug, attemptId: $a) { id } }`,
			{ slug: slugs.amina, a: attempt },
		),
	);
	assert.equal((await locks("carol", course))[0]?.completed, true);
});

test("a learner can't read a locked lesson's text or video through the course", async () => {
	const course = await newCourse("Locked content");
	const one = await addSection(course, "One");
	await addLesson(one, "First", "page");
	const second = await addLesson(one, "Second", "video");
	data(
		await gql(
			"amina",
			`mutation ($slug: String!, $id: ID!, $doc: String!) { r: saveLessonBody(slug: $slug, id: $id, doc: $doc) { id } }`,
			{
				slug: slugs.amina,
				id: second,
				doc: JSON.stringify({
					type: "doc",
					content: [
						{ type: "paragraph", content: [{ type: "text", text: "Secret" }] },
					],
				}),
			},
		),
	);
	const [org] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, slugs.amina));
	const [video] = await db
		.insert(mediaAsset)
		.values({ orgId: org?.id ?? "", kind: "video", status: "ready" })
		.returning({ id: mediaAsset.id });
	await db
		.update(lesson)
		.set({ mediaId: video?.id })
		.where(eq(lesson.id, second));
	data(
		await gql(
			"amina",
			`mutation ($slug: String!, $id: ID!) { r: updateContent(slug: $slug, id: $id, input: { sequential: true }) { sequential } }`,
			{ slug: slugs.amina, id: course },
		),
	);
	await publish(course);

	const seen = data<{
		sections: {
			lessons: {
				id: string;
				locked: boolean;
				doc: string | null;
				video: { playlist: string | null } | null;
			}[];
		}[];
	}>(
		await gql(
			"carol",
			`query ($slug: String!, $id: ID!) { r: course(slug: $slug, id: $id) { sections { lessons { id locked doc video { playlist } } } } }`,
			{ slug: slugs.amina, id: course },
		),
	);
	const locked = seen.sections[0]?.lessons.find((l) => l.id === second);
	assert.equal(locked?.locked, true);
	assert.equal(locked?.doc, null);
	assert.equal(locked?.video, null);
	const managed = data<{
		sections: {
			lessons: { id: string; video: { playlist: string } | null }[];
		}[];
	}>(
		await gql(
			"amina",
			`query ($slug: String!, $id: ID!) { r: course(slug: $slug, id: $id) { sections { lessons { id video { playlist } } } } }`,
			{ slug: slugs.amina, id: course },
		),
	);
	assert.ok(
		managed.sections[0]?.lessons.find((l) => l.id === second)?.video?.playlist,
		"trainers still see the video",
	);
});

test("a quiz lesson whose quiz learners can't take doesn't block the course", async () => {
	const draftQuiz = data<{ id: string }>(
		await gql(
			"amina",
			`mutation ($slug: String!) { r: createContent(slug: $slug, input: { kind: quiz, title: "Unpublished" }) { id } }`,
			{ slug: slugs.amina },
		),
	).id;
	const course = await newCourse("Stuck quiz");
	const section = await addSection(course, "Only");
	const lessonId = data<{ id: string }>(
		await gql(
			"amina",
			`mutation ($slug: String!, $s: ID!, $q: ID!) { r: addLesson(slug: $slug, sectionId: $s, kind: quiz, title: "Check", quizId: $q) { id } }`,
			{ slug: slugs.amina, s: section, q: draftQuiz },
		),
	).id;
	await publish(course);
	data(
		await gql(
			"carol",
			`mutation ($slug: String!, $id: ID!) { r: completeLesson(slug: $slug, id: $id, complete: true) { id } }`,
			{ slug: slugs.amina, id: lessonId },
		),
	);
	assert.equal((await outline("carol", course))?.completedCount, 1);
});
