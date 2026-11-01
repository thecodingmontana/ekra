/** What the server keeps of an uploaded picture (the image pipeline's sizes, in /api/media). */
export type UploadedPicture = {
	src: string;
	width: number;
	height: number;
	placeholder: string;
	/** stored widths, smallest first: src with another width picks that size */
	widths: number[];
};

/** The same picture at its smallest stored size (for logos and other small spots). */
export const smallest = (p: UploadedPicture) =>
	p.src.replace(/\/\d+-webp$/, `/${p.widths[0] ?? 320}-webp`);

/** Pictures the image pipeline reads; the browser's file picker offers these. */
export const PICTURE_TYPES =
	"image/png,image/jpeg,image/webp,image/avif,image/gif";

/**
 * Uploads a picture to an organization (POST /api/media). Throws an Error with the server's own explanation
 * ("That file is too big…", "SVG pictures aren't allowed…") when it's refused.
 */
export async function uploadPicture(
	slug: string,
	file: File,
	signal?: AbortSignal,
): Promise<UploadedPicture> {
	const form = new FormData();
	form.append("file", file);
	const res = await fetch(`/api/media?org=${encodeURIComponent(slug)}`, {
		method: "POST",
		body: form,
		signal,
	});
	const body = (await res.json().catch(() => ({}))) as Partial<
		UploadedPicture & { message: string }
	>;
	if (!res.ok || !body.src)
		throw new Error(body.message ?? "Couldn't upload that picture.");
	return body as UploadedPicture;
}
