import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { organization, session, user } from "@ekra/db";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db.ts";
import { env } from "../env.ts";
import { call, cookieFrom, linkInLatestEmail, post } from "../test-helpers.ts";

const stamp = Date.now();
const people = {
	amina: { email: `amina-${stamp}@test.ekra`, slug: `amina-org-${stamp}` },
	brian: { email: `brian-${stamp}@test.ekra`, slug: `brian-org-${stamp}` },
};
const cookies: Record<string, string> = {};
const orgIds: Record<string, string> = {};

async function signUpWithOrg(name: keyof typeof people) {
	const { email, slug } = people[name];
	await post("/api/auth/sign-in/magic-link", { email, callbackURL: "/" });
	const cookie = cookieFrom(await call(linkInLatestEmail(email)));
	const created = await post(
		"/api/auth/organization/create",
		{ name: `${name}'s school`, slug },
		cookie,
	);
	orgIds[name] = ((await created.json()) as { id: string }).id;
	cookies[name] = cookie;
}

const activeOrganization = async (cookie: string) =>
	(await (
		await post(
			"/api/graphql",
			{ query: "{ organization { role organization { id name } } }" },
			cookie,
		)
	).json()) as {
		data?: {
			organization: {
				role: string;
				organization: { id: string; name: string };
			};
		} | null;
		errors?: { message: string; extensions?: { code?: string } }[];
	};

before(async () => {
	await signUpWithOrg("amina");
	await signUpWithOrg("brian");
});

after(async () => {
	await db
		.delete(organization)
		.where(inArray(organization.slug, [people.amina.slug, people.brian.slug]));
	await db
		.delete(user)
		.where(inArray(user.email, [people.amina.email, people.brian.email]));
});

test("each person sees their own organization and role", async () => {
	const { data } = await activeOrganization(cookies.brian ?? "");
	assert.equal(data?.organization.organization.id, orgIds.brian);
	assert.equal(data?.organization.role, "owner");
});

test("switching to someone else's organization is refused", async () => {
	const res = await post(
		"/api/auth/organization/set-active",
		{ organizationId: orgIds.amina },
		cookies.brian,
	);
	assert.equal(res.status, 403);
	// Better Auth also clears the session's organization on a refused switch: nothing of Amina's comes back
	const body = await activeOrganization(cookies.brian ?? "");
	assert.notEqual(body.data?.organization.organization.id, orgIds.amina);
	assert.doesNotMatch(JSON.stringify(body), /amina/i);
});

test("a session pointing at another organization gets nothing from it", async () => {
	// back in his own organization first
	await post(
		"/api/auth/organization/set-active",
		{ organizationId: orgIds.brian },
		cookies.brian,
	);
	assert.equal(
		(await activeOrganization(cookies.brian ?? "")).data?.organization
			.organization.id,
		orgIds.brian,
	);
	// as if the session row were tampered with: Brian's session says he works in Amina's organization
	const token = decodeURIComponent(
		cookies.brian?.match(/session_token=([^;]+)/)?.[1] ?? "",
	).split(".")[0];
	await db
		.update(session)
		.set({ activeOrganizationId: orgIds.amina })
		.where(eq(session.token, token ?? ""));

	const body = await activeOrganization(cookies.brian ?? "");
	assert.equal(body.errors?.[0]?.extensions?.code, "FORBIDDEN");
	assert.doesNotMatch(JSON.stringify(body), /amina/i);
});

test("signed out, there is no organization", async () => {
	const body = await activeOrganization("");
	assert.equal(body.errors?.[0]?.extensions?.code, "FORBIDDEN");
});

test("certificates are only allowed for the app and existing organizations", async () => {
	const host = new URL(env.BETTER_AUTH_URL).hostname;
	const allowed = async (domain: string) =>
		(await call(`/api/domains/allowed?domain=${encodeURIComponent(domain)}`))
			.status;
	assert.equal(await allowed(host), 200);
	assert.equal(await allowed(`${people.amina.slug}.${host}`), 200);
	assert.equal(await allowed(`nobody-${stamp}.${host}`), 404);
	assert.equal(await allowed("evil.example"), 404);
	assert.equal(await allowed(`x.${people.amina.slug}.${host}`), 404);
});
