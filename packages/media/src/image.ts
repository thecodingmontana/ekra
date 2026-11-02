import sharp, { type Metadata, type OutputInfo } from "sharp";

/** Widths written for every picture (never wider than the picture itself). */
export const IMAGE_WIDTHS = [320, 640, 1280, 1920] as const;
/** The long edge is capped here before sizes are made. */
const MAX_EDGE = 2560;
/** A picture bigger than this many pixels is refused before it's decoded (a "decompression bomb"). */
export const MAX_PIXELS = 50_000_000;
const FORMATS = new Set(["jpeg", "png", "webp", "avif", "gif", "heif"]);

export class ImageError extends Error {}

export type ProcessedImage = {
	width: number;
	height: number;
	/** a tiny blurred WebP as a data URL, shown while the real picture loads */
	placeholder: string;
	/** e.g. "640.avif", "640.webp"; smallest first */
	files: { name: string; type: string; width: number; body: Buffer }[];
};

/**
 * An uploaded picture made safe to serve: the real format is read from the bytes (the file name and type are
 * ignored), it's turned upright, its metadata (camera, GPS) is dropped, and it's written as AVIF and WebP at a few
 * widths. Animated GIFs and WebPs stay animated (WebP only). SVG and anything else is refused.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
	let meta: Metadata;
	try {
		meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
	} catch {
		throw new ImageError("That file isn't a picture we can read.");
	}
	const format = meta.format === "heif" ? meta.compression : meta.format;
	if (meta.format === "svg")
		throw new ImageError("SVG pictures aren't allowed. Upload a PNG or JPEG.");
	if (!meta.format || !FORMATS.has(meta.format))
		throw new ImageError("Upload a JPEG, PNG, WebP, AVIF or GIF picture.");
	if (format === "hevc")
		throw new ImageError(
			"HEIC photos can't be read here yet. Export it as JPEG and try again.",
		);
	const animated = (meta.pages ?? 1) > 1;
	// counted over every frame (sharp's own limit counts one): many big frames are refused before decoding
	const frameHeight = meta.pageHeight ?? meta.height ?? 0;
	if ((meta.width ?? 0) * frameHeight * (meta.pages ?? 1) > MAX_PIXELS)
		throw new ImageError("That picture is too large.");

	const upright = sharp(input, {
		animated,
		limitInputPixels: MAX_PIXELS,
	})
		.rotate()
		.resize({
			width: MAX_EDGE,
			height: MAX_EDGE,
			fit: "inside",
			withoutEnlargement: true,
		});
	// decoded once: every size is made from this upright, capped copy (an animation keeps its frames instead)
	let master: Buffer;
	let info: OutputInfo;
	try {
		({ data: master, info } = await (animated
			? upright.webp({ lossless: true })
			: upright.raw()
		).toBuffer({ resolveWithObject: true }));
	} catch (error) {
		throw new ImageError(
			/pixel limit/i.test(String(error))
				? "That picture is too large."
				: "That picture is damaged and can't be read.",
		);
	}
	const size = { width: info.width, height: info.pageHeight ?? info.height };
	const from = () =>
		animated
			? sharp(master, { animated: true })
			: sharp(master, {
					raw: {
						width: info.width,
						height: info.height,
						channels: info.channels as 1 | 2 | 3 | 4,
					},
				});

	const largest = Math.max(...IMAGE_WIDTHS);
	const widths = [
		...IMAGE_WIDTHS.filter((w) => w < size.width),
		Math.min(size.width, largest),
	];
	const files: ProcessedImage["files"] = [];
	for (const width of [...new Set(widths)]) {
		const sized = () => from().resize({ width });
		files.push({
			name: `${width}.webp`,
			type: "image/webp",
			width,
			body: await sized().webp({ quality: 75 }).toBuffer(),
		});
		if (!animated)
			files.push({
				name: `${width}.avif`,
				type: "image/avif",
				width,
				body: await sized().avif({ quality: 55, effort: 3 }).toBuffer(),
			});
	}
	const tiny = await from()
		.resize({ width: 16, height: 16, fit: "inside" })
		.webp({ quality: 40 })
		.toBuffer();
	return {
		...size,
		placeholder: `data:image/webp;base64,${tiny.toString("base64")}`,
		files,
	};
}
