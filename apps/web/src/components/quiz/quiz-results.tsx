import { Button } from "@ekra/ui/components/button";
import { cn } from "@ekra/ui/lib/utils";
import type { QuizAttempt } from "@/graphql/quiz";
import type { Answer } from "@/lib/quiz-player";
import { AnswerInput, json } from "./answer-input";
import { KIND_ICON, KIND_LABEL } from "./controls";

/** A handed-in attempt: the score, passed or not with the quiz's message, and each question reviewed. */
export function QuizResults({
	title,
	attempt,
	onClose,
	onRetry,
}: {
	title: string;
	attempt: QuizAttempt;
	onClose: () => void;
	/** another attempt is allowed */
	onRetry?: () => void;
}) {
	const result = attempt.result;
	if (!result) return null;
	const answers = json<Record<string, Answer>>(attempt.answers) ?? {};
	const percent = result.maxScore
		? Math.round((result.score * 100) / result.maxScore)
		: 0;
	const right = result.review.filter((r) => r.correct).length;
	const tone = result.passed === false ? "text-destructive" : "text-tint-green";

	return (
		<div
			className="fixed inset-0 z-60 flex flex-col overflow-y-auto bg-background"
			role="dialog"
			aria-modal="true"
			aria-label={`${title}: results`}
			data-testid="quiz-results"
		>
			<header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur sm:px-5">
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Close the results"
					onClick={onClose}
					data-testid="results-close"
				>
					<span
						className="icon-[solar--close-linear] size-4"
						aria-hidden="true"
					/>
				</Button>
				<span className="min-w-0 truncate font-medium text-sm">{title}</span>
			</header>
			<main className="mx-auto w-full max-w-[720px] px-4 pt-8 pb-16 sm:pt-12">
				<section className="flex flex-col items-center gap-3 rounded-[14px] border bg-card px-5 py-8 text-center">
					<Ring percent={percent} tone={tone} />
					<h2
						className={cn(
							"m-0 font-semibold text-xl",
							result.passed != null && tone,
						)}
						data-testid="results-verdict"
					>
						{result.passed === true
							? "You passed"
							: result.passed === false
								? "You didn't pass this time"
								: "Quiz finished"}
					</h2>
					<p className="m-0 text-muted-foreground" data-testid="results-score">
						{result.score} of {result.maxScore} points · {right} of{" "}
						{result.review.length} questions right
					</p>
					{result.message && (
						<p
							className="m-0 max-w-[460px] whitespace-pre-line text-[15px]"
							data-testid="results-message"
						>
							{result.message}
						</p>
					)}
					<div className="mt-2 flex gap-2">
						<Button variant="outline" onClick={onClose}>
							Done
						</Button>
						{onRetry && (
							<Button onClick={onRetry} data-testid="results-retry">
								Try again
							</Button>
						)}
					</div>
				</section>

				<h3 className="mt-8 mb-3 font-semibold text-md">Your answers</h3>
				<ol className="m-0 flex list-none flex-col gap-3 p-0">
					{attempt.questions.map((q, i) => {
						const r = result.review.find((x) => x.questionId === q.id);
						return (
							<li
								key={q.id}
								className="rounded-[10px] border bg-card p-4"
								data-testid="review-question"
							>
								<div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
									<span className="font-medium">Question {i + 1}</span>
									<span
										className={cn(
											"inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-xs",
											r?.correct
												? "bg-tint-green/12 text-tint-green"
												: "bg-destructive/10 text-destructive",
										)}
									>
										<span
											className={cn(
												r?.correct
													? "icon-[solar--check-circle-linear]"
													: "icon-[solar--close-circle-linear]",
												"size-3.5",
											)}
											aria-hidden="true"
										/>
										{r?.correct ? "Right" : "Wrong"}
									</span>
									<span className="ml-auto flex items-center gap-1 text-muted-foreground text-xs">
										<span
											className={cn(KIND_ICON[q.kind], "size-3")}
											aria-hidden="true"
										/>
										{KIND_LABEL[q.kind]} · {q.points}{" "}
										{q.points === 1 ? "point" : "points"}
									</span>
								</div>
								<p className="m-0 mb-3 font-medium text-[15px]">{q.prompt}</p>
								{q.image && (
									<img
										src={q.image}
										alt=""
										className="mb-3 max-h-48 rounded-md border"
									/>
								)}
								<AnswerInput
									question={q}
									value={answers[q.id]}
									onChange={() => {}}
									locked
									right={r?.correctAnswer}
								/>
								{r?.explanation && (
									<p className="m-0 mt-3 rounded-md bg-muted/60 px-3 py-2 text-sm">
										<span className="font-medium">Why: </span>
										{r.explanation}
									</p>
								)}
							</li>
						);
					})}
				</ol>
			</main>
		</div>
	);
}

function Ring({ percent, tone }: { percent: number; tone: string }) {
	const r = 34;
	const c = 2 * Math.PI * r;
	return (
		<span className={cn("relative grid size-24 place-items-center", tone)}>
			<svg
				viewBox="0 0 80 80"
				className="absolute inset-0 -rotate-90"
				aria-hidden="true"
			>
				<circle
					cx="40"
					cy="40"
					r={r}
					fill="none"
					stroke="var(--muted)"
					strokeWidth="7"
				/>
				<circle
					cx="40"
					cy="40"
					r={r}
					fill="none"
					stroke="currentColor"
					strokeWidth="7"
					strokeLinecap="round"
					strokeDasharray={c}
					strokeDashoffset={c - (c * percent) / 100}
				/>
			</svg>
			<span className="font-semibold text-foreground text-xl tabular-nums">
				{percent}%
			</span>
		</span>
	);
}
