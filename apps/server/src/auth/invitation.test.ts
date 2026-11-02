import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { member, organization, user } from "@ekra/db";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db.ts";
import {
	call,
	cookieFrom,
	emailsTo,
	linkInLatestEmail,
	post,
} from "../test-helpers.ts";

const stamp = Date.now();
const emailOf = (name: string) => `invite-${name}-${stamp}@test.ekra`;
const slug = `invite-${stamp}`;
const cookies: Record<string, string> = {};
let orgId = "";

async function signIn(name: string) {
	await post("/api/auth/sign-in/magic-link", {
		email: emailOf(name),
		callbackURL: "/",
	});
	cookies[name] = cookieFrom(await call(linkInLatestEmail(emailOf(name))));
}

const invite = (who: string, email: string, role: string) =>
	post(
		"/api/auth/organization/invite-member",
		{ email, role, organizationId: orgId },
		cookies[who],
	);

before(async () => {
	await signIn("tara");
	await post(
		"/api/auth/organization/create",
		{ name: "Northwind", slug },
		cookies.tara,
	);
	const [org] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, slug));
	orgId = org?.id ?? "";
});

after(async () => {
	await db.delete(organization).where(eq(organization.slug, slug));
	await db.delete(user).where(
		inArray(
			user.email,
			["tara", "leo", "mia"].map((n) => emailOf(n)),
		),
	);
});

test("an invited learner gets an email with the invitation page, accepts, and joins as a learner", async () => {
	const res = await invite("tara", emailOf("leo"), "learner");
	assert.equal(res.status, 200, await res.clone().text());
	const { id } = (await res.json()) as { id: string };

	const sent = emailsTo(emailOf("leo")).at(-1);
	assert.match(sent?.subject ?? "", /invited you to Northwind on Ekra/);
	assert.match(sent?.text ?? "", new RegExp(`/invite/${id}`));
	assert.match(sent?.text ?? "", /as a learner/);

	await signIn("leo");
	const accepted = await post(
		"/api/auth/organization/accept-invitation",
		{ invitationId: id },
		cookies.leo,
	);
	assert.equal(accepted.status, 200, await accepted.clone().text());
	const [u] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, emailOf("leo")));
	const [m] = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(eq(member.organizationId, orgId), eq(member.userId, u?.id ?? "")),
		);
	assert.equal(m?.role, "learner");
});

test("only the invited address can accept, and learners can't invite", async () => {
	const res = await invite("tara", emailOf("mia"), "trainer");
	const { id } = (await res.json()) as { id: string };
	// leo is signed in, but the invitation is for mia
	const wrong = await post(
		"/api/auth/organization/accept-invitation",
		{ invitationId: id },
		cookies.leo,
	);
	assert.notEqual(wrong.status, 200);

	const byLearner = await invite("leo", `someone-${stamp}@test.ekra`, "admin");
	assert.notEqual(byLearner.status, 200);
});
