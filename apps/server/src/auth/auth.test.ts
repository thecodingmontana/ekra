import assert from "node:assert/strict";
import { after, test } from "node:test";
import { member, organization, session, user } from "@ekra/db";
import { eq } from "drizzle-orm";
import { db } from "../db.ts";
import { env } from "../env.ts";
import {
	cookieFrom,
	linkInLatestEmail,
	call as send,
} from "../test-helpers.ts";
import { nameFromEmail } from "./name-from-email.ts";

const email = `amina.k-${Date.now()}@test.ekra`;
const slug = `acme-${Date.now()}`;
let cookie = "";

after(async () => {
	await db.delete(organization).where(eq(organization.slug, slug));
	await db.delete(user).where(eq(user.email, email));
});

/** A browser request, with this file's session cookie once signed in. */
const call = (path: string, init: RequestInit = {}) =>
	send(path, { cookie, ...init });

const graphql = async (query: string) =>
	(await (
		await call("/api/graphql", {
			method: "POST",
			body: JSON.stringify({ query }),
		})
	).json()) as {
		data?: {
			viewer: {
				email: string;
				name: string;
				activeOrganizationId: string | null;
			} | null;
		};
	};

test("signed out, there is no viewer", async () => {
	assert.equal((await graphql("{ viewer { email } }")).data?.viewer, null);
});

test("signing in with an emailed link creates the account and a session", async () => {
	const sent = await call("/api/auth/sign-in/magic-link", {
		method: "POST",
		body: JSON.stringify({ email, callbackURL: "/" }),
	});
	assert.equal(sent.status, 200);

	const opened = await call(linkInLatestEmail(email));
	assert.equal(opened.status, 302, "the link signs in and redirects");
	cookie = cookieFrom(opened);
	assert.match(cookie, /session_token=/);

	const viewer = (await graphql("{ viewer { email name } }")).data?.viewer;
	assert.equal(viewer?.email, email);
	assert.equal(
		viewer?.name,
		nameFromEmail(email),
		"a name is made from the email",
	);
});

test("a used sign-in link can't be used again", async () => {
	await call("/api/auth/sign-in/magic-link", {
		method: "POST",
		body: JSON.stringify({ email, callbackURL: "/" }),
	});
	const link = linkInLatestEmail(email);
	await send(link);
	const again = await send(link);
	assert.match(
		again.headers.get("location") ?? "",
		/error=/,
		"the second use is refused",
	);
});

test("creating an organization makes its creator the owner and its active organization", async () => {
	const res = await call("/api/auth/organization/create", {
		method: "POST",
		body: JSON.stringify({ name: "Acme Academy", slug, kind: "creator" }),
	});
	assert.equal(res.status, 200);
	const created = (await res.json()) as { id: string; kind: string };
	assert.equal(created.kind, "creator");

	const [membership] = await db
		.select()
		.from(member)
		.where(eq(member.organizationId, created.id));
	assert.equal(membership?.role, "owner");

	const viewer = (await graphql("{ viewer { activeOrganizationId } }")).data
		?.viewer;
	assert.equal(viewer?.activeOrganizationId, created.id);
});

test("the viewer lists their organizations with their role", async () => {
	const body = (await (
		await call("/api/graphql", {
			method: "POST",
			body: JSON.stringify({
				query: "{ viewer { memberships { role organization { slug kind } } } }",
			}),
		})
	).json()) as {
		data?: {
			viewer: {
				memberships: {
					role: string;
					organization: { slug: string; kind: string };
				}[];
			};
		};
	};
	assert.deepEqual(body.data?.viewer.memberships, [
		{ role: "owner", organization: { slug, kind: "creator" } },
	]);
});

test("the server refuses slugs that can't be subdomains", async () => {
	for (const bad of ["www", "Bad Slug", "ab", "-acme"]) {
		const res = await call("/api/auth/organization/create", {
			method: "POST",
			body: JSON.stringify({ name: "Nope", slug: bad }),
		});
		assert.equal(res.status, 400, bad);
	}
});

test("slugAvailable says whether an address is free", async () => {
	const available = async (s: string) => {
		const res = await call("/api/graphql", {
			method: "POST",
			body: JSON.stringify({
				query: "query ($s: String!) { slugAvailable(slug: $s) }",
				variables: { s },
			}),
		});
		return ((await res.json()) as { data?: { slugAvailable: boolean } }).data
			?.slugAvailable;
	};
	assert.equal(await available(slug), false, "taken by the test organization");
	assert.equal(await available(`free-${Date.now()}`), true);
	assert.equal(await available("www"), false, "reserved");
});

test("the visitor's IP is the last forwarded address that isn't our proxy", async () => {
	const signInFrom = async (forwardedFor: string) => {
		await call("/api/auth/sign-in/magic-link", {
			method: "POST",
			body: JSON.stringify({ email, callbackURL: "/" }),
		});
		const opened = await call(linkInLatestEmail(email), {
			headers: { "x-forwarded-for": forwardedFor },
		});
		const token = opened.headers
			.getSetCookie()
			.join(";")
			.match(/session_token=([^.;]+)/)?.[1];
		const [row] = await db
			.select({ ip: session.ipAddress })
			.from(session)
			.where(eq(session.token, token ?? ""));
		return row?.ip;
	};
	// browser → web app (loopback) → API
	assert.equal(await signInFrom("203.0.113.7, 127.0.0.1"), "203.0.113.7");
	// a browser that sends its own header can't choose its address: the web app appends the real one
	assert.equal(await signInFrom("6.6.6.6, 198.51.100.4"), "198.51.100.4");
});

test("nameFromEmail turns an address into a readable name", () => {
	assert.equal(nameFromEmail("amina.k@acme.com"), "Amina K");
	assert.equal(nameFromEmail("john_doe+lms@x.io"), "John Doe Lms");
	assert.equal(nameFromEmail("@x.io"), "New member");
});

test("organization subdomains share the sign-in; other sites are refused", async () => {
	const { host, protocol } = new URL(env.BETTER_AUTH_URL);
	// signed in (with the cookie), as a forged cross-site request would be
	const askLink = (origin: string) =>
		call("/api/auth/sign-in/magic-link", {
			method: "POST",
			headers: { origin },
			body: JSON.stringify({ email, callbackURL: "/" }),
		});
	assert.equal((await askLink(`${protocol}//acme.${host}`)).status, 200);
	assert.equal((await askLink("http://evil.example")).status, 403);

	const opened = await send(linkInLatestEmail(email));
	const cookie = opened.headers
		.getSetCookie()
		.find((c) => c.includes("session_token="));
	assert.match(
		cookie ?? "",
		new RegExp(`Domain=${new URL(env.BETTER_AUTH_URL).hostname}`, "i"),
		"the session cookie is for the app and all its subdomains",
	);
});

test("an organization's colour is one of the picker's, or refused", async () => {
	const [org] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, slug));
	const setColor = (color: unknown) =>
		call("/api/auth/organization/update", {
			method: "POST",
			body: JSON.stringify({ organizationId: org?.id, data: { color } }),
		});

	assert.equal((await setColor("#23918A")).status, 200);
	const body = (await (
		await call("/api/graphql", {
			method: "POST",
			body: JSON.stringify({
				query: "{ viewer { memberships { organization { color } } } }",
			}),
		})
	).json()) as {
		data?: { viewer: { memberships: { organization: { color: string } }[] } };
	};
	assert.equal(body.data?.viewer.memberships[0]?.organization.color, "#23918A");

	for (const bad of ["red; background:url(x)", "#000000", 7])
		assert.equal((await setColor(bad)).status, 400, String(bad));
});
