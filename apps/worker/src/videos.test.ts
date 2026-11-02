import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
	generateId,
	mediaAsset,
	migrateDatabase,
	organization,
} from "@ekra/db";
import { eq } from "drizzle-orm";
import { claimVideo, close, db, drain, storage } from "./videos.ts";

const orgId = generateId();
let dir = "";

before(async () => {
	await migrateDatabase(process.env.DATABASE_URL ?? "");
	await storage.ensureBucket();
	dir = await mkdtemp(join(tmpdir(), "ekra-worker-test-"));
	await db.insert(organization).values({
		id: orgId,
		name: "Worker test",
		slug: `worker-test-${Date.now()}`,
		createdAt: new Date(),
	});
});

after(async () => {
	await db.delete(organization).where(eq(organization.id, orgId));
	await rm(dir, { recursive: true, force: true });
	await close();
});

/** An uploaded original waiting for the worker, as the API leaves it after the last part. */
async function waitingVideo(body: Uint8Array) {
	const id = generateId();
	const originalKey = `media/${orgId}/${id}/original`;
	await storage.put(originalKey, body, "application/octet-stream");
	await db.insert(mediaAsset).values({
		id,
		orgId,
		kind: "video",
		status: "processing",
		originalKey,
	});
	return id;
}
const row = async (id: string) =>
	(await db.select().from(mediaAsset).where(eq(mediaAsset.id, id)))[0];

test("an uploaded video is turned into streams and marked ready", async () => {
	const file = join(dir, "clip.mp4");
	const made = spawnSync("ffmpeg", [
		"-v",
		"error",
		"-y",
		"-f",
		"lavfi",
		"-i",
		"testsrc=size=640x360:rate=25:duration=2",
		"-f",
		"lavfi",
		"-i",
		"sine=duration=2",
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"aac",
		"-shortest",
		file,
	]);
	assert.equal(made.status, 0, String(made.stderr));
	const id = await waitingVideo(await readFile(file));

	await drain();
	const done = await row(id);
	assert.equal(done?.status, "ready", done?.error ?? "");
	assert.deepEqual(
		[done?.width, done?.height, done?.durationSeconds, done?.attempts],
		[640, 360, 2, 1],
	);
	const names = done?.files.map((f) => f.name) ?? [];
	assert.ok(names.includes("master-m3u8") && names.includes("poster-webp"));
	const master = await storage.get(`media/${orgId}/${id}/master-m3u8`);
	assert.match((await master?.text()) ?? "", /360p-m3u8/);
});

test("a file that isn't a video fails with a reason, without retries", async () => {
	const id = await waitingVideo(new TextEncoder().encode("not a video"));
	await drain();
	const failed = await row(id);
	assert.equal(failed?.status, "failed");
	assert.match(failed?.error ?? "", /isn't a video/);
	assert.equal(failed?.attempts, 1);
});

test("two workers never take the same video", async () => {
	const id = await waitingVideo(new TextEncoder().encode("x"));
	const [a, b] = await Promise.all([claimVideo(), claimVideo()]);
	assert.deepEqual(
		[a?.id ?? null, b?.id ?? null].filter(Boolean),
		[id],
		"one claims it, the other finds nothing",
	);
	await db.delete(mediaAsset).where(eq(mediaAsset.id, id));
});
