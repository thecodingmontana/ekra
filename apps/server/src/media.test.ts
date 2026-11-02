import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mediaAsset, member, organization, user } from "@ekra/db";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { app } from "./app.ts";
import { db } from "./db.ts";
import { storage } from "./media.ts";
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

const json = (who: string, path: string, body: unknown) =>
	app.request(path, {
		method: "POST",
		headers: {
			cookie: cookies[who] ?? "",
			origin: ORIGIN,
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
	});

test("a video uploads in parts, then waits for the worker", async () => {
	const start = await json("amina", `/api/media/videos?org=${slugs.amina}`, {
		size: 9 * 1024 * 1024,
		type: "video/mp4",
	});
	assert.equal(start.status, 200, await start.clone().text());
	const { id, partBytes, parts } = (await start.json()) as {
		id: string;
		partBytes: number;
		parts: number;
	};
	assert.deepEqual([partBytes, parts], [8 * 1024 * 1024, 2]);

	const sent: { part: number; etag: string }[] = [];
	for (const [part, size] of [
		[1, partBytes],
		[2, 1024 * 1024],
	] as const) {
		const res = await app.request(
			`/api/media/videos/${id}/parts/${part}?org=${slugs.amina}`,
			{
				method: "PUT",
				headers: { cookie: cookies.amina ?? "", origin: ORIGIN },
				body: new Uint8Array(size).fill(part),
			},
		);
		assert.equal(res.status, 200, await res.clone().text());
		sent.push((await res.json()) as { part: number; etag: string });
	}
	const done = await json(
		"amina",
		`/api/media/videos/${id}/complete?org=${slugs.amina}`,
		{ parts: sent },
	);
	assert.equal(done.status, 200, await done.clone().text());
	const [row] = await db.select().from(mediaAsset).where(eq(mediaAsset.id, id));
	assert.equal(row?.status, "processing");
	assert.equal(
		(
			await json(
				"amina",
				`/api/media/videos/${id}/complete?org=${slugs.amina}`,
				{ parts: sent },
			)
		).status,
		409,
		"finished once",
	);
	// the worker isn't running in tests: take it off the queue
	await db.delete(mediaAsset).where(eq(mediaAsset.id, id));
});

test("only people who manage content upload videos, of a sane size", async () => {
	assert.equal(
		(await json("carol", `/api/media/videos?org=${slugs.amina}`, { size: 10 }))
			.status,
		403,
	);
	assert.equal(
		(await json("brian", `/api/media/videos?org=${slugs.amina}`, { size: 10 }))
			.status,
		403,
	);
	assert.equal(
		(
			await json("amina", `/api/media/videos?org=${slugs.amina}`, {
				size: 6 * 1024 ** 3,
			})
		).status,
		413,
	);
	assert.equal(
		(
			await json("amina", `/api/media/videos?org=${slugs.amina}`, {
				size: "lots",
			})
		).status,
		400,
	);
});

test("a playlist signs its segments; segments need that signature, not a session", async () => {
	const [org] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, slugs.amina));
	const orgId = org?.id ?? "";
	const id = "VIDEOTESTAAAAAAA";
	const put = (name: string, body: string) =>
		storage.put(
			`media/${orgId}/${id}/${name}`,
			new TextEncoder().encode(body),
			"text/plain",
		);
	await put(
		"360p-m3u8",
		"#EXTM3U\n#EXTINF:2.0,\n360p_000-ts\n#EXT-X-ENDLIST\n",
	);
	await put("360p_000-ts", "segment bytes");
	const base = `/api/media/${orgId}/${id}`;

	const playlist = await fetchMedia(`${base}/360p-m3u8`, "carol");
	assert.equal(playlist.status, 200);
	assert.equal(
		playlist.headers.get("content-type"),
		"application/vnd.apple.mpegurl",
	);
	const segmentLine = (await playlist.text())
		.split("\n")
		.find((l) => l.startsWith("360p_000-ts"));
	assert.match(segmentLine ?? "", /^360p_000-ts\?t=\d+\.[\w-]+$/);

	const segment = await app.request(`${base}/${segmentLine}`);
	assert.equal(segment.status, 200, "no cookie needed with the signature");
	assert.equal(await segment.text(), "segment bytes");
	assert.equal(
		(await app.request(`${base}/360p_000-ts`)).status,
		403,
		"no signature",
	);
	assert.equal(
		(
			await app.request(
				`${base}/360p_000-ts?t=${segmentLine?.split("t=")[1]?.replace(/.$/, "x")}`,
			)
		).status,
		403,
		"a changed signature",
	);
	assert.equal(
		(
			await app.request(
				`/api/media/${orgId}/OTHERVIDEOAAAAAA/360p_000-ts?t=${segmentLine?.split("t=")[1]}`,
			)
		).status,
		403,
		"another video's signature",
	);
	assert.equal(
		(await fetchMedia(`${base}/360p-m3u8`, "brian")).status,
		404,
		"another organization",
	);
});
