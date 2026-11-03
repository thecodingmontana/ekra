import { useMutation } from "@apollo/client/react";
import { toast } from "@ekra/ui/lib/toast";
import { useEffect, useRef, useState } from "react";
import {
	type AnswerCheck,
	type QuizAttempt,
	SAVE_QUIZ_ANSWER,
} from "@/graphql/quiz";
import { type Answer, isAnswered } from "@/lib/quiz-player";
import { json } from "./answer-input";

const DELAY = 500;
const unsureKey = (attemptId: string) => `ekra:quiz-unsure:${attemptId}`;

function loadUnsure(attemptId: string): Set<string> {
	try {
		return new Set(
			json<string[]>(localStorage.getItem(unsureKey(attemptId))) ?? [],
		);
	} catch {
		return new Set();
	}
}

/**
 * An attempt's answers: each one saved shortly after it's given (or, when answers show after each question,
 * when it's checked, which locks it). "Not sure" flags stay in this browser only.
 */
export function useAttemptAnswers(slug: string, attempt: QuizAttempt) {
	const each = attempt.showAnswers === "after_each";
	const [answers, setAnswers] = useState<Record<string, Answer>>(
		() => json<Record<string, Answer>>(attempt.answers) ?? {},
	);
	const [checks, setChecks] = useState<Record<string, AnswerCheck>>({});
	const [unsure, setUnsure] = useState<ReadonlySet<string>>(() => new Set());
	const [saveAnswer] = useMutation<{ saveQuizAnswer: AnswerCheck }>(
		SAVE_QUIZ_ANSWER,
	);
	const saved = useRef(new Set(Object.keys(answers)));
	const queued = useRef(new Map<string, Answer>());
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

	useEffect(() => setUnsure(loadUnsure(attempt.id)), [attempt.id]);

	const send = async (questionId: string, answer: Answer) => {
		queued.current.delete(questionId);
		try {
			const res = await saveAnswer({
				variables: {
					slug,
					attemptId: attempt.id,
					questionId,
					answer: JSON.stringify(answer),
				},
			});
			saved.current.add(questionId);
			const check = res.data?.saveQuizAnswer;
			if (each && check) setChecks((c) => ({ ...c, [questionId]: check }));
			return true;
		} catch (error) {
			toast.error("Couldn't save your answer", {
				desc: (error as Error).message,
			});
			return false;
		}
	};
	const sendRef = useRef(send);
	sendRef.current = send;

	const flush = async () => {
		clearTimeout(timer.current);
		const waiting = [...queued.current];
		const results = await Promise.all(
			waiting.map(([id, a]) => sendRef.current(id, a)),
		);
		return results.every(Boolean);
	};
	const flushRef = useRef(flush);
	flushRef.current = flush;

	// answers still waiting are saved when the quiz closes
	useEffect(() => () => void flushRef.current(), []);

	const locked = (id: string) =>
		each &&
		(id in checks || (saved.current.has(id) && isAnswered(answers[id])));

	return {
		answers,
		checks,
		unsure,
		each,
		locked,
		set(questionId: string, answer: Answer) {
			if (locked(questionId)) return;
			setAnswers((a) => ({ ...a, [questionId]: answer }));
			if (each) return;
			// nothing to clear on the server for a question never answered
			if (!isAnswered(answer) && !saved.current.has(questionId)) {
				queued.current.delete(questionId);
				return;
			}
			queued.current.set(questionId, answer);
			clearTimeout(timer.current);
			timer.current = setTimeout(() => void flushRef.current(), DELAY);
		},
		/** with answers after each question: saves and checks this one */
		check: (questionId: string) => {
			const a = answers[questionId];
			return a && isAnswered(a) ? send(questionId, a) : Promise.resolve(false);
		},
		flush,
		toggleUnsure(questionId: string) {
			setUnsure((s) => {
				const next = new Set(s);
				if (next.has(questionId)) next.delete(questionId);
				else next.add(questionId);
				try {
					localStorage.setItem(
						unsureKey(attempt.id),
						JSON.stringify([...next]),
					);
				} catch {
					// the flag still works for this visit
				}
				return next;
			});
		},
	};
}

export type AttemptAnswers = ReturnType<typeof useAttemptAnswers>;
