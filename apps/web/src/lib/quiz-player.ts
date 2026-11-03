import type { Point } from "./quiz-builder.ts";

/** An answer as the server keeps it: chosen option ids, blank id → word, or clicks on a picture. */
export type Answer = string[] | Record<string, string> | Point[];

/** Whether something has really been answered (an empty choice list or blank map doesn't count). */
export function isAnswered(answer: Answer | undefined): boolean {
	if (!answer) return false;
	if (Array.isArray(answer)) return answer.length > 0;
	return Object.values(answer).some((v) => v.trim() !== "");
}

export type MapFilter = "all" | "answered" | "unanswered" | "unsure";

/** The quiz map: per question its number and state, and how many fall under each filter. */
export function quizMap(
	ids: string[],
	answers: Record<string, Answer | undefined>,
	unsure: ReadonlySet<string>,
) {
	const items = ids.map((id, index) => ({
		id,
		index,
		answered: isAnswered(answers[id]),
		unsure: unsure.has(id),
	}));
	const pick = (f: MapFilter) =>
		items.filter((i) =>
			f === "all"
				? true
				: f === "answered"
					? i.answered
					: f === "unanswered"
						? !i.answered
						: i.unsure,
		);
	return {
		items,
		pick,
		counts: {
			all: items.length,
			answered: pick("answered").length,
			unanswered: pick("unanswered").length,
			unsure: pick("unsure").length,
		} satisfies Record<MapFilter, number>,
	};
}

/** Time left as 00:04:55 (hours shown only when there are some). */
export function clock(ms: number): string {
	const s = Math.max(0, Math.ceil(ms / 1000));
	const two = (n: number) => String(n).padStart(2, "0");
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	return h > 0
		? `${two(h)}:${two(m)}:${two(s % 60)}`
		: `${two(m)}:${two(s % 60)}`;
}

/** The tiles still free to place: every tile minus one per word already in a blank. */
export function freeTiles(
	tiles: string[],
	filled: Record<string, string>,
): { word: string; index: number }[] {
	const used = Object.values(filled);
	return tiles.flatMap((word, index) => {
		const at = used.indexOf(word);
		if (at >= 0) {
			used.splice(at, 1);
			return [];
		}
		return [{ word, index }];
	});
}

/** Puts a word in a blank (replacing what was there); an empty word clears it. */
export function fillBlank(
	filled: Record<string, string>,
	blank: string,
	word: string,
): Record<string, string> {
	const { [blank]: _gone, ...rest } = filled;
	return word ? { ...rest, [blank]: word } : rest;
}

/** Toggles a choice; with one to pick, picking another replaces it. */
export function toggleChoice(
	chosen: string[],
	id: string,
	pickCount: number,
): string[] {
	if (chosen.includes(id)) return chosen.filter((c) => c !== id);
	return pickCount <= 1 ? [id] : [...chosen, id];
}

/** Adds a click on a picture unless all `max` markers are placed already. */
export function addClick(clicks: Point[], at: Point, max: number): Point[] {
	return clicks.length >= Math.min(max, 10) ? clicks : [...clicks, at];
}
