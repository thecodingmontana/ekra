import { useApolloClient, useMutation, useQuery } from "@apollo/client/react";
import { ago } from "@ekra/core";
import { Button } from "@ekra/ui/components/button";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import { type ReactNode, useState } from "react";
import {
	QUIZ_ATTEMPT,
	QUIZ_OVERVIEW,
	type QuizAttempt,
	type QuizOverviewData,
	START_QUIZ_ATTEMPT,
} from "@/graphql/quiz";
import { QuizAttemptView } from "./quiz-attempt";
import { QuizResults } from "./quiz-results";

/** A quiz for whoever takes it: the rules and past attempts, then the attempt, then its results. */
export function QuizPlayer({
	slug,
	id,
	title,
	preview,
}: {
	slug: string;
	id: string;
	title: string;
	/** a trainer trying it out */
	preview?: boolean;
}) {
	const client = useApolloClient();
	const { data, error, refetch } = useQuery<QuizOverviewData>(QUIZ_OVERVIEW, {
		variables: { slug, id },
		fetchPolicy: "cache-and-network",
	});
	const [start, { loading: starting }] = useMutation<{
		startQuizAttempt: QuizAttempt;
	}>(START_QUIZ_ATTEMPT);
	const [open, setOpen] = useState<QuizAttempt | null>(null);
	const [opening, setOpening] = useState<string | null>(null);

	const o = data?.quizOverview;
	if (error && !o)
		return (
			<p role="alert" className="m-0 text-destructive text-sm">
				Couldn't load the quiz: {error.message}
			</p>
		);
	if (!o) return null;
	const s = o.settings;
	const canStart =
		o.questionCount > 0 && (o.attemptsLeft == null || o.attemptsLeft > 0);

	const begin = async () => {
		try {
			const res = await start({ variables: { slug, quizId: id } });
			if (res.data) setOpen(res.data.startQuizAttempt);
		} catch (e) {
			toast.error("Couldn't start the quiz", { desc: (e as Error).message });
		}
	};
	const show = async (attemptId: string) => {
		setOpening(attemptId);
		try {
			const res = await client.query<{ quizAttempt: QuizAttempt | null }>({
				query: QUIZ_ATTEMPT,
				variables: { slug, id: attemptId },
				fetchPolicy: "network-only",
			});
			if (res.data?.quizAttempt) setOpen(res.data.quizAttempt);
		} catch (e) {
			toast.error("Couldn't open that attempt", { desc: (e as Error).message });
		} finally {
			setOpening(null);
		}
	};
	const close = () => {
		setOpen(null);
		void refetch();
	};

	const rules: [string, ReactNode][] = [
		[
			"icon-[solar--checklist-minimalistic-linear]",
			`${o.questionCount} ${o.questionCount === 1 ? "question" : "questions"}`,
		],
		[
			"icon-[solar--clock-circle-linear]",
			s.timeLimitSeconds
				? `${Math.round(s.timeLimitSeconds / 60)} min time limit`
				: "No time limit",
		],
		[
			"icon-[solar--medal-ribbon-linear]",
			s.passPercent ? `Pass mark ${s.passPercent}%` : "No pass mark",
		],
		[
			"icon-[solar--restart-linear]",
			o.attemptsLeft == null
				? "Unlimited attempts"
				: `${o.attemptsLeft} ${o.attemptsLeft === 1 ? "attempt" : "attempts"} left`,
		],
	];

	return (
		<section className="flex flex-col gap-4" data-testid="quiz-overview">
			<div className="rounded-[12px] border bg-card p-5">
				{preview && (
					<p className="m-0 mb-3 inline-flex items-center gap-1.5 rounded-md bg-tint-amber/12 px-2 py-1 text-tint-amber text-xs">
						<span
							className="icon-[solar--eye-linear] size-3.5"
							aria-hidden="true"
						/>
						Preview: your attempts count like a learner's.
					</p>
				)}
				<ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
					{rules.map(([icon, text]) => (
						<li key={icon} className="flex items-center gap-2 text-sm">
							<span
								className={cn(icon, "size-4 shrink-0 text-muted-foreground")}
								aria-hidden="true"
							/>
							{text}
						</li>
					))}
				</ul>
				{s.showAnswers !== "never" && (
					<p className="m-0 mt-3 text-muted-foreground text-sm">
						{s.showAnswers === "after_each"
							? "You'll see if each answer is right as you go; an answer can't be changed once checked."
							: "You'll see the right answers when you hand it in."}
					</p>
				)}
				<div className="mt-5 flex flex-wrap items-center gap-3">
					{o.openAttemptId ? (
						<Button
							onClick={begin}
							disabled={starting}
							data-testid="quiz-start"
						>
							Continue the quiz
						</Button>
					) : (
						<Button
							onClick={begin}
							disabled={!canStart || starting}
							data-testid="quiz-start"
						>
							{o.attempts.length ? "Start again" : "Start the quiz"}
						</Button>
					)}
					{!canStart && !o.openAttemptId && (
						<span className="text-muted-foreground text-sm">
							{o.questionCount === 0
								? "This quiz has no questions yet."
								: "You've used all your attempts."}
						</span>
					)}
				</div>
			</div>

			{o.attempts.some((a) => a.submittedAt) && (
				<div className="rounded-[12px] border bg-card">
					<h3 className="m-0 border-b px-4 py-2.5 font-semibold text-sm">
						Your attempts
					</h3>
					<ul className="m-0 list-none p-0">
						{o.attempts
							.filter((a) => a.submittedAt)
							.map((a, i) => (
								<li
									key={a.id}
									className="flex items-center gap-3 border-border/60 border-t px-4 py-2.5 first:border-t-0 text-sm"
									data-testid="attempt-row"
								>
									<span className="font-medium">Attempt {i + 1}</span>
									<span
										className="text-muted-foreground"
										suppressHydrationWarning
									>
										{ago(a.submittedAt ?? a.startedAt)}
									</span>
									<span className="ml-auto tabular-nums">
										{a.score} / {a.maxScore}
									</span>
									{a.passed != null && (
										<span
											className={cn(
												"rounded-md px-1.5 py-0.5 font-medium text-xs",
												a.passed
													? "bg-tint-green/12 text-tint-green"
													: "bg-destructive/10 text-destructive",
											)}
										>
											{a.passed ? "Passed" : "Not passed"}
										</span>
									)}
									<Button
										variant="ghost"
										size="sm"
										onClick={() => void show(a.id)}
										disabled={opening === a.id}
									>
										Review
									</Button>
								</li>
							))}
					</ul>
				</div>
			)}

			{open?.submittedAt ? (
				<QuizResults
					title={title}
					attempt={open}
					onClose={close}
					onRetry={
						o.attemptsLeft == null || o.attemptsLeft > 1
							? () => {
									setOpen(null);
									void begin();
								}
							: undefined
					}
				/>
			) : open ? (
				<QuizAttemptView
					slug={slug}
					title={title}
					attempt={open}
					onExit={close}
					onDone={(done) => {
						setOpen(done);
						void refetch();
					}}
				/>
			) : null}
		</section>
	);
}
