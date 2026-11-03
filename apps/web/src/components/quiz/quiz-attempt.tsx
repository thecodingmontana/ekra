import { useMutation } from "@apollo/client/react";
import { Button } from "@ekra/ui/components/button";
import { ConfirmModal } from "@ekra/ui/components/modal";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { type QuizAttempt, SUBMIT_QUIZ_ATTEMPT } from "@/graphql/quiz";
import { isAnswered } from "@/lib/quiz-player";
import { AnswerInput } from "./answer-input";
import { CheckPanel, Countdown } from "./attempt-bits";
import { QuizMap } from "./quiz-map";
import { useAttemptAnswers } from "./use-attempt-answers";

/** Taking a quiz, one question at a time, full screen: a countdown, the quiz map, and handing it in. */
export function QuizAttemptView({
	slug,
	title,
	attempt,
	onExit,
	onDone,
}: {
	slug: string;
	title: string;
	attempt: QuizAttempt;
	onExit: () => void;
	onDone: (attempt: QuizAttempt) => void;
}) {
	const a = useAttemptAnswers(slug, attempt);
	const [submit] = useMutation<{ submitQuizAttempt: QuizAttempt }>(
		SUBMIT_QUIZ_ATTEMPT,
	);
	const [index, setIndex] = useState(0);
	const [map, setMap] = useState(false);
	const [confirm, setConfirm] = useState(false);
	const [busy, setBusy] = useState(false);
	const handedIn = useRef(false);
	const questions = attempt.questions;
	const q = questions[index];
	const last = index === questions.length - 1;
	const missing = questions.filter((x) => !isAnswered(a.answers[x.id])).length;

	const handIn = async (timeUp = false) => {
		if (handedIn.current) return;
		handedIn.current = true;
		setBusy(true);
		await a.flush();
		try {
			const res = await submit({ variables: { slug, attemptId: attempt.id } });
			if (res.data) {
				if (timeUp)
					toast.info("Time's up", { desc: "Your answers were handed in." });
				return onDone(res.data.submitQuizAttempt);
			}
		} catch (e) {
			toast.error("Couldn't hand in the quiz", { desc: (e as Error).message });
			// "Answer question N first." points at the question to fix
			const n = /question (\d+)/i.exec((e as Error).message)?.[1];
			if (n) setIndex(Math.min(questions.length - 1, Number(n) - 1));
		}
		handedIn.current = false;
		setBusy(false);
	};

	const needsCheck =
		q && a.each && !a.locked(q.id) && isAnswered(a.answers[q.id]);
	const next = async () => {
		if (!q || busy) return;
		if (needsCheck) {
			setBusy(true);
			await a.check(q.id);
			setBusy(false);
			return;
		}
		if (last) setConfirm(true);
		else setIndex(index + 1);
	};
	const nextRef = useRef(next);
	nextRef.current = next;

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				void nextRef.current();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	if (!q) return null;
	const check = a.checks[q.id];

	return (
		<div
			className="fixed inset-0 z-60 flex flex-col overflow-y-auto bg-background"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			data-testid="quiz-attempt"
		>
			<header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur sm:px-5">
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Close the quiz (your answers are kept)"
					onClick={onExit}
					data-testid="quiz-exit"
				>
					<span
						className="icon-[solar--close-linear] size-4"
						aria-hidden="true"
					/>
				</Button>
				{attempt.deadline && (
					<Countdown
						deadline={attempt.deadline}
						onEnd={() => void handIn(true)}
					/>
				)}
				<span className="hidden min-w-0 truncate text-muted-foreground text-sm sm:block">
					{title}
				</span>
				<Button
					variant="outline"
					size="sm"
					className="ml-auto"
					onClick={() => setMap(true)}
					data-testid="quiz-map"
				>
					<span
						className="icon-[solar--widget-4-linear] size-3.5"
						aria-hidden="true"
					/>
					Quiz map
				</Button>
			</header>

			<main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-4 pt-8 pb-16 sm:pt-14">
				<p
					className="m-0 flex items-center gap-2 text-muted-foreground text-sm"
					data-testid="question-count"
				>
					<span className="font-medium text-foreground">
						Question {index + 1} of {questions.length}
					</span>
					· {q.points} {q.points === 1 ? "point" : "points"}
					{q.required && " · required"}
				</p>
				<h2 className="mt-2 mb-4 font-semibold text-[20px] leading-[1.35] tracking-[-0.015em] sm:text-[22px]">
					{q.prompt}
				</h2>
				{q.image && (
					<img
						src={q.image}
						alt=""
						className="mb-5 max-h-[320px] w-fit max-w-full rounded-[10px] border object-contain"
					/>
				)}
				<AnswerInput
					key={q.id}
					question={q}
					value={a.answers[q.id]}
					onChange={(v) => a.set(q.id, v)}
					locked={a.locked(q.id) || busy}
					right={check?.correctAnswer}
				/>
				{check && <CheckPanel check={check} />}

				<div className="mt-8 flex flex-wrap items-center gap-2">
					<Button
						variant="outline"
						disabled={index === 0}
						onClick={() => setIndex(index - 1)}
						data-testid="quiz-previous"
					>
						Previous
					</Button>
					<Button
						onClick={() => void next()}
						disabled={busy}
						data-testid="quiz-continue"
					>
						{needsCheck ? "Check answer" : last ? "Finish" : "Continue"}
					</Button>
					<span className="hidden text-muted-foreground text-xs sm:inline">
						Press <kbd className="font-sans font-medium">Ctrl</kbd> /{" "}
						<kbd className="font-sans font-medium">⌘</kbd> +{" "}
						<kbd className="font-sans font-medium">Enter</kbd>
					</span>
				</div>
				<label className="mt-4 flex w-fit cursor-pointer items-center gap-2 text-muted-foreground text-sm">
					<input
						type="checkbox"
						checked={a.unsure.has(q.id)}
						onChange={() => a.toggleUnsure(q.id)}
						className="size-4 accent-brand"
						data-testid="quiz-unsure"
					/>
					I'm not sure about this answer yet
				</label>
				<div className="mt-auto flex gap-1 pt-12" aria-hidden="true">
					{questions.map((x, i) => (
						<span
							key={x.id}
							className={cn(
								"h-1 flex-1 rounded-full",
								i === index
									? "bg-foreground"
									: isAnswered(a.answers[x.id])
										? "bg-brand"
										: "bg-muted",
							)}
						/>
					))}
				</div>
			</main>

			<QuizMap
				open={map}
				onOpenChange={setMap}
				ids={questions.map((x) => x.id)}
				answers={a.answers}
				unsure={a.unsure}
				current={index}
				onJump={setIndex}
			/>
			<ConfirmModal
				open={confirm}
				onOpenChange={setConfirm}
				icon="icon-[solar--diploma-verified-linear]"
				title="Hand in your answers?"
				body={
					missing > 0
						? `${missing} ${missing === 1 ? "question isn't" : "questions aren't"} answered yet. You can't change your answers after handing in.`
						: "You can't change your answers after handing in."
				}
				ok="Hand in"
				onConfirm={() => handIn()}
			/>
		</div>
	);
}
