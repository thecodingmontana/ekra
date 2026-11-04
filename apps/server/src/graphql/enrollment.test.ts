import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { enrollment, member, organization, user } from "@ekra/db";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db.ts";
import {
	call,
	cookieFrom,
	emailsTo,
	linkInLatestEmail,
	post,
} from "../test-helpers.ts";

const stamp = Date.now();
const emailOf = (name: string) => `enrol-${name}-${stamp}@test.ekra`;
const slugs = { amina: `enrol-amina-${stamp}`, brian: `enrol-brian-${stamp}` };
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
	for (const name of ["amina", "brian", "carol"]) {
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
	await db.insert(member).values({
		organizationId: org?.id ?? "",
		userId: ids.carol ?? "",
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

const S = slugs.amina;
const make = async (kind: string, title: string) =>
	data<{ id: string }>(
		await gql(
			"amina",
			`mutation ($slug: String!) { r: createContent(slug: $slug, input: { kind: ${kind}, title: "${title}" }) { id } }`,
			{ slug: S },
		),
	).id;
const publish = (id: string) =>
	gql(
		"amina",
		`mutation ($slug: String!, $id: ID!) { r: updateContent(slug: $slug, id: $id, input: { status: published }) { id } }`,
		{ slug: S, id },
	);
const ENROLL = `mutation ($slug: String!, $c: ID!, $u: [ID!]!, $due: String) { r: enroll(slug: $slug, contentId: $c, userIds: $u, dueAt: $due) { id status percent dueAt user { name } } }`;
const LIST = `query ($slug: String!, $c: ID!) { r: enrollments(slug: $slug, contentId: $c) { id status percent remindAgainAt } }`;
type Row = {
	id: string;
	status: string;
	percent: number;
	remindAgainAt: string | null;
};
const status = async (contentId: string) =>
	data<Row[]>(await gql("amina", LIST, { slug: S, c: contentId }))[0];

test("trainers see the members and assign content with a due date", async () => {
	const members = data<{ id: string; role: string }[]>(
		await gql(
			"amina",
			"query ($slug: String!) { r: members(slug: $slug) { id role } }",
			{ slug: S },
		),
	);
	assert.deepEqual(members.map((m) => m.role).sort(), ["learner", "owner"]);
	assert.equal(
		code(
			await gql(
				"carol",
				"query ($slug: String!) { r: members(slug: $slug) { id } }",
				{ slug: S },
			),
		),
		"FORBIDDEN",
	);

	const page = await make("page", "Handbook");
	const due = new Date(Date.now() + 7 * 86_400_000).toISOString();
	const [row] = data<Row[]>(
		await gql("amina", ENROLL, { slug: S, c: page, u: [ids.carol], due }),
	);
	assert.equal(row?.status, "not_started");
	assert.equal(
		code(await gql("amina", ENROLL, { slug: S, c: page, u: [ids.brian] })),
		"BAD_USER_INPUT",
		"only members of this organization",
	);
	const folder = await make("folder", "Box");
	assert.equal(
		code(await gql("amina", ENROLL, { slug: S, c: folder, u: [ids.carol] })),
		"NOT_FOUND",
		"a folder can't be taken",
	);
	assert.equal(
		code(
			await gql("brian", ENROLL, {
				slug: slugs.brian,
				c: page,
				u: [ids.brian],
			}),
		),
		"NOT_FOUND",
		"another organization's content",
	);
});

test("progress and status follow what the learner did", async () => {
	// a course of two lessons
	const course = await make("course", "Safety");
	const section = data<{ id: string }>(
		await gql(
			"amina",
			`mutation ($slug: String!, $c: ID!) { r: addSection(slug: $slug, courseId: $c, title: "One") { id } }`,
			{ slug: S, c: course },
		),
	).id;
	const lessons: string[] = [];
	for (const t of ["A", "B"])
		lessons.push(
			data<{ id: string }>(
				await gql(
					"amina",
					`mutation ($slug: String!, $s: ID!) { r: addLesson(slug: $slug, sectionId: $s, kind: page, title: "${t}") { id } }`,
					{ slug: S, s: section },
				),
			).id,
		);
	await publish(course);
	await gql("amina", ENROLL, { slug: S, c: course, u: [ids.carol] });
	const complete = (lesson: string) =>
		gql(
			"carol",
			`mutation ($slug: String!, $id: ID!) { r: completeLesson(slug: $slug, id: $id, complete: true) { id } }`,
			{ slug: S, id: lesson },
		);
	assert.equal((await status(course))?.status, "not_started");
	await complete(lessons[0] ?? "");
	assert.deepEqual(
		[(await status(course))?.status, (await status(course))?.percent],
		["in_progress", 50],
	);
	await db
		.update(enrollment)
		.set({ dueAt: new Date(Date.now() - 86_400_000) })
		.where(eq(enrollment.contentId, course));
	assert.equal((await status(course))?.status, "overdue");
	await complete(lessons[1] ?? "");
	assert.deepEqual(
		[(await status(course))?.status, (await status(course))?.percent],
		["completed", 100],
	);

	// a page: done when marked done
	const page = await make("page", "Policy");
	await publish(page);
	await gql("amina", ENROLL, { slug: S, c: page, u: [ids.carol] });
	data(
		await gql(
			"carol",
			`mutation ($slug: String!, $c: ID!) { r: markDone(slug: $slug, contentId: $c, done: true) }`,
			{ slug: S, c: page },
		),
	);
	assert.equal((await status(page))?.status, "completed");

	// what the learner sees: what was given, with progress; never a draft
	const draft = await make("page", "Not ready");
	await gql("amina", ENROLL, { slug: S, c: draft, u: [ids.carol] });
	const mine = data<{ content: { title: string }; percent: number }[]>(
		await gql(
			"carol",
			"query ($slug: String!) { r: myLearning(slug: $slug) { percent content { title } } }",
			{ slug: S },
		),
	);
	const titles = mine.map((m) => m.content.title);
	assert.ok(titles.includes("Safety") && titles.includes("Policy"));
	assert.ok(!titles.includes("Not ready"), "a draft stays hidden");
});

test("reminders are emailed, then wait half an hour; dates change and people are removed", async () => {
	const page = await make("page", "Remind me");
	const [row] = data<Row[]>(
		await gql("amina", ENROLL, { slug: S, c: page, u: [ids.carol] }),
	);
	const REMIND = `mutation ($slug: String!, $ids: [ID!]!) { r: remindEnrollments(slug: $slug, ids: $ids, kind: running_out) { sent waiting } }`;
	const before = emailsTo(emailOf("carol")).length;
	assert.deepEqual(
		data(await gql("amina", REMIND, { slug: S, ids: [row?.id] })),
		{ sent: 1, waiting: 0 },
	);
	await new Promise((r) => setTimeout(r, 200));
	const sent = emailsTo(emailOf("carol"));
	assert.equal(sent.length, before + 1);
	assert.match(sent.at(-1)?.subject ?? "", /Time is running out for Remind me/);
	assert.deepEqual(
		data(await gql("amina", REMIND, { slug: S, ids: [row?.id] })),
		{ sent: 0, waiting: 1 },
		"not again so soon",
	);
	assert.ok((await status(page))?.remindAgainAt);

	const due = new Date(Date.now() + 86_400_000).toISOString();
	const moved = data<{ dueAt: string }[]>(
		await gql(
			"amina",
			`mutation ($slug: String!, $ids: [ID!]!, $due: String) { r: updateEnrollments(slug: $slug, ids: $ids, dueAt: $due) { dueAt } }`,
			{ slug: S, ids: [row?.id], due },
		),
	);
	assert.equal(moved[0]?.dueAt, due);
	assert.equal(
		data(
			await gql(
				"amina",
				`mutation ($slug: String!, $ids: [ID!]!) { r: removeEnrollments(slug: $slug, ids: $ids) }`,
				{ slug: S, ids: [row?.id] },
			),
		),
		1,
	);
	assert.equal(await status(page), undefined);
	assert.equal(
		code(await gql("brian", LIST, { slug: slugs.brian, c: page })),
		"NOT_FOUND",
		"another organization sees nothing",
	);
});

test("a learner starts something from the catalog themselves; a draft can't be started", async () => {
	const page = await make("page", "Open to all");
	await publish(page);
	const START =
		"mutation ($slug: String!, $c: ID!) { r: startLearning(slug: $slug, contentId: $c) }";
	assert.equal(data(await gql("carol", START, { slug: S, c: page })), true);
	assert.equal(data(await gql("carol", START, { slug: S, c: page })), true);
	const mine = data<{ content: { title: string } }[]>(
		await gql(
			"carol",
			"query ($slug: String!) { r: myLearning(slug: $slug) { content { title } } }",
			{ slug: S },
		),
	);
	assert.equal(
		mine.filter((m) => m.content.title === "Open to all").length,
		1,
		"once",
	);
	assert.equal((await status(page))?.status, "not_started");
	const draft = await make("page", "Draft for later");
	assert.equal(
		code(await gql("carol", START, { slug: S, c: draft })),
		"NOT_FOUND",
	);
});

test("taking something unassigned puts it in your learning: a finished lesson, a page marked done", async () => {
	const course = await make("course", "Self paced");
	const section = data<{ id: string }>(
		await gql(
			"amina",
			'mutation ($slug: String!, $c: ID!) { r: addSection(slug: $slug, courseId: $c, title: "One") { id } }',
			{ slug: S, c: course },
		),
	).id;
	const lesson = data<{ id: string }>(
		await gql(
			"amina",
			'mutation ($slug: String!, $s: ID!) { r: addLesson(slug: $slug, sectionId: $s, kind: page, title: "Read") { id } }',
			{ slug: S, s: section },
		),
	).id;
	await publish(course);
	const page = await make("page", "Read me");
	await publish(page);

	data(
		await gql(
			"carol",
			"mutation ($slug: String!, $id: ID!) { r: completeLesson(slug: $slug, id: $id, complete: true) { id } }",
			{ slug: S, id: lesson },
		),
	);
	data(
		await gql(
			"carol",
			"mutation ($slug: String!, $c: ID!) { r: markDone(slug: $slug, contentId: $c, done: true) }",
			{ slug: S, c: page },
		),
	);
	const mine = data<{ status: string; content: { title: string } }[]>(
		await gql(
			"carol",
			"query ($slug: String!) { r: myLearning(slug: $slug) { status content { title } } }",
			{ slug: S },
		),
	);
	const status = (title: string) =>
		mine.find((m) => m.content.title === title)?.status;
	assert.equal(status("Self paced"), "completed");
	assert.equal(status("Read me"), "completed");
});

test("two reminders at once send one email, with the due date in UTC", async () => {
	const page = await make("page", "Remind twice");
	const [row] = data<Row[]>(
		await gql("amina", ENROLL, {
			slug: S,
			c: page,
			u: [ids.carol],
			due: "2026-11-04T21:30:00Z",
		}),
	);
	const REMIND = `mutation ($slug: String!, $ids: [ID!]!) { r: remindEnrollments(slug: $slug, ids: $ids, kind: overdue) { sent waiting } }`;
	const before = emailsTo(emailOf("carol")).length;
	const results = await Promise.all(
		[1, 2].map(async () =>
			data<{ sent: number; waiting: number }>(
				await gql("amina", REMIND, { slug: S, ids: [row?.id] }),
			),
		),
	);
	assert.deepEqual(
		results.map((r) => r.sent).sort(),
		[0, 1],
		"only one of them sends",
	);
	await new Promise((r) => setTimeout(r, 200));
	const sent = emailsTo(emailOf("carol"));
	assert.equal(sent.length, before + 1);
	assert.match(sent.at(-1)?.text ?? "", /Due: 4 Nov 2026, 21:30 UTC\./);
});

test("a guest sees and takes only what's assigned to them, and can't start anything else", async () => {
	await post("/api/auth/sign-in/magic-link", {
		email: emailOf("gina"),
		callbackURL: "/",
	});
	cookies.gina = cookieFrom(await call(linkInLatestEmail(emailOf("gina"))));
	const [gina] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, emailOf("gina")));
	const [org] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, S));
	await db.insert(member).values({
		organizationId: org?.id ?? "",
		userId: gina?.id ?? "",
		role: "guest",
	});
	try {
		const given = await make("page", "Shared with the guest");
		const open = await make("page", "Open to members");
		const step = await make("page", "Inside a shared path");
		const path = await make("path", "Shared path");
		for (const id of [given, open, step, path]) await publish(id);
		const stage = data<{ id: string }>(
			await gql(
				"amina",
				'mutation ($slug: String!, $p: ID!) { r: addStage(slug: $slug, pathId: $p, title: "One") { id } }',
				{ slug: S, p: path },
			),
		).id;
		data(
			await gql(
				"amina",
				"mutation ($slug: String!, $s: ID!, $c: ID!) { r: addStep(slug: $slug, stageId: $s, contentId: $c) { id } }",
				{ slug: S, s: stage, c: step },
			),
		);
		for (const c of [given, path])
			data(await gql("amina", ENROLL, { slug: S, c, u: [gina?.id] }));

		const library = data<{ items: { id: string }[] }>(
			await gql(
				"gina",
				"query ($slug: String!) { r: library(slug: $slug) { items { id } } }",
				{ slug: S },
			),
		);
		assert.deepEqual(
			library.items.map((i) => i.id).sort(),
			[given, path, step].sort(),
		);
		const content = (id: string) =>
			gql(
				"gina",
				"query ($slug: String!, $id: ID!) { r: content(slug: $slug, id: $id) { id } }",
				{ slug: S, id },
			);
		assert.equal((await content(open)).data?.r, null);
		assert.equal(data<{ id: string }>(await content(step)).id, step);

		const start = (c: string) =>
			gql(
				"gina",
				"mutation ($slug: String!, $c: ID!) { r: startLearning(slug: $slug, contentId: $c) }",
				{ slug: S, c },
			);
		assert.equal(code(await start(open)), "FORBIDDEN");
		assert.equal(code(await start(given)), "FORBIDDEN");
		// what's assigned can still be finished
		assert.equal(
			data(
				await gql(
					"gina",
					"mutation ($slug: String!, $c: ID!) { r: markDone(slug: $slug, contentId: $c, done: true) }",
					{ slug: S, c: given },
				),
			),
			true,
		);
	} finally {
		await db.delete(user).where(eq(user.email, emailOf("gina")));
	}
});

test("enrollment lists are capped like assigning", async () => {
	const many = Array.from({ length: 501 }, (_, i) => `x${i}`);
	const queries = [
		[
			"updateEnrollments",
			"mutation ($slug: String!, $ids: [ID!]!) { r: updateEnrollments(slug: $slug, ids: $ids) { id } }",
		],
		[
			"removeEnrollments",
			"mutation ($slug: String!, $ids: [ID!]!) { r: removeEnrollments(slug: $slug, ids: $ids) }",
		],
		[
			"remindEnrollments",
			"mutation ($slug: String!, $ids: [ID!]!) { r: remindEnrollments(slug: $slug, ids: $ids, kind: overdue) { sent } }",
		],
	] as const;
	for (const [name, query] of queries)
		assert.equal(
			code(await gql("amina", query, { slug: S, ids: many })),
			"BAD_USER_INPUT",
			name,
		);
});
