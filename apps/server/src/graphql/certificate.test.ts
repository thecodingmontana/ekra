import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { member, organization, user } from "@ekra/db";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db.ts";
import { call, cookieFrom, linkInLatestEmail, post } from "../test-helpers.ts";

const stamp = Date.now();
const emailOf = (name: string) => `cert-${name}-${stamp}@test.ekra`;
const slugs = { amina: `cert-amina-${stamp}`, brian: `cert-brian-${stamp}` };
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
	let carol = "";
	for (const name of ["amina", "brian", "carol"]) {
		await post("/api/auth/sign-in/magic-link", {
			email: emailOf(name),
			callbackURL: "/",
		});
		cookies[name] = cookieFrom(await call(linkInLatestEmail(emailOf(name))));
		if (name === "carol")
			carol =
				(
					await db
						.select({ id: user.id })
						.from(user)
						.where(eq(user.email, emailOf(name)))
				)[0]?.id ?? "";
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
	await db
		.insert(member)
		.values({ organizationId: org?.id ?? "", userId: carol, role: "learner" });
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
const CLAIM =
	"mutation ($slug: String!, $c: ID!) { r: claimCertificate(slug: $slug, contentId: $c) { id name title issuedAt } }";

test("a certificate comes after finishing, once, and anyone can check it by its code", async () => {
	const course = data<{ id: string }>(
		await gql(
			"amina",
			'mutation ($slug: String!) { r: createContent(slug: $slug, input: { kind: course, title: "Safety" }) { id } }',
			{ slug: S },
		),
	).id;
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
	data(
		await gql(
			"amina",
			"mutation ($slug: String!, $id: ID!) { r: updateContent(slug: $slug, id: $id, input: { status: published }) { id } }",
			{ slug: S, id: course },
		),
	);

	assert.equal(
		code(await gql("carol", CLAIM, { slug: S, c: course })),
		"BAD_USER_INPUT",
		"not finished yet",
	);
	data(
		await gql(
			"carol",
			"mutation ($slug: String!, $id: ID!) { r: completeLesson(slug: $slug, id: $id, complete: true) { id } }",
			{ slug: S, id: lesson },
		),
	);
	const cert = data<{ id: string; name: string; title: string }>(
		await gql("carol", CLAIM, { slug: S, c: course }),
	);
	assert.equal(cert.title, "Safety");
	assert.equal(
		data<{ id: string }>(await gql("carol", CLAIM, { slug: S, c: course })).id,
		cert.id,
		"the same certificate the second time",
	);
	const mine = data<{ id: string }[]>(
		await gql(
			"carol",
			"query ($slug: String!) { r: myCertificates(slug: $slug) { id } }",
			{ slug: S },
		),
	);
	assert.deepEqual(
		mine.map((c) => c.id),
		[cert.id],
	);

	// the public check, signed out
	const res = await call(`/api/certificates/${cert.id}`);
	assert.equal(res.status, 200);
	const shown = (await res.json()) as {
		name: string;
		title: string;
		organization: { name: string };
	};
	assert.deepEqual(
		[shown.name, shown.title, shown.organization.name],
		[cert.name, "Safety", "amina's school"],
	);
	assert.equal((await call("/api/certificates/AAAAAAAAAAAAAAAA")).status, 404);
	assert.equal((await call("/api/certificates/bad-code")).status, 404);

	assert.equal(
		code(await gql("brian", CLAIM, { slug: slugs.brian, c: course })),
		"NOT_FOUND",
		"another organization's course",
	);
});
