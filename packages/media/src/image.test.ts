import assert from "node:assert/strict";
import { test } from "node:test";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { ImageError, processImage } from "./image.ts";

const refused = async (input: Buffer, why: RegExp) =>
	assert.rejects(
		processImage(input),
		(e) => e instanceof ImageError && why.test(e.message),
	);

test("a big photo becomes smaller AVIF and WebP sizes with no camera or GPS data", async () => {
	const photo = await sharp({
		create: {
			width: 4000,
			height: 3000,
			channels: 3,
			background: "#000",
			noise: { type: "gaussian", mean: 128, sigma: 40 },
		},
	})
		.jpeg({ quality: 95 })
		.withExif({
			IFD0: { Make: "PhoneCo", Model: "X1" },
			IFD3: { GPSLatitude: "1/1 17/1 0/1", GPSLatitudeRef: "S" },
		})
		.toBuffer();
	assert.ok(
		(await sharp(photo).metadata()).exif,
		"the test photo carries EXIF",
	);

	const out = await processImage(photo);
	assert.equal(out.width, 2560, "the long edge is capped");
	assert.equal(out.height, 1920);
	assert.deepEqual(
		out.files.map((f) => f.name),
		[
			"320.webp",
			"320.avif",
			"640.webp",
			"640.avif",
			"1280.webp",
			"1280.avif",
			"1920.webp",
			"1920.avif",
		],
	);
	for (const f of out.files) {
		const m = await sharp(f.body).metadata();
		assert.equal(m.width, f.width);
		assert.equal(m.exif, undefined, `${f.name} has no EXIF`);
		assert.ok(
			f.body.length < photo.length,
			`${f.name} is smaller than the upload`,
		);
	}
	assert.match(out.placeholder, /^data:image\/webp;base64,/);
});

test("a sideways phone photo is turned upright", async () => {
	const sideways = await sharp({
		create: { width: 600, height: 400, channels: 3, background: "#09f" },
	})
		.jpeg()
		.withMetadata({ orientation: 6 })
		.toBuffer();
	const out = await processImage(sideways);
	assert.deepEqual([out.width, out.height], [400, 600]);
});

test("a small transparent PNG keeps its size and its transparency", async () => {
	const logo = await sharp({
		create: {
			width: 200,
			height: 100,
			channels: 4,
			background: { r: 0, g: 223, b: 130, alpha: 0.5 },
		},
	})
		.png()
		.toBuffer();
	const out = await processImage(logo);
	assert.deepEqual(
		out.files.map((f) => f.name),
		["200.webp", "200.avif"],
		"never made bigger than the source",
	);
	const webp = out.files[0];
	assert.ok(webp);
	assert.equal((await sharp(webp.body).metadata()).hasAlpha, true);
});

test("an animated GIF stays animated (as WebP)", async () => {
	const frame = (color: string) =>
		sharp({
			create: { width: 64, height: 64, channels: 3, background: color },
		})
			.png()
			.toBuffer();
	const frames = await Promise.all(["#f00", "#0f0", "#00f"].map(frame));
	const gif = await sharp(frames, { join: { animated: true } })
		.gif()
		.toBuffer();
	assert.equal((await sharp(gif).metadata()).pages, 3);
	const out = await processImage(gif);
	assert.deepEqual(
		out.files.map((f) => f.name),
		["64.webp"],
	);
	const webp = out.files[0];
	assert.ok(webp);
	assert.equal(
		(await sharp(webp.body, { animated: true }).metadata()).pages,
		3,
	);
});

test("files that aren't pictures, SVGs and pixel bombs are refused", async () => {
	await refused(Buffer.from("MZ this is really a program"), /isn't a picture/);
	await refused(
		Buffer.from(
			'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
		),
		/SVG/,
	);
	// a tiny PNG whose header claims 30000 × 30000 pixels
	const chunk = (type: string, data: Buffer) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body));
		return Buffer.concat([len, body, crc]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(30000, 0);
	ihdr.writeUInt32BE(30000, 4);
	ihdr.set([8, 2, 0, 0, 0], 8);
	const bomb = Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk("IHDR", ihdr),
		chunk("IEND", Buffer.alloc(0)),
	]);
	await refused(bomb, /isn't a picture|too large/);
});
