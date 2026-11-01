import { generateId, mediaAsset, withOrg } from "@ekra/db";
import { ImageError, processImage } from "@ekra/media";
import { createStorage } from "@ekra/storage";
import { createError } from "evlog";
import type { EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { auth } from "./auth/index.ts";
import { canManageContent } from "./auth/permissions.ts";
import { db } from "./db.ts";
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
const FILE = /^(\d{1,4})-(webp|avif)$/;
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

media.get("/:orgId/:mediaId/:file", async (c) => {
	const { orgId, mediaId, file } = c.req.param();
	const notFound = () =>
		createError({ message: "That picture doesn't exist.", status: 404 });
	if (!ID.test(orgId) || !ID.test(mediaId) || !FILE.test(file))
		throw notFound();
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) throw createError({ message: "Sign in first.", status: 401 });
	// another organization's picture answers like one that doesn't exist
	if (!(await activeOrg(session.user.id, orgId))) throw notFound();
	const stored = await storage.get(key(orgId, mediaId, file.replace("-", ".")));
	if (!stored) throw notFound();
	return new Response(stored.body, {
		headers: {
			"content-type": file.endsWith("-avif") ? "image/avif" : "image/webp",
			// a stored size never changes, so browsers keep it; private: only this signed-in person's browser
			"cache-control": "private, max-age=31536000, immutable",
			"x-content-type-options": "nosniff",
		},
	});
});
