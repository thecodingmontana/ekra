/** Bytes [start, end) of part `n` (1-based) of a file sent in `partBytes` pieces; the last one is smaller. */
export function partRange(
	size: number,
	partBytes: number,
	n: number,
): [number, number] {
	const start = (n - 1) * partBytes;
	return [start, Math.min(size, start + partBytes)];
}

/** Whole percent of an upload, never 100 before every byte is sent. */
export function percent(sent: number, size: number): number {
	if (size <= 0) return 0;
	if (sent >= size) return 100;
	return Math.min(99, Math.floor((sent / size) * 100));
}

/** Network failures and server errors are worth sending again; a refusal (4xx) is not. */
export const retryable = (status: number | null) =>
	status === null || status === 408 || status === 429 || status >= 500;

const TRIES = 4;

class HttpError extends Error {
	status: number | null;
	constructor(message: string, status: number | null) {
		super(message);
		this.status = status;
	}
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
	let res: Response;
	try {
		res = await fetch(url, init);
	} catch (error) {
		if ((error as Error).name === "AbortError") throw error;
		throw new HttpError("The connection dropped.", null);
	}
	const body = (await res.json().catch(() => ({}))) as T & {
		message?: string;
	};
	if (!res.ok)
		throw new HttpError(
			body.message ?? "The server refused the video.",
			res.status,
		);
	return body;
}

async function withRetries<T>(
	send: () => Promise<T>,
	signal: AbortSignal,
): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await send();
		} catch (error) {
			const status = error instanceof HttpError ? error.status : undefined;
			if (signal.aborted || status === undefined || !retryable(status))
				throw error;
			if (attempt >= TRIES) throw error;
			await new Promise((r) => setTimeout(r, 800 * attempt));
		}
	}
}

/**
 * Uploads a video in parts onto a lesson (POST start, PUT each part, POST complete); the worker then
 * processes it. `onProgress` gets the bytes sent so far. Throws the server's own explanation when refused.
 */
export async function uploadVideo({
	slug,
	lessonId,
	file,
	signal,
	onProgress,
}: {
	slug: string;
	lessonId: string;
	file: File;
	signal: AbortSignal;
	onProgress: (sent: number) => void;
}): Promise<void> {
	const org = encodeURIComponent(slug);
	const json = { "content-type": "application/json" };
	const started = await call<{ id: string; partBytes: number; parts: number }>(
		`/api/media/videos?org=${org}&lesson=${encodeURIComponent(lessonId)}`,
		{
			method: "POST",
			headers: json,
			body: JSON.stringify({ size: file.size, type: file.type }),
			signal,
		},
	);
	const parts: { part: number; etag: string }[] = [];
	let sent = 0;
	// shortcut: progress moves once per 8 MB part (fetch has no upload progress); use XHR if finer steps matter
	for (let n = 1; n <= started.parts; n++) {
		const [start, end] = partRange(file.size, started.partBytes, n);
		const { etag } = await withRetries(
			() =>
				call<{ etag: string }>(
					`/api/media/videos/${started.id}/parts/${n}?org=${org}`,
					{ method: "PUT", body: file.slice(start, end), signal },
				),
			signal,
		);
		parts.push({ part: n, etag });
		sent += end - start;
		onProgress(sent);
	}
	await withRetries(
		() =>
			call(`/api/media/videos/${started.id}/complete?org=${org}`, {
				method: "POST",
				headers: json,
				body: JSON.stringify({ parts }),
				signal,
			}),
		signal,
	);
}
