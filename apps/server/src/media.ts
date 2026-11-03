import { createHmac, timingSafeEqual } from "node:crypto";
import {
	generateId,
	lesson,
	mediaAsset,
	organization,
	withOrg,
} from "@ekra/db";
import { ImageError, processImage } from "@ekra/media";
import { createStorage } from "@ekra/storage";
import { eq } from "drizzle-orm";
import { createError } from "evlog";
import type { EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { auth } from "./auth/index.ts";
import { canManageContent } from "./auth/permissions.ts";
import { db, notify } from "./db.ts";
import { env } from "./env.ts";
import { activeOrg, orgBySlug } from "./graphql/tenant.ts";

/** The biggest picture someone may upload. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** The size pages show by default (the editor's image `src`); others are offered through srcset. */
const DEFAULT_WIDTH = 1280;

export const storage = createStorage({
	endpoint: env.S3_ENDPOINT,
	region: env.S3_REGION,
	bucket: env.S3_BUCKET,
	accessKey: env.S3_ACCESS_KEY,
	secretKey: env.S3_SECRET_KEY,
});
let bucket: Promise<void> | undefined;
const bucketReady = () => {
	bucket ??= storage.ensureBucket().catch((error: unknown) => {
		bucket = undefined;
		throw error;
	});
	return bucket;
};

const ID = /^[A-Za-z0-9]{16}$/;
// no file extension in the address: dev servers and proxies treat ".webp" paths as static files
const IMAGE = /^(\d{1,4})-(webp|avif)$/;
// a video's files, as the worker names them (packages/media/src/video.ts)
const VIDEO = /^(?:(?:master|\d{3,4}p)-m3u8|\d{3,4}p_\d{3,5}-ts|poster-webp)$/;
const key = (orgId: string, mediaId: string, file: string) =>
	`media/${orgId}/${mediaId}/${file}`;

/**
 * Pictures: POST /api/media?org=<slug> takes an upload (field "file") from someone who manages content, runs it
 * through the image pipeline and keeps only the sizes it made. GET /api/media/<org>/<id>/<width>-<webp|avif>
 * (e.g. 1280-webp) serves one of them to members of that organization.
 * shortcut: pictures nobody uses any more stay in storage; a cleanup job comes with the worker (Phase 4).
 */
export const media = new Hono<EvlogVariables>();

media.post(
	"/",
	bodyLimit({
		maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
		onError: () => {
			throw createError({
				message: "That file is too big. Pictures can be up to 20 MB.",
				status: 413,
			});
		},
	}),
	async (c) => {
		const session = await auth.api.getSession({ headers: c.req.raw.headers });
		if (!session) throw createError({ message: "Sign in first.", status: 401 });
		const org = await orgBySlug({ session }, c.req.query("org") ?? "").catch(
			() => {
				throw createError({
					message: "Choose an organization you belong to.",
					status: 403,
				});
			},
		);
		if (!canManageContent(org.role))
			throw createError({
				message: "Only owners, admins and trainers can upload pictures.",
				status: 403,
			});
		const file = (await c.req.parseBody()).file;
		if (!(file instanceof File) || !file.size)
			throw createError({
				message: "Choose a picture to upload.",
				status: 400,
			});

		const picture = await processImage(
			Buffer.from(await file.arrayBuffer()),
		).catch((error: unknown) => {
			if (error instanceof ImageError)
				throw createError({ message: error.message, status: 400 });
			throw error;
		});
		const id = generateId();
		await bucketReady();
		await Promise.all(
			picture.files.map((f) =>
				storage.put(key(org.id, id, f.name), f.body, f.type),
			),
		);
		await withOrg(db, org.id, (tx) =>
			tx.insert(mediaAsset).values({
				id,
				orgId: org.id,
				width: picture.width,
				height: picture.height,
				placeholder: picture.placeholder,
				files: picture.files.map(({ name, type, width }) => ({
					name,
					type,
					width,
				})),
				createdBy: session.user.id,
			}),
		);
		c.get("log").set({ media: { id, files: picture.files.length } });

		const webps = picture.files.filter((f) => f.name.endsWith(".webp"));
		const shown =
			webps.filter((f) => f.width <= DEFAULT_WIDTH).at(-1) ?? webps[0];
		return c.json({
			id,
			src: `/api/media/${org.id}/${id}/${shown?.width}-webp`,
			width: picture.width,
			height: picture.height,
			placeholder: picture.placeholder,
			// every stored width, smallest first (the same in WebP and, for still pictures, AVIF)
			widths: webps.map((f) => f.width),
		});
	},
);

/** The biggest video someone may upload, and the size of each part it's sent in. */
export const MAX_VIDEO_BYTES = 5 * 1024 ** 3;
export const PART_BYTES = 8 * 1024 * 1024;
/** Postgres channel the worker listens on, so a finished upload is processed at once. */
export const JOBS_CHANNEL = "ekra_jobs";

/** The organization (by ?org=) and its video, for someone who manages content; else a refusal. */
async function managedVideo(
	c: { req: { raw: Request; query: (k: string) => string | undefined } },
	id: string,
) {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) throw createError({ message: "Sign in first.", status: 401 });
	const org = await orgBySlug({ session }, c.req.query("org") ?? "").catch(
		() => {
			throw createError({
				message: "Choose an organization you belong to.",
				status: 403,
			});
		},
	);
	if (!canManageContent(org.role))
		throw createError({
			message: "Only owners, admins and trainers can upload videos.",
			status: 403,
		});
	const [video] = ID.test(id)
		? await withOrg(db, org.id, (tx) =>
				tx.select().from(mediaAsset).where(eq(mediaAsset.id, id)),
			)
		: [];
	if (video?.kind !== "video")
		throw createError({ message: "That upload doesn't exist.", status: 404 });
	return { org, video };
}

/**
 * Videos upload through the API in parts (storage stays private; a failed part is simply sent again):
 * POST /videos?org=&lesson= starts one, PUT /videos/:id/parts/:n?org= sends part n, POST
 * /videos/:id/complete?org= finishes it and hands it to the worker (apps/worker) for processing; DELETE
 * /videos/:id?org= cancels one not yet complete. A lesson moves to the new video only on complete.
 */
media.post("/videos", async (c) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) throw createError({ message: "Sign in first.", status: 401 });
	const org = await orgBySlug({ session }, c.req.query("org") ?? "").catch(
		() => {
			throw createError({
				message: "Choose an organization you belong to.",
				status: 403,
			});
		},
	);
	if (!canManageContent(org.role))
		throw createError({
			message: "Only owners, admins and trainers can upload videos.",
			status: 403,
		});
	const body = (await c.req.json().catch(() => ({}))) as {
		size?: unknown;
		type?: unknown;
	};
	const size = Number(body.size);
	if (!Number.isInteger(size) || size <= 0)
		throw createError({ message: "Choose a video to upload.", status: 400 });
	if (size > MAX_VIDEO_BYTES)
		throw createError({
			message: "That video is too big. Videos can be up to 5 GB.",
			status: 413,
		});
	const lessonId = c.req.query("lesson");
	const parts = Math.ceil(size / PART_BYTES);
	const id = generateId();
	const originalKey = key(org.id, id, "original");
	await bucketReady();
	const uploadId = await storage.startMultipart(
		originalKey,
		"application/octet-stream",
	);
	await withOrg(db, org.id, async (tx) => {
		if (lessonId) {
			const [found] = await tx
				.select({ id: lesson.id })
				.from(lesson)
				.where(eq(lesson.id, lessonId));
			if (!found)
				throw createError({
					message: "That lesson doesn't exist.",
					status: 404,
				});
		}
		await tx.insert(mediaAsset).values({
			id,
			orgId: org.id,
			kind: "video",
			status: "uploading",
			originalKey,
			uploadId,
			uploadParts: parts,
			lessonId: lessonId || null,
			createdBy: session.user.id,
		});
	});
	c.get("log").set({ media: { id, kind: "video", size } });
	return c.json({
		id,
		partBytes: PART_BYTES,
		parts,
	});
});

media.put(
	"/videos/:id/parts/:part",
	bodyLimit({
		maxSize: PART_BYTES,
		onError: () => {
			throw createError({
				message: "Send the video in 8 MB parts.",
				status: 413,
			});
		},
	}),
	async (c) => {
		const { video } = await managedVideo(c, c.req.param("id"));
		const part = Number(c.req.param("part"));
		if (
			!Number.isInteger(part) ||
			part < 1 ||
			part > (video.uploadParts ?? 10_000)
		)
			throw createError({
				message: "That part number isn't right.",
				status: 400,
			});
		if (video.status !== "uploading" || !video.uploadId || !video.originalKey)
			throw createError({
				message: "That upload is already finished.",
				status: 409,
			});
		const body = new Uint8Array(await c.req.arrayBuffer());
		if (!body.length)
			throw createError({ message: "That part is empty.", status: 400 });
		const etag = await storage.uploadPart(
			video.originalKey,
			video.uploadId,
			part,
			body,
		);
		return c.json({ part, etag });
	},
);

media.post("/videos/:id/complete", async (c) => {
	const { org, video } = await managedVideo(c, c.req.param("id"));
	if (video.status !== "uploading" || !video.uploadId || !video.originalKey)
		throw createError({
			message: "That upload is already finished.",
			status: 409,
		});
	const body = (await c.req.json().catch(() => ({}))) as { parts?: unknown };
	const parts = Array.isArray(body.parts)
		? body.parts.flatMap((p: { part?: unknown; etag?: unknown }) =>
				Number.isInteger(p?.part) &&
				typeof p?.etag === "string" &&
				p.etag.length < 200
					? [{ part: p.part as number, etag: p.etag }]
					: [],
			)
		: [];
	if (!parts.length)
		throw createError({ message: "No parts were sent.", status: 400 });
	await storage.completeMultipart(video.originalKey, video.uploadId, parts);
	await withOrg(db, org.id, async (tx) => {
		await tx
			.update(mediaAsset)
			.set({ status: "processing", uploadId: null, lessonId: null })
			.where(eq(mediaAsset.id, video.id));
		// only now does the lesson move to the new video; a cancelled or broken upload leaves the old one
		// shortcut: a replacement that uploads but then fails processing leaves the lesson on the failed video
		// (the trainer sees "failed" and uploads again); keep the old one until ready if that turns up in practice
		if (video.lessonId)
			await tx
				.update(lesson)
				.set({ mediaId: video.id })
				.where(eq(lesson.id, video.lessonId));
	});
	await notify(JOBS_CHANNEL, video.id);
	return c.json({ id: video.id, status: "processing" });
});

/** DELETE /videos/:id?org= cancels an upload that hasn't completed: storage drops its parts, the row goes. */
media.delete("/videos/:id", async (c) => {
	const { org, video } = await managedVideo(c, c.req.param("id"));
	if (video.status !== "uploading")
		throw createError({
			message: "That upload is already finished.",
			status: 409,
		});
	if (video.uploadId && video.originalKey)
		await storage.abortMultipart(video.originalKey, video.uploadId);
	await withOrg(db, org.id, (tx) =>
		tx.delete(mediaAsset).where(eq(mediaAsset.id, video.id)),
	);
	return c.json({ id: video.id, cancelled: true });
});

/** How long a playlist's signed segment addresses work (a long lesson is watched in one go). */
const SEGMENT_TOKEN_SECONDS = 6 * 60 * 60;
const sign = (orgId: string, mediaId: string, exp: number) =>
	createHmac("sha256", env.BETTER_AUTH_SECRET)
		.update(`media:${orgId}/${mediaId}/${exp}`)
		.digest("base64url");
/** A token for one video's segments, so each 2-second segment needn't look up the session. */
export const segmentToken = (
	orgId: string,
	mediaId: string,
	now = Date.now(),
) => {
	const exp = Math.floor(now / 1000) + SEGMENT_TOKEN_SECONDS;
	return `${exp}.${sign(orgId, mediaId, exp)}`;
};
export function segmentTokenValid(
	orgId: string,
	mediaId: string,
	token: string,
	now = Date.now(),
) {
	const [exp = "", mac = ""] = token.split(".");
	const expires = Number(exp);
	if (!Number.isInteger(expires) || expires * 1000 < now) return false;
	const want = Buffer.from(sign(orgId, mediaId, expires));
	const got = Buffer.from(mac);
	return want.length === got.length && timingSafeEqual(want, got);
}

const TYPE = (file: string) =>
	file.endsWith("-m3u8")
		? "application/vnd.apple.mpegurl"
		: file.endsWith("-ts")
			? "video/mp2t"
			: file.endsWith("-avif")
				? "image/avif"
				: "image/webp";

/** An organization's logo is public: invitations, its sign-in page and certificates show it to people outside. */
async function isOrgLogo(orgId: string, mediaId: string) {
	const [org] = await db
		.select({ logo: organization.logo })
		.from(organization)
		.where(eq(organization.id, orgId));
	return !!org?.logo?.startsWith(`/api/media/${orgId}/${mediaId}/`);
}

media.get("/:orgId/:mediaId/:file", async (c) => {
	const { orgId, mediaId, file } = c.req.param();
	const notFound = () =>
		createError({ message: "That file doesn't exist.", status: 404 });
	const picture = IMAGE.test(file);
	if (!ID.test(orgId) || !ID.test(mediaId) || !(picture || VIDEO.test(file)))
		throw notFound();
	const segment = file.endsWith("-ts");
	if (segment) {
		// segments carry their playlist's token instead of a session
		if (!segmentTokenValid(orgId, mediaId, c.req.query("t") ?? ""))
			throw createError({ message: "Open the lesson again.", status: 403 });
	} else if (!(picture && (await isOrgLogo(orgId, mediaId)))) {
		const session = await auth.api.getSession({ headers: c.req.raw.headers });
		if (!session) throw createError({ message: "Sign in first.", status: 401 });
		// another organization's file answers like one that doesn't exist
		if (!(await activeOrg(session.user.id, orgId))) throw notFound();
	}
	const stored = await storage.get(
		key(orgId, mediaId, picture ? file.replace("-", ".") : file),
	);
	if (!stored) throw notFound();
	const headers = {
		"content-type": TYPE(file),
		"x-content-type-options": "nosniff",
	};
	if (file.endsWith("-m3u8")) {
		// segment lines get a token; the playlist itself changes with it, so it's kept only briefly
		const token = segmentToken(orgId, mediaId);
		const text = (await stored.text())
			.split("\n")
			.map((line) =>
				line.endsWith("-ts") && !line.startsWith("#")
					? `${line}?t=${token}`
					: line,
			)
			.join("\n");
		return new Response(text, {
			headers: { ...headers, "cache-control": "private, max-age=300" },
		});
	}
	return new Response(stored.body, {
		headers: {
			...headers,
			// a stored file never changes, so browsers keep it; private: only this signed-in person's browser
			"cache-control": "private, max-age=31536000, immutable",
		},
	});
});
