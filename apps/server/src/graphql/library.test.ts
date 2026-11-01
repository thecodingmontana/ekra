import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { member, organization, user } from "@ekra/db";
import { inArray } from "drizzle-orm";
import { db } from "../db.ts";
import { call, cookieFrom, linkInLatestEmail, post } from "../test-helpers.ts";

const stamp = Date.now();
const emailOf = (name: string) => `${name}-lib-${stamp}@test.ekra`;
const slugs = { amina: `lib-amina-${stamp}`, brian: `lib-brian-${stamp}` };
const cookies: Record<string, string> = {};

type Item = {
	id: string;
	kind: string;
	title: string;
	status: string;
	isTemplate: boolean;
	parentId: string | null;
	isFavorite: boolean;
	viewedAt: string | null;
	author: { name: string } | null;
};
type Result = {
	data?: Record<string, unknown> | null;
	errors?: { message: string; extensions?: { code?: string } }[];
};

const FIELDS =
	"id kind title status isTemplate parentId isFavorite viewedAt author { name }";

async function gql(who: string, query: string, variables: object) {
	const res = await post("/api/graphql", { query, variables }, cookies[who]);
	return (await res.json()) as Result;
}
const code = (r: Result) => r.errors?.[0]?.extensions?.code;

async function library(who: string, slug: string, archived = false) {
	const r = await gql(
		who,
		`query ($slug: String!, $archived: Boolean) { library(slug: $slug, archived: $archived) { canManage items { ${FIELDS} } } }`,
		{ slug, archived },
	);
	return r.data?.library as
		| { canManage: boolean; items: Item[] }
		| null
		| undefined;
}

async function create(who: string, slug: string, input: object) {
	const r = await gql(
		who,
		`mutation ($slug: String!, $input: CreateContentInput!) { createContent(slug: $slug, input: $input) { ${FIELDS} } }`,
		{ slug, input },
	);
	return { item: r.data?.createContent as Item, result: r };
}

const MUTATIONS = {
	update: `mutation ($slug: String!, $id: ID!) { r: updateContent(slug: $slug, id: $id, input: { title: "Taken over" }) { id } }`,
	publish: `mutation ($slug: String!, $id: ID!) { r: updateContent(slug: $slug, id: $id, input: { status: published }) { id } }`,
	archive: `mutation ($slug: String!, $id: ID!) { r: archiveContent(slug: $slug, id: $id, archived: true) { id } }`,
	restore: `mutation ($slug: String!, $id: ID!) { r: archiveContent(slug: $slug, id: $id, archived: false) { id } }`,
	delete: `mutation ($slug: String!, $id: ID!) { r: deleteContent(slug: $slug, id: $id) }`,
	duplicate: `mutation ($slug: String!, $id: ID!) { r: duplicateContent(slug: $slug, id: $id) { id title status isTemplate } }`,
	favorite: `mutation ($slug: String!, $id: ID!) { r: favoriteContent(slug: $slug, id: $id, favorite: true) { id isFavorite } }`,
	unfavorite: `mutation ($slug: String!, $id: ID!) { r: favoriteContent(slug: $slug, id: $id, favorite: false) { id isFavorite } }`,
	view: `mutation ($slug: String!, $id: ID!) { r: viewContent(slug: $slug, id: $id) }`,
	content: `query ($slug: String!, $id: ID!) { r: content(slug: $slug, id: $id) { id title } }`,
};
const run = (
	who: string,
	op: keyof typeof MUTATIONS,
	slug: string,
	id: string,
) => gql(who, MUTATIONS[op], { slug, id });

async function signIn(name: string) {
	await post("/api/auth/sign-in/magic-link", {
		email: emailOf(name),
		callbackURL: "/",
	});
	cookies[name] = cookieFrom(await call(linkInLatestEmail(emailOf(name))));
}

const orgIds: Record<string, string> = {};
before(async () => {
	for (const name of ["amina", "brian"] as const) {
		await signIn(name);
		const res = await post(
			"/api/auth/organization/create",
			{ name: `${name}'s school`, slug: slugs[name] },
			cookies[name],
		);
		orgIds[name] = ((await res.json()) as { id: string }).id;
	}
	// Carol learns in Amina's organization, Tom trains there (with a second role)
	for (const [name, role] of [
		["carol", "learner"],
		["tom", "learner,trainer"],
	] as const) {
		await signIn(name);
		const [row] = await db
			.select({ id: user.id })
			.from(user)
			.where(inArray(user.email, [emailOf(name)]));
		await db.insert(member).values({
			organizationId: orgIds.amina ?? "",
			userId: row?.id ?? "",
			role,
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
			["amina", "brian", "carol", "tom"].map((n) => emailOf(n)),
		),
	);
});

test("content is created as a draft, by its author, in the right organization", async () => {
	const { item } = await create("amina", slugs.amina, {
		kind: "course",
		title: "  Onboarding  ",
	});
	assert.equal(item.title, "Onboarding");
	assert.equal(item.status, "draft");
	assert.ok(item.author?.name);
	const mine = await library("amina", slugs.amina);
	assert.equal(mine?.canManage, true);
	assert.deepEqual(
		mine?.items.map((i) => i.id),
		[item.id],
	);
});

test("another organization's library, content and actions are refused", async () => {
	const { item } = await create("amina", slugs.amina, {
		kind: "page",
		title: "Amina's secret page",
	});
	// Brian names Amina's organization: refused like an organization that doesn't exist
	const named = await gql(
		"brian",
		"query ($slug: String!) { library(slug: $slug) { items { id } } }",
		{ slug: slugs.amina },
	);
	assert.equal(code(named), "FORBIDDEN");
	for (const op of Object.keys(MUTATIONS) as (keyof typeof MUTATIONS)[]) {
		const r = await run("brian", op, slugs.amina, item.id);
		assert.equal(code(r), "FORBIDDEN", op);
		assert.doesNotMatch(JSON.stringify(r), /secret/i, op);
	}
	const made = await create("brian", slugs.amina, {
		kind: "page",
		title: "Planted",
	});
	assert.equal(code(made.result), "FORBIDDEN");

	// in his own organization, with Amina's ids: row-level security finds nothing
	assert.deepEqual((await library("brian", slugs.brian))?.items, []);
	for (const op of Object.keys(MUTATIONS) as (keyof typeof MUTATIONS)[]) {
		const r = await run("brian", op, slugs.brian, item.id);
		assert.doesNotMatch(JSON.stringify(r), /secret/i, op);
		if (op === "content") assert.equal(r.data?.r, null, op);
		else if (op === "view") assert.equal(r.data?.r, false, op);
		else assert.equal(code(r), "NOT_FOUND", op);
	}
	// nor can he file his content into her folder
	const { item: folder } = await create("amina", slugs.amina, {
		kind: "folder",
		title: "Amina's folder",
	});
	const filed = await create("brian", slugs.brian, {
		kind: "page",
		title: "Mine",
		parentId: folder.id,
	});
	assert.equal(code(filed.result), "BAD_USER_INPUT");
	// and her page is untouched
	const after = await run("amina", "content", slugs.amina, item.id);
	assert.equal(
		(after.data?.r as { title: string } | undefined)?.title,
		"Amina's secret page",
	);
});

test("learners only see published content, and can't change it", async () => {
	const { item: draft } = await create("amina", slugs.amina, {
		kind: "quiz",
		title: "Draft quiz",
	});
	const { item: live } = await create("amina", slugs.amina, {
		kind: "quiz",
		title: "Live quiz",
	});
	const { item: template } = await create("amina", slugs.amina, {
		kind: "course",
		title: "Course template",
		isTemplate: true,
	});
	await run("amina", "publish", slugs.amina, live.id);
	await run("amina", "publish", slugs.amina, template.id);

	const seen = await library("carol", slugs.amina);
	assert.equal(seen?.canManage, false);
	const ids = seen?.items.map((i) => i.id) ?? [];
	assert.ok(ids.includes(live.id));
	assert.ok(!ids.includes(draft.id), "drafts stay hidden");
	assert.ok(!ids.includes(template.id), "templates stay hidden");
	assert.equal(
		(await run("carol", "content", slugs.amina, draft.id)).data?.r,
		null,
	);
	assert.deepEqual((await library("carol", slugs.amina, true))?.items, []);

	for (const op of ["update", "archive", "duplicate"] as const)
		assert.equal(
			code(await run("carol", op, slugs.amina, live.id)),
			"FORBIDDEN",
			op,
		);
	const made = await create("carol", slugs.amina, {
		kind: "page",
		title: "Nope",
	});
	assert.equal(code(made.result), "FORBIDDEN");

	// but they keep their own favorites and recents
	const starred = await run("carol", "favorite", slugs.amina, live.id);
	assert.equal((starred.data?.r as Item | undefined)?.isFavorite, true);
	assert.equal(
		(await run("carol", "view", slugs.amina, live.id)).data?.r,
		true,
	);
	const again = (await library("carol", slugs.amina))?.items.find(
		(i) => i.id === live.id,
	);
	assert.equal(again?.isFavorite, true);
	assert.ok(again?.viewedAt);
	// archived content is gone for learners, even by its address
	await run("amina", "archive", slugs.amina, live.id);
	assert.equal(
		(await run("carol", "content", slugs.amina, live.id)).data?.r,
		null,
	);
	await run("amina", "restore", slugs.amina, live.id);
	// favorites are per person
	const forAmina = (await library("amina", slugs.amina))?.items.find(
		(i) => i.id === live.id,
	);
	assert.equal(forAmina?.isFavorite, false);
	assert.equal(forAmina?.viewedAt, null);
});

test("any one of several roles can grant managing content", async () => {
	const { item } = await create("tom", slugs.amina, {
		kind: "path",
		title: "Tom's path",
	});
	assert.equal(item.kind, "path");
	assert.equal((await library("tom", slugs.amina))?.canManage, true);
});

test("folders hold content and can't go inside themselves", async () => {
	const { item: outer } = await create("amina", slugs.amina, {
		kind: "folder",
		title: "Outer",
	});
	const { item: inner } = await create("amina", slugs.amina, {
		kind: "folder",
		title: "Inner",
		parentId: outer.id,
	});
	assert.equal(outer.status, "published", "folders are visible at once");
	const { item: page } = await create("amina", slugs.amina, {
		kind: "page",
		title: "Filed page",
		parentId: inner.id,
	});
	assert.equal(page.parentId, inner.id);

	const move = (id: string, parentId: string | null) =>
		gql(
			"amina",
			`mutation ($slug: String!, $id: ID!, $parentId: ID) { updateContent(slug: $slug, id: $id, input: { parentId: $parentId }) { parentId } }`,
			{ slug: slugs.amina, id, parentId },
		);
	assert.equal(code(await move(outer.id, outer.id)), "BAD_USER_INPUT");
	assert.equal(code(await move(outer.id, inner.id)), "BAD_USER_INPUT");
	assert.equal(
		code(await move(inner.id, page.id)),
		"BAD_USER_INPUT",
		"only into folders",
	);
	const top = await move(page.id, null);
	assert.equal((top.data?.updateContent as Item | undefined)?.parentId, null);
});

test("archived content leaves the library, comes back, and only then can be deleted", async () => {
	const { item } = await create("amina", slugs.amina, {
		kind: "wiki",
		title: "Old wiki",
	});
	assert.equal(
		code(await run("amina", "delete", slugs.amina, item.id)),
		"FORBIDDEN",
	);

	await run("amina", "archive", slugs.amina, item.id);
	assert.ok(
		!(await library("amina", slugs.amina))?.items.some((i) => i.id === item.id),
	);
	assert.ok(
		(await library("amina", slugs.amina, true))?.items.some(
			(i) => i.id === item.id,
		),
	);

	await run("amina", "restore", slugs.amina, item.id);
	assert.ok(
		(await library("amina", slugs.amina))?.items.some((i) => i.id === item.id),
	);

	await run("amina", "archive", slugs.amina, item.id);
	assert.equal(
		(await run("amina", "delete", slugs.amina, item.id)).data?.r,
		true,
	);
	assert.equal(
		(await run("amina", "content", slugs.amina, item.id)).data?.r,
		null,
	);
});

test("a template is copied into a new draft; other content into a copy", async () => {
	const { item: template } = await create("amina", slugs.amina, {
		kind: "course",
		title: "Safety course",
		isTemplate: true,
	});
	await run("amina", "publish", slugs.amina, template.id);
	const used = (await run("amina", "duplicate", slugs.amina, template.id)).data
		?.r as Item;
	assert.equal(used.title, "Safety course");
	assert.equal(used.status, "draft");
	assert.equal(used.isTemplate, false);

	const copy = (await run("amina", "duplicate", slugs.amina, used.id)).data
		?.r as Item;
	assert.equal(copy.title, "Copy of Safety course");
});

test("bad input is refused with a reason", async () => {
	const blank = await create("amina", slugs.amina, {
		kind: "page",
		title: "   ",
	});
	assert.equal(code(blank.result), "BAD_USER_INPUT");
	assert.equal(blank.result.errors?.[0]?.message, "Give it a title.");
	const long = await create("amina", slugs.amina, {
		kind: "page",
		title: "x".repeat(201),
	});
	assert.equal(code(long.result), "BAD_USER_INPUT");
});
