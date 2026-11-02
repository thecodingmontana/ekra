import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { processVideo, VideoError } from "./video.ts";

let dir = "";
before(async () => {
	dir = await mkdtemp(join(tmpdir(), "ekra-video-test-"));
});
after(async () => {
	await rm(dir, { recursive: true, force: true });
});

/** A short test video made by ffmpeg (a test pattern, with a tone when `audio`). */
function makeVideo(name: string, size: string, fps: number, audio: boolean) {
	const out = join(dir, name);
	const r = spawnSync("ffmpeg", [
		"-v",
		"error",
		"-y",
		"-f",
		"lavfi",
		"-i",
		`testsrc=size=${size}:rate=${fps}:duration=3`,
		...(audio ? ["-f", "lavfi", "-i", "sine=frequency=440:duration=3"] : []),
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		...(audio ? ["-c:a", "aac", "-shortest"] : []),
		out,
	]);
	assert.equal(r.status, 0, String(r.stderr));
	return out;
}

const outDir = (name: string) => mkdtemp(join(dir, `${name}-`));

test("a landscape video becomes an HLS ladder up to its size, with a poster", async () => {
	const input = makeVideo("wide.mp4", "1280x720", 30, true);
	const out = await outDir("wide");
	const video = await processVideo(input, out);
	assert.deepEqual(
		[video.width, video.height, video.durationSeconds, video.hasAudio],
		[1280, 720, 3, true],
	);
	const names = video.files.map((f) => f.name);
	for (const n of [
		"master-m3u8",
		"360p-m3u8",
		"540p-m3u8",
		"720p-m3u8",
		"poster-webp",
	])
		assert.ok(names.includes(n), n);
	assert.ok(
		!names.some((n) => n.startsWith("1080p")),
		"never above the source",
	);
	assert.ok(names.some((n) => /^720p_\d{3}-ts$/.test(n)));

	const master = await readFile(join(out, "master-m3u8"), "utf8");
	assert.match(master, /RESOLUTION=640x360\n360p-m3u8/);
	assert.match(master, /RESOLUTION=1280x720\n720p-m3u8/);
	const rung = await readFile(join(out, "720p-m3u8"), "utf8");
	assert.match(rung, /720p_000-ts/, "segments named as API paths");
	const poster = await sharp(
		await readFile(join(out, "poster-webp")),
	).metadata();
	assert.deepEqual([poster.format, poster.width], ["webp", 1280]);
});

test("a portrait phone video (60 fps, no sound) keeps its shape", async () => {
	const input = makeVideo("tall.mp4", "720x1280", 60, false);
	const out = await outDir("tall");
	const video = await processVideo(input, out);
	assert.deepEqual(
		[video.width, video.height, video.hasAudio],
		[720, 1280, false],
	);
	const master = await readFile(join(out, "master-m3u8"), "utf8");
	assert.match(master, /RESOLUTION=360x640\n360p-m3u8/);
});

test("a tiny video keeps its own size", async () => {
	const input = makeVideo("tiny.mp4", "320x180", 25, false);
	const video = await processVideo(input, await outDir("tiny"));
	assert.ok(video.files.some((f) => f.name === "180p-m3u8"));
});

test("files that aren't videos are refused", async () => {
	const fake = join(dir, "lesson.mp4");
	await writeFile(fake, "this is a shopping list, not a video");
	await assert.rejects(processVideo(fake, await outDir("fake")), VideoError);
	const still = join(dir, "photo.mp4");
	await writeFile(
		still,
		await sharp({
			create: { width: 64, height: 64, channels: 3, background: "#f00" },
		})
			.png()
			.toBuffer(),
	);
	await assert.rejects(processVideo(still, await outDir("still")), VideoError);
});
