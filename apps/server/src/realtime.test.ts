import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { organization, user } from "@ekra/db";
import { inArray } from "drizzle-orm";
import { parse } from "graphql";
import { app } from "./app.ts";
import { closeDb, db } from "./db.ts";
import { closeStreams, mutationSlugs } from "./realtime.ts";
import {
	call,
	cookieFrom,
	linkInLatestEmail,
	ORIGIN,
	post,
} from "./test-helpers.ts";

test("a change is announced to the organizations its mutation names; reads announce nothing", () => {
	const slugs = (query: string, variables?: Record<string, unknown>) =>
		mutationSlugs(parse(query), variables).sort();
	assert.deepEqual(slugs(`mutation { deleteContent(slug: "acme", id: "1") }`), [
		"acme",
	]);
	assert.deepEqual(
		slugs(`mutation($s: String!) { deleteContent(slug: $s, id: "1") }`, {
			s: "beta",
		}),
		["beta"],
	);
	assert.deepEqual(
		slugs(
			`mutation($s: String!) { a: deleteContent(slug: $s, id: "1") b: deleteContent(slug: "acme", id: "2") }`,
			{ s: "beta" },
		),
		["acme", "beta"],
	);
	assert.deepEqual(slugs(`query { library(slug: "acme") { canManage } }`), []);
});

const stamp = Date.now();
const people = {
	amina: { email: `rt-amina-${stamp}@test.ekra`, slug: `rt-amina-${stamp}` },
	brian: { email: `rt-brian-${stamp}@test.ekra`, slug: `rt-brian-${stamp}` },
};
const cookies: Record<string, string> = {};

before(async () => {
	for (const name of ["amina", "brian"] as const) {
		const { email, slug } = people[name];
		await post("/api/auth/sign-in/magic-link", { email, callbackURL: "/" });
		cookies[name] = cookieFrom(await call(linkInLatestEmail(email)));
		await post(
			"/api/auth/organization/create",
			{ name: `${name}'s school`, slug },
			cookies[name],
		);
	}
});

after(async () => {
	await db
		.delete(organization)
		.where(inArray(organization.slug, [people.amina.slug, people.brian.slug]));
	await db
		.delete(user)
		.where(inArray(user.email, [people.amina.email, people.brian.email]));
	// the live-updates listener holds a connection open; close it so the test process can end
	await closeDb();
});

const events = (slug: string, cookie = "") =>
	app.request(`/api/events?org=${slug}`, {
		headers: { cookie, origin: ORIGIN },
	});

/** Reads a live stream's events as they come. */
function reader(res: Response) {
	const it = (res.body as ReadableStream<Uint8Array>).getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	return {
		async next(timeoutMs = 5000) {
			const deadline = Date.now() + timeoutMs;
			while (!buffer.includes("\n\n")) {
				const chunk = await Promise.race([
					it.read(),
					new Promise<never>((_, reject) =>
						setTimeout(
							() => reject(new Error("no event in time")),
							deadline - Date.now(),
						),
					),
				]);
				if (chunk.done) throw new Error("stream ended");
				buffer += decoder.decode(chunk.value, { stream: true });
			}
			const end = buffer.indexOf("\n\n");
			const block = buffer.slice(0, end);
			buffer = buffer.slice(end + 2);
			const field = (name: string) =>
				block.match(new RegExp(`^${name}: ?(.*)$`, "m"))?.[1];
			return { event: field("event"), data: field("data") };
		},
		cancel: () => it.cancel(),
	};
}

const createIn = (who: "amina" | "brian", tab: string) =>
	app.request("/api/graphql", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			cookie: cookies[who] ?? "",
			origin: ORIGIN,
			"x-ekra-tab": tab,
		},
		body: JSON.stringify({
			query: `mutation ($slug: String!) { createContent(slug: $slug, input: { kind: page, title: "Live" }) { id } }`,
			variables: { slug: people[who].slug },
		}),
	});

test("live updates need sign-in and membership", async () => {
	assert.equal((await events(people.amina.slug)).status, 401);
	assert.equal(
		(await events(people.amina.slug, cookies.brian)).status,
		403,
		"another organization's updates are refused",
	);
});

test("a change reaches the people viewing that organization, and only them", async () => {
	const amina = reader(await events(people.amina.slug, cookies.amina));
	const brian = reader(await events(people.brian.slug, cookies.brian));
	try {
		assert.equal((await amina.next()).event, "ready");
		assert.equal((await brian.next()).event, "ready");

		assert.equal((await createIn("amina", "tab-a")).status, 200);
		const seen = await amina.next();
		assert.equal(seen.event, "changed");
		assert.deepEqual(JSON.parse(seen.data ?? "{}"), { from: "tab-a" });

		// Brian's first change event is his own: Amina's never reached him
		assert.equal((await createIn("brian", "tab-b")).status, 200);
		const his = await brian.next();
		assert.deepEqual(JSON.parse(his.data ?? "{}"), { from: "tab-b" });
	} finally {
		await amina.cancel();
		await brian.cancel();
	}
});

test("shutting down ends open streams, so the server can stop", async () => {
	const amina = reader(await events(people.amina.slug, cookies.amina));
	assert.equal((await amina.next()).event, "ready");
	closeStreams();
	await assert.rejects(amina.next(2000), /stream ended/);
});
