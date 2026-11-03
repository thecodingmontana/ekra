import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { member, organization, user } from "@ekra/db";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db.ts";
import { call, cookieFrom, linkInLatestEmail, post } from "../test-helpers.ts";

const stamp = Date.now();
const emailOf = (name: string) => `path-${name}-${stamp}@test.ekra`;
const slugs = { amina: `path-amina-${stamp}`, brian: `path-brian-${stamp}` };
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
	const ids: Record<string, string> = {};
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
const make = async (kind: string, title: string) => {
	const id = data<{ id: string }>(
		await gql(
			"amina",
			`mutation ($slug: String!) { r: createContent(slug: $slug, input: { kind: ${kind}, title: "${title}" }) { id } }`,
			{ slug: S },
		),
	).id;
	data(
		await gql(
			"amina",
			"mutation ($slug: String!, $id: ID!) { r: updateContent(slug: $slug, id: $id, input: { status: published }) { id } }",
			{ slug: S, id },
		),
	);
	return id;
};
const addStage = async (pathId: string, title: string) =>
	data<{ id: string; position: number }>(
		await gql(
			"amina",
			"mutation ($slug: String!, $p: ID!, $t: String!) { r: addStage(slug: $slug, pathId: $p, title: $t) { id position } }",
			{ slug: S, p: pathId, t: title },
		),
	);
const ADD_STEP =
	"mutation ($slug: String!, $s: ID!, $c: ID!) { r: addStep(slug: $slug, stageId: $s, contentId: $c) { id position } }";
const PATH =
	"query ($slug: String!, $id: ID!) { r: path(slug: $slug, id: $id) { percent stages { title steps { id locked percent content { title } } } } }";
type Path = {
	percent: number;
	stages: {
		title: string;
		steps: { id: string; locked: boolean; content: { title: string } }[];
	}[];
};
const titles = (p: Path) =>
	p.stages.map(
		(s) => `${s.title}: ${s.steps.map((t) => t.content.title).join(", ")}`,
	);

test("stages and steps: add, move, remove; only content that can be taken, once", async () => {
	const path = await make("path", "Onboarding");
	const one = await addStage(path, "Week one");
	const two = await addStage(path, "Week two");
	assert.equal(two.position, 1);
	const a = await make("page", "Handbook");
	const b = await make("page", "Policy");
	const sa = data<{ id: string }>(
		await gql("amina", ADD_STEP, { slug: S, s: one.id, c: a }),
	).id;
	data(await gql("amina", ADD_STEP, { slug: S, s: one.id, c: b }));
	assert.equal(
		code(await gql("amina", ADD_STEP, { slug: S, s: two.id, c: a })),
		"BAD_USER_INPUT",
		"once per path",
	);
	const folder = await make("folder", "Box");
	assert.equal(
		code(await gql("amina", ADD_STEP, { slug: S, s: two.id, c: folder })),
		"BAD_USER_INPUT",
		"a folder isn't a step",
	);

	data(
		await gql(
			"amina",
			"mutation ($slug: String!, $id: ID!, $s: ID!) { r: moveStep(slug: $slug, id: $id, stageId: $s, position: 0) }",
			{ slug: S, id: sa, s: two.id },
		),
	);
	assert.deepEqual(
		titles(data<Path>(await gql("amina", PATH, { slug: S, id: path }))),
		["Week one: Policy", "Week two: Handbook"],
	);

	data(
		await gql(
			"amina",
			"mutation ($slug: String!, $id: ID!) { r: deleteStage(slug: $slug, id: $id) }",
			{ slug: S, id: one.id },
		),
	);
	data(
		await gql(
			"amina",
			"mutation ($slug: String!, $id: ID!) { r: removeStep(slug: $slug, id: $id) }",
			{ slug: S, id: sa },
		),
	);
	assert.deepEqual(
		titles(data<Path>(await gql("amina", PATH, { slug: S, id: path }))),
		["Week two: "],
	);
});

test("a path taken in order locks steps for learners; progress adds up; other organizations see nothing", async () => {
	const path = await make("path", "In order");
	data(
		await gql(
			"amina",
			"mutation ($slug: String!, $id: ID!) { r: updateContent(slug: $slug, id: $id, input: { sequential: true }) { id } }",
			{ slug: S, id: path },
		),
	);
	const stage = await addStage(path, "Start");
	const first = await make("page", "First");
	const second = await make("page", "Second");
	for (const c of [first, second])
		data(await gql("amina", ADD_STEP, { slug: S, s: stage.id, c }));

	const locks = async (who: string) =>
		data<Path>(
			await gql(who, PATH, { slug: S, id: path }),
		).stages[0]?.steps.map((s) => s.locked);
	assert.deepEqual(await locks("carol"), [false, true]);
	assert.deepEqual(await locks("amina"), [false, false], "never for managers");

	data(
		await gql(
			"carol",
			"mutation ($slug: String!, $c: ID!) { r: markDone(slug: $slug, contentId: $c, done: true) }",
			{ slug: S, c: first },
		),
	);
	assert.deepEqual(await locks("carol"), [false, false]);
	assert.equal(
		data<Path>(await gql("carol", PATH, { slug: S, id: path })).percent,
		50,
	);

	const ADD_STAGE =
		'mutation ($slug: String!, $p: ID!) { r: addStage(slug: $slug, pathId: $p, title: "x") { id } }';
	assert.equal(
		code(await gql("carol", ADD_STAGE, { slug: S, p: path })),
		"FORBIDDEN",
	);
	assert.equal(
		data(await gql("brian", PATH, { slug: slugs.brian, id: path })),
		null,
		"another organization sees nothing",
	);
	assert.equal(
		code(await gql("brian", ADD_STAGE, { slug: slugs.brian, p: path })),
		"NOT_FOUND",
	);
});

test("path progress counts only the steps learners can see", async () => {
	const path = await make("path", "Hidden steps");
	const stage = await addStage(path, "Start");
	const shown = await make("page", "Shown");
	const draft = data<{ id: string }>(
		await gql(
			"amina",
			'mutation ($slug: String!) { r: createContent(slug: $slug, input: { kind: page, title: "Draft step" }) { id } }',
			{ slug: S },
		),
	).id;
	for (const c of [shown, draft])
		data(await gql("amina", ADD_STEP, { slug: S, s: stage.id, c }));
	data(
		await gql(
			"carol",
			"mutation ($slug: String!, $c: ID!) { r: markDone(slug: $slug, contentId: $c, done: true) }",
			{ slug: S, c: shown },
		),
	);
	data(
		await gql(
			"carol",
			"mutation ($slug: String!, $c: ID!) { r: startLearning(slug: $slug, contentId: $c) }",
			{ slug: S, c: path },
		),
	);
	assert.equal(
		data<Path>(await gql("carol", PATH, { slug: S, id: path })).percent,
		100,
	);
	const mine = data<{ percent: number; content: { id: string } }[]>(
		await gql(
			"carol",
			"query ($slug: String!) { r: myLearning(slug: $slug) { percent content { id } } }",
			{ slug: S },
		),
	);
	assert.equal(
		mine.find((e) => e.content.id === path)?.percent,
		100,
		"the draft step doesn't count",
	);
});
