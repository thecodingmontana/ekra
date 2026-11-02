import { z } from "zod";

/**
 * Quiz questions and their grading, shared by the server (which grades) and the apps (which build and show
 * questions). Learners only ever get `publicQuestion(...)`: the right answers stay on the server.
 */

const text = z.string().trim().min(1).max(500);
const optionId = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);

/** A box on a picture, as fractions of its width and height (0 to 1), so it fits any display size. */
const area = z
	.object({
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
		w: z.number().gt(0).max(1),
		h: z.number().gt(0).max(1),
	})
	.refine(
		(a) => a.x + a.w <= 1.0001 && a.y + a.h <= 1.0001,
		"Keep the area on the picture.",
	);

export const questionPayload = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("multiple_choice"),
		options: z
			.array(
				z.object({
					id: optionId,
					text: text.optional(),
					image: z.string().max(500).optional(),
				}),
			)
			.min(2, "Give at least two choices.")
			.max(12),
		/** the right choices; more than one makes it "pick all that apply" */
		correct: z.array(optionId).min(1, "Mark the right answer."),
	}),
	z.object({
		kind: z.literal("fill_blank"),
		/** the sentence, with blanks written as {{1}}, {{2}}… */
		text: z.string().trim().min(1).max(2000),
		/** per blank, every answer that counts as right (case and spaces don't matter) */
		blanks: z
			.array(
				z.object({
					id: z.string().regex(/^\d{1,2}$/),
					answers: z.array(text).min(1),
				}),
			)
			.min(1, "Add a blank.")
			.max(20),
		/** wrong words offered with the right ones */
		distractors: z.array(text).max(20).default([]),
	}),
	z.object({
		kind: z.literal("hotspot"),
		image: z.string().min(1).max(500),
		/** the right places to click; each needs one click, and clicks elsewhere are wrong */
		areas: z.array(area).min(1, "Mark where to click.").max(10),
	}),
]);
export type QuestionPayload = z.infer<typeof questionPayload>;
export type QuestionKind = QuestionPayload["kind"];

export const questionAnswer = z.union([
	/** multiple choice: the chosen option ids */
	z.array(optionId).max(12),
	/** fill in the blank: blank id → what was filled in */
	z.record(z.string().regex(/^\d{1,2}$/), z.string().max(500)),
	/** hotspot: where the learner clicked, as fractions */
	z
		.array(
			z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
		)
		.max(10),
]);
export type QuestionAnswer = z.infer<typeof questionAnswer>;

/** The payload is consistent: right choices exist, every blank in the text is defined, and the other way round. */
export function questionProblem(p: QuestionPayload): string | null {
	if (p.kind === "multiple_choice") {
		const ids = new Set(p.options.map((o) => o.id));
		if (ids.size !== p.options.length) return "Two choices have the same id.";
		if (p.options.some((o) => !o.text && !o.image))
			return "Give every choice a text or a picture.";
		if (p.correct.some((c) => !ids.has(c)))
			return "A right answer isn't one of the choices.";
	}
	if (p.kind === "fill_blank") {
		const inText = [...p.text.matchAll(/\{\{(\d{1,2})\}\}/g)].map((m) => m[1]);
		const defined = p.blanks.map((b) => b.id);
		if (new Set(defined).size !== defined.length)
			return "Two blanks have the same number.";
		if (
			inText.some((id) => !defined.includes(id ?? "")) ||
			defined.some((id) => !inText.includes(id))
		)
			return "Every blank in the sentence needs its answers, and every answer its blank.";
	}
	return null;
}

const same = (a: string, b: string) =>
	a.trim().replace(/\s+/g, " ").toLowerCase() ===
	b.trim().replace(/\s+/g, " ").toLowerCase();

const inside = (
	pt: { x: number; y: number },
	a: { x: number; y: number; w: number; h: number },
) => pt.x >= a.x && pt.x <= a.x + a.w && pt.y >= a.y && pt.y <= a.y + a.h;

/** Whether an answer is right. All or nothing: a question's points are earned only when it's fully right. */
export function isCorrect(p: QuestionPayload, answer: unknown): boolean {
	const parsed = questionAnswer.safeParse(answer);
	if (!parsed.success) return false;
	const a = parsed.data;
	if (p.kind === "multiple_choice") {
		if (!Array.isArray(a) || !a.every((x) => typeof x === "string"))
			return false;
		const chosen = new Set(a as string[]);
		return (
			chosen.size === p.correct.length && p.correct.every((c) => chosen.has(c))
		);
	}
	if (p.kind === "fill_blank") {
		if (Array.isArray(a)) return false;
		return p.blanks.every((b) => {
			const given = a[b.id];
			return (
				typeof given === "string" && b.answers.some((ok) => same(ok, given))
			);
		});
	}
	if (!Array.isArray(a) || !a.every((x) => typeof x === "object")) return false;
	const clicks = a as { x: number; y: number }[];
	// one click per area, each area hit, and no click outside them all
	return (
		clicks.length === p.areas.length &&
		p.areas.every((ar) => clicks.some((c) => inside(c, ar))) &&
		clicks.every((c) => p.areas.some((ar) => inside(c, ar)))
	);
}

/**
 * What a learner sees of a question: no right answers. Fill-in-the-blank tiles (right words and distractors) come
 * in a fixed shuffled order (seeded by the question id, so it doesn't change on reload); hotspots say how many
 * places to click.
 */
export function publicQuestion(id: string, p: QuestionPayload) {
	if (p.kind === "multiple_choice")
		return { kind: p.kind, options: p.options, pickCount: p.correct.length };
	if (p.kind === "fill_blank")
		return {
			kind: p.kind,
			text: p.text,
			blanks: p.blanks.map((b) => b.id),
			tiles: seededShuffle(
				[...p.blanks.map((b) => b.answers[0] ?? ""), ...p.distractors],
				id,
			),
		};
	return { kind: p.kind, image: p.image, clickCount: p.areas.length };
}
export type PublicQuestion = ReturnType<typeof publicQuestion>;

/** A shuffle that's the same every time for the same seed (questions and choices stay put across reloads). */
export function seededShuffle<T>(list: T[], seed: string): T[] {
	let h = 2166136261;
	for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
	const next = () => {
		h = Math.imul(h ^ (h >>> 15), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		h ^= h >>> 16;
		return (h >>> 0) / 4294967296;
	};
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(next() * (i + 1));
		[out[i], out[j]] = [out[j] as T, out[i] as T];
	}
	return out;
}
