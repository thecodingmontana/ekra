import { spawn } from "node:child_process";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

/** Rungs of the quality ladder, by the picture's short side; never above the source. */
export const LADDER = [
	{ height: 360, maxKbps: 900 },
	{ height: 540, maxKbps: 1800 },
	{ height: 720, maxKbps: 3000 },
	{ height: 1080, maxKbps: 6000 },
] as const;
/** The longest video a lesson may have. */
export const MAX_SECONDS = 4 * 60 * 60;
/** Each HLS segment, and the keyframe spacing, so quality can switch smoothly at any segment. */
const SEGMENT_SECONDS = 2;

export class VideoError extends Error {}

export type ProcessedVideo = {
	width: number;
	height: number;
	durationSeconds: number;
	hasAudio: boolean;
	/** files written to the output folder: playlists, segments and the poster */
	files: { name: string; type: string; width: number }[];
};

type Probe = {
	streams?: {
		codec_type?: string;
		codec_name?: string;
		width?: number;
		height?: number;
		avg_frame_rate?: string;
		tags?: { rotate?: string };
		side_data_list?: { rotation?: number }[];
	}[];
	format?: { duration?: string };
};

/** Runs a command, resolving with its output; rejects with the end of its error output. */
function run(cmd: string, args: string[]) {
	return new Promise<string>((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
		let out = "";
		let err = "";
		child.stdout.on("data", (d) => {
			out += d;
		});
		child.stderr.on("data", (d) => {
			err = (err + d).slice(-4000);
		});
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0
				? resolve(out)
				: reject(new Error(`${cmd} failed (${code}): ${err.slice(-600)}`)),
		);
	});
}

// still pictures ffprobe also reads as one-frame "videos": refused
const PICTURE_CODECS = new Set(["png", "mjpeg", "gif", "webp", "bmp", "tiff"]);

/** What a file really is, read by ffprobe: only real videos pass. */
export async function probeVideo(input: string) {
	let probe: Probe;
	try {
		probe = JSON.parse(
			await run("ffprobe", [
				"-v",
				"error",
				"-print_format",
				"json",
				"-show_streams",
				"-show_format",
				input,
			]),
		) as Probe;
	} catch {
		throw new VideoError("That file isn't a video we can read.");
	}
	const video = probe.streams?.find((s) => s.codec_type === "video");
	const duration = Number(probe.format?.duration ?? 0);
	if (
		!video?.width ||
		!video.height ||
		PICTURE_CODECS.has(video.codec_name ?? "") ||
		!(duration > 0)
	)
		throw new VideoError("That file isn't a video we can read.");
	if (duration > MAX_SECONDS)
		throw new VideoError("Videos can be up to 4 hours long.");
	const rotation = Math.abs(
		Number(video.tags?.rotate ?? video.side_data_list?.[0]?.rotation ?? 0),
	);
	// a phone films sideways and marks it rotated; ffmpeg turns it upright, so the sizes swap
	const turned = rotation === 90 || rotation === 270;
	const [num = 30, den = 1] = (video.avg_frame_rate ?? "30/1")
		.split("/")
		.map(Number);
	return {
		width: turned ? video.height : video.width,
		height: turned ? video.width : video.height,
		durationSeconds: Math.max(1, Math.round(duration)),
		fps: den ? Math.min(120, Math.max(1, num / den)) : 30,
		hasAudio: !!probe.streams?.some((s) => s.codec_type === "audio"),
	};
}

/**
 * A video made ready to stream: an HLS ladder of H.264 + AAC renditions (only up to the source's size), keyframes
 * every 2 seconds, audio loudness-normalized (EBU R128) so every lesson plays at the same volume, and a poster.
 * Files are named without extensions ("720p-m3u8", "720p_000-ts", "poster-webp") so they're served as API paths.
 * shortcut: no download MP4 or scrubbing sprite yet; add them when the player offers downloads or hover previews.
 */
export async function processVideo(
	input: string,
	outDir: string,
): Promise<ProcessedVideo> {
	const info = await probeVideo(input);
	const short = Math.min(info.width, info.height);
	const rungs = LADDER.filter((r) => r.height <= short);
	// a source smaller than the smallest rung keeps its own size
	const ladder = rungs.length
		? rungs
		: [{ height: short - (short % 2), maxKbps: 900 }];
	const landscape = info.width >= info.height;
	const gop = Math.round(info.fps * SEGMENT_SECONDS);

	const variants: {
		name: string;
		width: number;
		height: number;
		kbps: number;
	}[] = [];
	for (const rung of ladder) {
		const name = `${rung.height}p`;
		// the short side becomes the rung; the other side keeps the shape (even, for H.264)
		const scale = landscape
			? `scale=-2:${rung.height}`
			: `scale=${rung.height}:-2`;
		await run("ffmpeg", [
			"-v",
			"error",
			"-y",
			"-i",
			input,
			"-vf",
			scale,
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-crf",
			"21",
			"-maxrate",
			`${rung.maxKbps}k`,
			"-bufsize",
			`${rung.maxKbps * 2}k`,
			"-pix_fmt",
			"yuv420p",
			"-g",
			String(gop),
			"-keyint_min",
			String(gop),
			"-sc_threshold",
			"0",
			...(info.hasAudio
				? [
						"-c:a",
						"aac",
						"-b:a",
						"128k",
						"-ac",
						"2",
						"-af",
						"loudnorm=I=-16:TP=-1.5:LRA=11",
					]
				: ["-an"]),
			"-f",
			"hls",
			"-hls_time",
			String(SEGMENT_SECONDS),
			"-hls_playlist_type",
			"vod",
			"-hls_segment_filename",
			join(outDir, `${name}_%03d-ts`),
			join(outDir, `${name}-m3u8`),
		]);
		const other =
			Math.round(
				(Math.max(info.width, info.height) * rung.height) / short / 2,
			) * 2;
		variants.push({
			name,
			width: landscape ? other : rung.height,
			height: landscape ? rung.height : other,
			kbps: rung.maxKbps + (info.hasAudio ? 128 : 0),
		});
	}

	await writeFile(
		join(outDir, "master-m3u8"),
		[
			"#EXTM3U",
			"#EXT-X-VERSION:3",
			...variants.flatMap((v) => [
				`#EXT-X-STREAM-INF:BANDWIDTH=${v.kbps * 1000},RESOLUTION=${v.width}x${v.height}`,
				`${v.name}-m3u8`,
			]),
			"",
		].join("\n"),
	);

	// the poster: a frame a third of the way in (at most 10 s), as WebP
	const frame = join(outDir, "poster.png");
	await run("ffmpeg", [
		"-v",
		"error",
		"-y",
		"-ss",
		Math.min(info.durationSeconds / 3, 10).toFixed(2),
		"-i",
		input,
		"-frames:v",
		"1",
		frame,
	]);
	await sharp(await readFile(frame))
		.resize({
			width: 1280,
			height: 1280,
			fit: "inside",
			withoutEnlargement: true,
		})
		.webp({ quality: 75 })
		.toFile(join(outDir, "poster-webp"));
	await rm(frame);

	const files = (await readdir(outDir)).sort().map((name) => ({
		name,
		type: name.endsWith("-m3u8")
			? "application/vnd.apple.mpegurl"
			: name.endsWith("-ts")
				? "video/mp2t"
				: "image/webp",
		width: variants.find((v) => name.startsWith(`${v.name}`))?.width ?? 0,
	}));
	return {
		width: info.width,
		height: info.height,
		durationSeconds: info.durationSeconds,
		hasAudio: info.hasAudio,
		files,
	};
}
