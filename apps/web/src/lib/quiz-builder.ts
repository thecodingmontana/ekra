import { questionPayload, questionProblem } from "@ekra/core";

export type QuestionKind = "multiple_choice" | "fill_blank" | "hotspot";
export type Area = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type Blank = { id: string; answers: string[] };
export type FillBlank = {
	text: string;
	blanks: Blank[];
	distractors: string[];
};

/** A part of a fill-in-the-blank sentence: words, or blank number `id`. */
export type Segment = { text: string } | { blank: string };

const BLANK = /\{\{(\d{1,2})\}\}/g;

/** Splits "The {{1}} is blue" into its words and blanks, in order. */
export function sentenceParts(text: string): Segment[] {
	const out: Segment[] = [];
	let at = 0;
	for (const m of text.matchAll(BLANK)) {
		if (m.index > at) out.push({ text: text.slice(at, m.index) });
		out.push({ blank: m[1] ?? "" });
		at = m.index + m[0].length;
	}
	if (at < text.length) out.push({ text: text.slice(at) });
	return out;
}

/** The lowest blank number not used yet. */
export function nextBlankId(blanks: Blank[]): string {
	const used = new Set(blanks.map((b) => b.id));
	let n = 1;
	while (used.has(String(n))) n++;
	return String(n);
}

/**
 * Turns the selected words (text[start, end)) into a blank whose answer is those words, or, with nothing selected,
 * inserts an empty blank at `start`. Returns null when the selection overlaps a blank or there's no room for more.
 */
export function makeBlank(
	value: FillBlank,
	start: number,
	end: number,
): FillBlank | null {
	if (value.blanks.length >= 20) return null;
	const [from, to] = start <= end ? [start, end] : [end, start];
	const picked = value.text.slice(from, to);
	if (/[{}]/.test(picked)) return null;
	// a selection inside an existing {{n}} would split it
	for (const m of value.text.matchAll(BLANK))
		if (from > m.index && from < m.index + m[0].length) return null;
	const word = picked.trim();
	const id = nextBlankId(value.blanks);
	const lead = picked.slice(0, picked.length - picked.trimStart().length);
	const tail = picked.slice(picked.trimEnd().length);
	return {
		...value,
		text: `${value.text.slice(0, from)}${lead}{{${id}}}${tail}${value.text.slice(to)}`,
		blanks: [...value.blanks, { id, answers: word ? [word] : [] }],
	};
}

/** Takes a blank out again, putting its first answer back in the sentence. */
export function removeBlank(value: FillBlank, id: string): FillBlank {
	const blank = value.blanks.find((b) => b.id === id);
	return {
		...value,
		text: value.text.replace(`{{${id}}}`, blank?.answers[0] ?? ""),
		blanks: value.blanks.filter((b) => b.id !== id),
	};
}

/** A new sentence; blanks whose {{n}} was deleted from it go too. */
export function withText(value: FillBlank, text: string): FillBlank {
	const ids = new Set(
		sentenceParts(text).flatMap((p) => ("blank" in p ? [p.blank] : [])),
	);
	return { ...value, text, blanks: value.blanks.filter((b) => ids.has(b.id)) };
}

/** Why a question can't be saved yet (the same checks the server makes), or null when it can. */
export function draftProblem(
	kind: QuestionKind,
	payload: object,
): string | null {
	const parsed = questionPayload.safeParse({ ...payload, kind });
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		if (kind === "fill_blank" && issue?.path.includes("answers"))
			return "Give every blank its right answer.";
		if (kind === "multiple_choice" && issue?.path.includes("text"))
			return "Give every choice a text or a picture.";
		return issue?.message ?? "Something's missing.";
	}
	return questionProblem(parsed.data);
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Where a pointer is on a picture, as fractions of its size (0 to 1). */
export function toFraction(
	clientX: number,
	clientY: number,
	box: { left: number; top: number; width: number; height: number },
): Point {
	return {
		x: clamp((clientX - box.left) / box.width),
		y: clamp((clientY - box.top) / box.height),
	};
}

/** The box dragged from `a` to `b` (either direction), or null when it's too small to be meant. */
export function areaBetween(a: Point, b: Point, min = 0.02): Area | null {
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	const w = Math.abs(a.x - b.x);
	const h = Math.abs(a.y - b.y);
	if (w < min || h < min) return null;
	const round = (n: number) => Math.round(n * 10000) / 10000;
	return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

/** Default content for a new question of each kind (what the server accepts as a start). */
export function starterPayload(kind: QuestionKind, image?: string): object {
	if (kind === "multiple_choice")
		return {
			options: [
				{ id: "a", text: "First choice" },
				{ id: "b", text: "Second choice" },
			],
			correct: ["a"],
		};
	if (kind === "fill_blank")
		return {
			text: "Write the sentence here, then turn a {{1}} into a blank.",
			blanks: [{ id: "1", answers: ["word"] }],
			distractors: [],
		};
	return { image, areas: [{ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }] };
}

/** A short id for a new choice. */
export const choiceId = () => crypto.randomUUID().slice(0, 8);
