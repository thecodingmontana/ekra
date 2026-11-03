import { isCorrect, type QuestionPayload } from "./quiz.ts";

/** A quiz question as the report needs it: its id and payload (with the right answers). */
export type ReportQuestion = { id: string; payload: QuestionPayload };

/** One attempt as stored: which questions it asked, the answers, and its grade once handed in. */
export type ReportAttempt = {
	userId: string;
	questionIds: string[];
	answers: Record<string, unknown>;
	submittedAt: Date | string | null;
	score: number | null;
	maxScore: number | null;
	passed: boolean | null;
};

const graded = (a: ReportAttempt) => a.submittedAt != null && a.score != null;
const share = (a: ReportAttempt) =>
	a.maxScore ? (a.score ?? 0) / a.maxScore : 0;

/** Someone's best graded attempt: the highest share of points, then a pass; null with none graded. */
export function bestAttempt<T extends ReportAttempt>(attempts: T[]): T | null {
	let best: T | null = null;
	for (const a of attempts) {
		if (!graded(a)) continue;
		if (
			!best ||
			share(a) > share(best) ||
			(share(a) === share(best) && a.passed && !best.passed)
		)
			best = a;
	}
	return best;
}

/** Whether an attempt got this question right; null when it wasn't asked or wasn't answered. */
export function answerResult(
	q: ReportQuestion,
	a: ReportAttempt,
): boolean | null {
	if (!a.questionIds.includes(q.id) || !(q.id in a.answers)) return null;
	return isCorrect(q.payload, a.answers[q.id]);
}

/**
 * How each question went over the handed-in attempts: how often it was answered and answered right, and for
 * multiple choice how often each choice was picked.
 */
export function questionStats(
	questions: ReportQuestion[],
	attempts: ReportAttempt[],
) {
	const handedIn = attempts.filter(graded);
	return questions.map((q) => {
		const results = handedIn.map((a) => answerResult(q, a));
		const p = q.payload;
		const choices =
			p.kind === "multiple_choice"
				? p.options.map((o, i) => ({
						label: o.text ?? `Choice ${i + 1}`,
						right: p.correct.includes(o.id),
						picked: handedIn.filter((a) => {
							const given = a.answers[q.id];
							return (
								a.questionIds.includes(q.id) &&
								Array.isArray(given) &&
								given.includes(o.id)
							);
						}).length,
					}))
				: [];
		return {
			id: q.id,
			answered: results.filter((r) => r !== null).length,
			correct: results.filter((r) => r === true).length,
			choices,
		};
	});
}
