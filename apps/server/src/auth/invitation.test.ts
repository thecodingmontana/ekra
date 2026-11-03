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

const PREVIEW =
	"query ($id: ID!) { invitationPreview(id: $id) { email role inviterName forYou joinedSlug organization { name slug } } }";
type Preview = {
	email: string;
	role: string;
	inviterName: string;
	forYou: boolean;
	joinedSlug: string | null;
	organization: { name: string };
} | null;
const preview = async (who: string, id: string) =>
	(
		(await (
			await post(
				"/api/graphql",
				{ query: PREVIEW, variables: { id } },
				cookies[who],
			)
		).json()) as { data: { invitationPreview: Preview } }
	).data.invitationPreview;

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
	const before = await preview("leo", id);
	assert.equal(before?.forYou, true);
	assert.equal(before?.role, "learner");
	assert.equal(before?.organization.name, "Northwind");
	assert.equal(before?.joinedSlug, null);
	assert.ok(before?.inviterName);
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
	assert.equal(await preview("leo", id), null, "used: nothing to accept");
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
	const other = await preview("leo", id);
	assert.equal(other?.forYou, false);
	assert.equal(
		other?.email,
		emailOf("mia"),
		"says which address to sign in with",
	);
	assert.equal(other?.joinedSlug, slug, "leo is in it already");
	assert.equal(await preview("leo", "nope"), null);

	const byLearner = await invite("leo", `someone-${stamp}@test.ekra`, "admin");
	assert.notEqual(byLearner.status, 200);
});
