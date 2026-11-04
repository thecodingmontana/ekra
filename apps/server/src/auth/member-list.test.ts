import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { member, organization, user } from "@ekra/db";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db.ts";
import { call, cookieFrom, linkInLatestEmail, post } from "../test-helpers.ts";

const stamp = Date.now();
const emailOf = (name: string) => `roster-${name}-${stamp}@test.ekra`;
const slug = `roster-${stamp}`;
const cookies: Record<string, string> = {};
let orgId = "";

async function signIn(name: string) {
	await post("/api/auth/sign-in/magic-link", {
		email: emailOf(name),
		callbackURL: "/",
	});
	cookies[name] = cookieFrom(await call(linkInLatestEmail(emailOf(name))));
}

before(async () => {
	await signIn("tara");
	const res = await post(
		"/api/auth/organization/create",
		{ name: "Roster", slug },
		cookies.tara,
	);
	orgId = ((await res.json()) as { id: string }).id;
	await signIn("leo");
	const [leo] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, emailOf("leo")));
	await db
		.insert(member)
		.values({ organizationId: orgId, userId: leo?.id ?? "", role: "learner" });
	// Leo works in Roster, as he would after choosing it
	await post(
		"/api/auth/organization/set-active",
		{ organizationId: orgId },
		cookies.leo,
	);
});

after(async () => {
	await db.delete(organization).where(eq(organization.slug, slug));
	await db.delete(user).where(
		inArray(
			user.email,
			["tara", "leo"].map((n) => emailOf(n)),
		),
	);
});

const ROSTER_PATHS = [
	"list-members",
	"get-full-organization",
	"list-invitations",
] as const;
const ask = (who: string, path: string, query: string) =>
	call(`/api/auth/organization/${path}${query}`, { cookie: cookies[who] });

test("a learner can't list the organization's members or invitations, however it's named", async () => {
	for (const path of ROSTER_PATHS)
		for (const query of [
			`?organizationId=${orgId}`,
			`?organizationSlug=${slug}`,
			"",
		])
			assert.equal((await ask("leo", path, query)).status, 403, path + query);
});

test("an owner still lists members and invitations", async () => {
	for (const path of ROSTER_PATHS)
		assert.equal(
			(await ask("tara", path, `?organizationId=${orgId}`)).status,
			200,
			path,
		);
	const members = (await (
		await ask("tara", "list-members", `?organizationId=${orgId}`)
	).json()) as { members: { user: { email: string } }[] };
	assert.equal(members.members.length, 2);
});
