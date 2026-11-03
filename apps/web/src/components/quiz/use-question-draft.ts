import { useMutation } from "@apollo/client/react";
import { useEffect, useRef, useState } from "react";
import { type QuizQuestion, UPDATE_QUESTION } from "@/graphql/quiz";
import { draftProblem } from "@/lib/quiz-builder";

export type Draft = {
	prompt: string;
	image: string | null;
	points: number;
	required: boolean;
	explanation: string;
	payload: Record<string, unknown>;
};

export type SaveState =
	| { at: "saved" }
	| { at: "saving" }
	| { at: "waiting" }
	| { at: "invalid"; why: string }
	| { at: "failed"; why: string };

const DELAY = 700;

const fromQuestion = (q: QuizQuestion): Draft => ({
	prompt: q.prompt,
	image: q.image,
	points: q.points,
	required: q.required,
	explanation: q.explanation ?? "",
	payload: JSON.parse(q.payload) as Record<string, unknown>,
});

/**
 * One question's editable copy, saved a moment after each change (and right away when the editor closes).
 * Changes that the server would refuse aren't sent; the state says why.
 */
export function useQuestionDraft(slug: string, question: QuizQuestion) {
	const [draft, setDraft] = useState(() => fromQuestion(question));
	const [state, setState] = useState<SaveState>({ at: "saved" });
	const [update] = useMutation(UPDATE_QUESTION);
	const pending = useRef<Draft | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

	const problemOf = (d: Draft) =>
		d.prompt.trim()
			? draftProblem(question.kind, d.payload)
			: "Write the question.";

	const save = async (d: Draft) => {
		pending.current = null;
		const problem = problemOf(d);
		if (problem) return setState({ at: "invalid", why: problem });
		setState({ at: "saving" });
		try {
			await update({
				variables: {
					slug,
					id: question.id,
					input: {
						kind: question.kind,
						prompt: d.prompt.trim(),
						image: d.image,
						payload: JSON.stringify(d.payload),
						points: d.points,
						required: d.required,
						explanation: d.explanation.trim() || null,
					},
				},
			});
			setState((s) => (s.at === "saving" ? { at: "saved" } : s));
		} catch (error) {
			setState({ at: "failed", why: (error as Error).message });
		}
	};
	const saveRef = useRef(save);
	saveRef.current = save;

	const latest = useRef(draft);
	const change = (patch: Partial<Draft>) => {
		const next = { ...latest.current, ...patch };
		latest.current = next;
		pending.current = next;
		setDraft(next);
		setState({ at: "waiting" });
		clearTimeout(timer.current);
		timer.current = setTimeout(() => void saveRef.current(next), DELAY);
	};
	const setPayload = (payload: Record<string, unknown>) => change({ payload });

	// leaving the question saves what's still waiting
	useEffect(
		() => () => {
			clearTimeout(timer.current);
			if (pending.current) void saveRef.current(pending.current);
		},
		[],
	);

	return {
		draft,
		change,
		setPayload,
		state,
	};
}
