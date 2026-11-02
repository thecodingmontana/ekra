import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { createDb, mediaAsset } from "@ekra/db";
import { processVideo, VideoError } from "@ekra/media";
import { createStorage } from "@ekra/storage";
import { eq, sql } from "drizzle-orm";
import { createLogger } from "evlog";
import { env } from "./env.ts";

export const { db, close, listen, notify } = createDb();
export const storage = createStorage({
	endpoint: env.S3_ENDPOINT,
	region: env.S3_REGION,
	bucket: env.S3_BUCKET,
	accessKey: env.S3_ACCESS_KEY,
	secretKey: env.S3_SECRET_KEY,
});

/** Tries before a video is marked failed; each retry waits longer. */
export const MAX_ATTEMPTS = 3;
/** How long one try may hold a video before another worker may take it over (a crashed worker's job). */
const HOLD_MINUTES = 60;

type Video = typeof mediaAsset.$inferSelect;

/**
 * The next uploaded video waiting to be processed, held for this worker. SKIP LOCKED: two workers never take the
 * same one; the hold time lets a video come back if its worker died. The worker reads every organization's
 * videos, so it works as the table's owner rather than inside withOrg.
 */
export async function claimVideo(): Promise<Video | null> {
	const rows = await db.execute<{ id: string }>(sql`
		update media_asset
		set locked_until = now() + make_interval(mins => ${HOLD_MINUTES}), attempts = attempts + 1
		where id = (
			select id from media_asset
			where kind = 'video' and status = 'processing'
				and (locked_until is null or locked_until < now())
			order by updated_at
			limit 1
			for update skip locked
		)
		returning id`);
	const id = rows[0]?.id;
	if (!id) return null;
	const [video] = await db
		.select()
		.from(mediaAsset)
		.where(eq(mediaAsset.id, id));
	return video ?? null;
}

const fileKey = (v: Video, name: string) => `media/${v.orgId}/${v.id}/${name}`;

/** Tells the organization's open pages that something changed (the server forwards it; see its realtime.ts). */
const announce = (v: Video) =>
	notify("ekra_changed", JSON.stringify({ org: v.orgId, from: null }));

/** Processes one claimed video: original → HLS ladder + poster in storage → ready (or failed, or retried later). */
export async function processClaimed(video: Video) {
	const log = createLogger({ job: { name: "video.process", id: video.id } });
	const dir = await mkdtemp(join(tmpdir(), "ekra-video-"));
	try {
		if (!video.originalKey) throw new VideoError("The upload is missing.");
		const original = await storage.get(video.originalKey);
		if (!original?.body) throw new VideoError("The upload is missing.");
		const input = join(dir, "original");
		await pipeline(
			Readable.fromWeb(original.body as WebReadableStream<Uint8Array>),
			createWriteStream(input),
		);
		const out = join(dir, "out");
		await mkdir(out);
		const result = await processVideo(input, out);
		for (const f of result.files)
			await storage.put(
				fileKey(video, f.name),
				await readFile(join(out, f.name)),
				f.type,
			);
		await db
			.update(mediaAsset)
			.set({
				status: "ready",
				width: result.width,
				height: result.height,
				durationSeconds: result.durationSeconds,
				files: result.files,
				error: null,
				lockedUntil: null,
			})
			.where(eq(mediaAsset.id, video.id));
		log.set({
			video: { seconds: result.durationSeconds, files: result.files.length },
		});
		await announce(video);
	} catch (error) {
		const final = error instanceof VideoError || video.attempts >= MAX_ATTEMPTS;
		log.error(error instanceof Error ? error : String(error));
		await db
			.update(mediaAsset)
			.set(
				final
					? {
							status: "failed",
							lockedUntil: null,
							error:
								error instanceof VideoError
									? error.message
									: "This video couldn't be processed. Try uploading it again.",
						}
					: // try again later: 2, then 4 minutes
						{
							lockedUntil: new Date(Date.now() + 2 ** video.attempts * 60_000),
						},
			)
			.where(eq(mediaAsset.id, video.id));
		if (final) await announce(video);
	} finally {
		log.emit();
		await rm(dir, { recursive: true, force: true });
	}
}

/** Processes waiting videos one at a time until none is left. */
export async function drain() {
	for (let video = await claimVideo(); video; video = await claimVideo())
		await processClaimed(video);
}
