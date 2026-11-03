import { useSyncExternalStore } from "react";
import { uploadVideo } from "@/lib/video-upload";

/** A video being sent from this tab; it keeps going while you move between the course's pages. */
export type Upload = {
	lessonId: string;
	fileName: string;
	size: number;
	sent: number;
	controller: AbortController;
};

let uploads: ReadonlyMap<string, Upload> = new Map();
const listeners = new Set<() => void>();

function set(lessonId: string, upload: Upload | null) {
	const next = new Map(uploads);
	if (upload) next.set(lessonId, upload);
	else next.delete(lessonId);
	uploads = next;
	for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
	listeners.add(l);
	return () => listeners.delete(l);
};

/** The upload running for this lesson in this tab, if any. */
export const useUpload = (lessonId: string) =>
	useSyncExternalStore(
		subscribe,
		() => uploads.get(lessonId) ?? null,
		() => null,
	);

/** Sends a video onto a lesson. Resolves when the server has it (the worker then processes it); rejects with the reason. */
export async function startUpload(
	slug: string,
	lessonId: string,
	file: File,
): Promise<void> {
	uploads.get(lessonId)?.controller.abort();
	const controller = new AbortController();
	const upload: Upload = {
		lessonId,
		fileName: file.name,
		size: file.size,
		sent: 0,
		controller,
	};
	set(lessonId, upload);
	try {
		await uploadVideo({
			slug,
			lessonId,
			file,
			signal: controller.signal,
			onProgress: (sent) => {
				const now = uploads.get(lessonId);
				if (now?.controller === controller) set(lessonId, { ...now, sent });
			},
		});
	} finally {
		if (uploads.get(lessonId)?.controller === controller) set(lessonId, null);
	}
}

export const cancelUpload = (lessonId: string) =>
	uploads.get(lessonId)?.controller.abort();
