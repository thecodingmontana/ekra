import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { member, organization, user } from "@ekra/db";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { app } from "./app.ts";
import { db } from "./db.ts";
import {
	call,
	cookieFrom,
	linkInLatestEmail,
	ORIGIN,
	post,
} from "./test-helpers.ts";

const stamp = Date.now();
const emailOf = (name: string) => `media-${name}-${stamp}@test.ekra`;
const slugs = { amina: `media-amina-${stamp}`, brian: `media-brian-${stamp}` };
const cookies: Record<string, string> = {};

before(async () => {
	for (const name of ["amina", "brian", "carol"]) {
		await post("/api/auth/sign-in/magic-link", {
			email: emailOf(name),
			callbackURL: "/",
		});
		cookies[name] = cookieFrom(await call(linkInLatestEmail(emailOf(name))));
	}
	for (const name of ["amina", "brian"] as const)
		await post(
			"/api/auth/organization/create",
			{ name: `${name}'s school`, slug: slugs[name] },
			cookies[name],
		);
	// Carol learns in Amina's organization
	const [org] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, slugs.amina));
	const [carol] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, emailOf("carol")));
	await db.insert(member).values({
		organizationId: org?.id ?? "",
		userId: carol?.id ?? "",
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

const upload = (who: string, slug: string, file: Blob, name = "photo.png") => {
	const form = new FormData();
	form.append("file", file, name);
	return app.request(`/api/media?org=${slug}`, {
		method: "POST",
		headers: { cookie: cookies[who] ?? "", origin: ORIGIN },
		body: form,
	});
};
const fetchMedia = (path: string, who?: string) =>
	app.request(path, {
		headers: { cookie: who ? (cookies[who] ?? "") : "", origin: ORIGIN },
	});
const png = async (width: number, height: number) =>
	new Blob([
		new Uint8Array(
			await sharp({
				create: { width, height, channels: 4, background: "#00df82" },
			})
				.png()
				.toBuffer(),
		),
	]);

test("a trainer's picture is stored as sizes and served to members only", async () => {
	const res = await upload("amina", slugs.amina, await png(1600, 900));
	assert.equal(res.status, 200, await res.clone().text());
	const body = (await res.json()) as {
		src: string;
		width: number;
		height: number;
		placeholder: string;
	};
	assert.match(
		body.src,
		/^\/api\/media\/[A-Za-z0-9]{16}\/[A-Za-z0-9]{16}\/1280-webp$/,
	);
	assert.deepEqual([body.width, body.height], [1600, 900]);
	assert.deepEqual(
		(body as unknown as { widths: number[] }).widths,
		[320, 640, 1280, 1600],
	);
	assert.match(body.placeholder, /^data:image\/webp;base64,/);

	const shown = await fetchMedia(body.src, "amina");
	assert.equal(shown.status, 200);
	assert.equal(shown.headers.get("content-type"), "image/webp");
	assert.match(shown.headers.get("cache-control") ?? "", /private/);
	const meta = await sharp(Buffer.from(await shown.arrayBuffer())).metadata();
	assert.deepEqual([meta.format, meta.width], ["webp", 1280]);
	assert.equal(
		(await fetchMedia(body.src.replace("1280-webp", "640-avif"), "carol"))
			.status,
		200,
		"a learner in the organization sees it",
	);

	assert.equal((await fetchMedia(body.src)).status, 401, "signed out");
	assert.equal(
		(await fetchMedia(body.src, "brian")).status,
		404,
		"another organization's picture answers like a missing one",
	);
	assert.equal(
		(await fetchMedia(body.src.replace("1280-webp", "9999-webp"), "amina"))
			.status,
		404,
	);
	assert.equal(
		(await fetchMedia("/api/media/x/y/..%2F..%2Fsecret", "amina")).status,
		404,
	);
});

test("only people who manage content upload, into their own organization", async () => {
	assert.equal(
		(await upload("carol", slugs.amina, await png(10, 10))).status,
		403,
		"learner",
	);
	assert.equal(
		(await upload("brian", slugs.amina, await png(10, 10))).status,
		403,
		"another organization",
	);
	assert.equal(
		(await upload("", slugs.amina, await png(10, 10))).status,
		401,
		"signed out",
	);
});

test("files that aren't pictures, and huge files, are refused with a reason", async () => {
	const fake = await upload(
		"amina",
		slugs.amina,
		new Blob(["#!/bin/sh\nrm -rf /"]),
		"cute-cat.png",
	);
	assert.equal(fake.status, 400);
	assert.match(((await fake.json()) as { message: string }).message, /picture/);

	const huge = await upload(
		"amina",
		slugs.amina,
		new Blob([new Uint8Array(21 * 1024 * 1024)]),
	);
	assert.equal(huge.status, 413);
});
