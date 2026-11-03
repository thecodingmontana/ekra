import { useQuery } from "@apollo/client/react";
import { cn } from "@ekra/ui/lib/utils";
import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { z } from "zod";
import { ProgressRing } from "@/components/progress-ring";
import { KIND_ICON, KIND_LABEL } from "@/components/quiz/controls";
import {
	CELL,
	EmptyLine,
	HEAD,
	PAGE,
	PanelSkeleton,
	PersonCell,
	Stat,
	TableSkeleton,
	Tabs,
} from "@/components/reports/report-bits";
import {
	QUIZ_REPORT,
	type QuestionStat,
	type QuizReport,
	type QuizReportData,
} from "@/graphql/report";
import type { QuestionKind } from "@/lib/quiz-builder";
import { type Cell, duration, gridRow, percentOf } from "@/lib/reports";
import { prime, reloadOnEnter } from "@/lib/routing";

const search = z.object({
	tab: z.enum(["questions", "overview"]).optional().catch(undefined),
});

export const Route = createFileRoute("/_authed/o/$slug/reports/quiz/$id")({
	validateSearch: search,
	shouldReload: reloadOnEnter,
	loader: async ({ context, params }) => {
		const { data } = await prime<QuizReportData, { slug: string; id: string }>(
			context.apolloClient,
			{ query: QUIZ_REPORT, variables: { slug: params.slug, id: params.id } },
		);
		if (!data?.quizReport) throw notFound();
		return { title: data.quizReport.content.title };
	},
	head: ({ loaderData, match }) => ({
		meta: [
			{
				title: `${loaderData?.title ?? "Quiz"} · Reports · ${match.context.membership.organization.name}`,
			},
		],
	}),
	component: QuizReportPage,
});

const TABS = [
	["questions", "Questions"],
	["overview", "Overview"],
] as const;

const plural = (n: number, one: string, many = `${one}s`) =>
	`${n} ${n === 1 ? one : many}`;

function QuizReportPage() {
	const { slug, id } = Route.useParams();
	const { tab = "questions" } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const { data } = useQuery<QuizReportData>(QUIZ_REPORT, {
		variables: { slug, id },
	});
	const report = data?.quizReport;

	return (
		<main className={PAGE}>
			<nav
				className="mb-5 flex min-w-0 items-center gap-2 text-muted-foreground text-sm"
				aria-label="Where you are"
			>
				<Link
					to="/o/$slug/reports/content"
					search={{ kind: "quiz" }}
					params={{ slug }}
					className="flex items-center gap-1.5 transition-colors hover:text-foreground"
					data-testid="quiz-report-back"
				>
					<span
						className="icon-[solar--alt-arrow-left-linear] size-3.5 shrink-0"
						aria-hidden="true"
					/>
					Quizzes
				</Link>
			</nav>
			{!report ? (
				<>
					<PanelSkeleton className="mb-4" />
					<TableSkeleton />
				</>
			) : (
				<>
					<Header slug={slug} report={report} />
					<Tabs
						label="Quiz report"
						value={tab}
						tabs={TABS}
						onChange={(t) =>
							navigate({
								search: { tab: t === "questions" ? undefined : t },
								replace: true,
							})
						}
					/>
					{tab === "questions" ? (
						<Questions report={report} />
					) : (
						<Grid report={report} />
					)}
				</>
			)}
		</main>
	);
}

function Header({ slug, report }: { slug: string; report: QuizReport }) {
	return (
		<header className="mb-5">
			<div className="mb-4 flex min-w-0 items-start gap-3">
				<span
					className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-tint-orange/13 text-tint-orange"
					aria-hidden="true"
				>
					<span className="icon-[solar--checklist-minimalistic-linear] size-5" />
				</span>
				<div className="min-w-0">
					<h1 className="break-words font-semibold text-xl leading-[1.2] tracking-[-0.022em] sm:text-2xl">
						{report.content.title}
					</h1>
					<p className="mt-1 flex flex-wrap items-center gap-x-3 text-muted-foreground text-sm">
						<span>Quiz · {plural(report.questionCount, "question")}</span>
						<Link
							to="/o/$slug/library/$id/assignees"
							params={{ slug, id: report.content.id }}
							className="underline-offset-2 hover:text-foreground hover:underline"
						>
							Assignees
						</Link>
					</p>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-4 rounded-[10px] border bg-card p-4 sm:grid-cols-4">
				<Stat label="Accuracy" testId="stat-accuracy">
					{report.accuracy == null ? (
						"—"
					) : (
						<>
							<ProgressRing
								percent={report.accuracy}
								className="size-5 text-tint-amber"
							/>
							{report.accuracy}%
						</>
					)}
				</Stat>
				<Stat label="Completed" testId="stat-completed">
					<ProgressRing
						percent={report.completedPercent}
						className="size-5 text-brand"
					/>
					{report.completedPercent}%
				</Stat>
				<Stat label="Submissions" testId="stat-submissions">
					{report.submissions}
				</Stat>
				<Stat label="Average time" testId="stat-time">
					{duration(report.averageSeconds)}
				</Stat>
			</div>
		</header>
	);
}

function Questions({ report }: { report: QuizReport }) {
	if (report.questions.length === 0)
		return (
			<div className="rounded-[10px] border bg-card">
				<EmptyLine icon="icon-[solar--question-circle-linear]">
					This quiz has no questions yet.
				</EmptyLine>
			</div>
		);
	return (
		<div className="flex flex-col gap-3">
			{report.questions.map((q) => (
				<QuestionCard key={q.id} q={q} count={report.questionCount} />
			))}
		</div>
	);
}

function QuestionCard({ q, count }: { q: QuestionStat; count: number }) {
	const kind = q.kind as QuestionKind;
	const accuracy = percentOf(q.correct, q.answered);
	return (
		<section
			className="rounded-[10px] border bg-card p-4"
			data-testid="question-stat"
		>
			<header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
				<span className="font-medium text-foreground">
					Question {q.position + 1} of {count}
				</span>
				<span className="flex items-center gap-1">
					<span
						aria-hidden="true"
						className={cn(KIND_ICON[kind] ?? KIND_ICON.fill_blank, "size-3.5")}
					/>
					{KIND_LABEL[kind] ?? q.kind}
				</span>
				<span>{plural(q.points, "point")}</span>
			</header>
			<h3 className="mb-3 font-medium">{q.prompt}</h3>
			<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
				<div className="min-w-0">
					{q.answered === 0 ? (
						<p className="text-muted-foreground text-sm">No answers yet.</p>
					) : q.choices.length > 0 ? (
						<ul className="flex flex-col gap-3">
							{q.choices.map((c, i) => {
								const share = percentOf(c.picked, q.answered) ?? 0;
								return (
									<li
										// biome-ignore lint/suspicious/noArrayIndexKey: choices have no id; their order is fixed by the question
										key={`${i}-${c.label}`}
										data-testid="choice-stat"
										data-right={c.right || undefined}
									>
										<div className="mb-1 flex items-center gap-2 text-sm">
											<span
												className={cn(
													"min-w-0 truncate",
													c.right && "font-medium",
												)}
											>
												{c.label}
											</span>
											{c.right && (
												<span className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-[5px] bg-brand/15 px-1.5 font-medium text-[11px] text-foreground">
													<span
														aria-hidden="true"
														className="icon-[solar--check-circle-bold] size-3 text-brand"
													/>
													Right answer
												</span>
											)}
										</div>
										<div className="h-2 overflow-hidden rounded-full bg-muted">
											<div
												className={cn(
													"h-full rounded-full",
													c.right ? "bg-brand" : "bg-tint-red/70",
												)}
												style={{ width: `${share}%` }}
											/>
										</div>
										<span className="mt-1 block text-muted-foreground text-xs tabular-nums">
											{plural(c.picked, "pick")} · {share}%
										</span>
									</li>
								);
							})}
						</ul>
					) : (
						<p className="text-muted-foreground text-sm">
							{plural(q.answered, "answer")} so far; see each learner's result
							in Overview.
						</p>
					)}
				</div>
				<dl className="grid h-fit grid-cols-3 gap-2 rounded-[8px] bg-muted/50 p-3 text-xs sm:grid-cols-1">
					<div>
						<dt className="text-muted-foreground">Correct</dt>
						<dd className="flex items-center gap-1.5 font-semibold text-sm tabular-nums">
							<span
								className="size-2 rounded-full bg-tint-green"
								aria-hidden="true"
							/>
							{q.correct}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Incorrect</dt>
						<dd className="flex items-center gap-1.5 font-semibold text-sm tabular-nums">
							<span
								className="size-2 rounded-full bg-tint-red"
								aria-hidden="true"
							/>
							{q.answered - q.correct}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Accuracy</dt>
						<dd className="flex items-center gap-1.5 font-semibold text-sm tabular-nums">
							{accuracy == null ? (
								"—"
							) : (
								<>
									<ProgressRing
										percent={accuracy}
										className="size-3.5 text-tint-amber"
									/>
									{accuracy}%
								</>
							)}
						</dd>
					</div>
				</dl>
			</div>
		</section>
	);
}

const CELL_ICON: Record<Cell, { icon: string; label: string }> = {
	right: {
		icon: "icon-[solar--check-circle-bold] text-tint-green",
		label: "Right",
	},
	wrong: {
		icon: "icon-[solar--close-circle-bold] text-tint-red",
		label: "Wrong",
	},
	none: { icon: "", label: "Not answered" },
};

/** Learners down the side, question numbers across, a tick, cross or dash in each cell. */
function Grid({ report }: { report: QuizReport }) {
	const n = report.questions.length;
	if (report.learners.length === 0)
		return (
			<div className="rounded-[10px] border bg-card">
				<EmptyLine icon="icon-[solar--users-group-rounded-linear]">
					Nobody has handed this quiz in yet.
				</EmptyLine>
			</div>
		);
	return (
		<div className="overflow-x-auto rounded-[10px] border bg-card">
			<table className="w-full border-collapse text-sm">
				<thead>
					<tr>
						<th className={cn(HEAD, "w-8 pl-4")}>#</th>
						<th
							className={cn(
								HEAD,
								"sticky left-0 z-10 min-w-[200px] bg-card shadow-[1px_0_0_var(--border)]",
							)}
						>
							Learner
						</th>
						<th className={HEAD}>Score</th>
						<th className={HEAD}>Attempts</th>
						{report.questions.map((q) => {
							const right = percentOf(q.correct, q.answered);
							return (
								<th
									key={q.id}
									className={cn(HEAD, "text-center")}
									title={q.prompt}
								>
									<span className="flex flex-col items-center gap-0.5">
										No.{q.position + 1}
										<span className="rounded-[4px] bg-muted px-1 font-normal text-[10px] tabular-nums">
											{right == null ? "—" : `${right}%`}
										</span>
									</span>
								</th>
							);
						})}
					</tr>
				</thead>
				<tbody>
					{report.learners.map((l, i) => (
						<tr key={l.person.id} data-testid="grid-row">
							<td className={cn(CELL, "pl-4 text-muted-foreground")}>
								{i + 1}
							</td>
							<td
								className={cn(
									CELL,
									"sticky left-0 z-10 bg-card shadow-[1px_0_0_var(--border)]",
								)}
							>
								<PersonCell person={l.person} />
							</td>
							<td className={cn(CELL, "whitespace-nowrap")}>
								{l.score == null ? (
									<span className="text-muted-foreground">—</span>
								) : (
									<span className="flex items-center gap-1.5">
										<span className="tabular-nums">
											{l.score}/{l.maxScore ?? "?"}
										</span>
										{l.passed != null && (
											<span
												className={cn(
													"inline-flex h-[18px] items-center rounded-[5px] px-1.5 font-medium text-[11px]",
													l.passed
														? "bg-tint-green/13 text-tint-green"
														: "bg-tint-red/13 text-tint-red",
												)}
											>
												{l.passed ? "Passed" : "Failed"}
											</span>
										)}
									</span>
								)}
							</td>
							<td className={cn(CELL, "tabular-nums")}>{l.attempts}</td>
							{gridRow(l.answers, n).map((c, qi) => (
								<td
									key={report.questions[qi]?.id ?? qi}
									className={cn(CELL, "text-center")}
									data-cell={c}
								>
									{c === "none" ? (
										<span
											className="text-muted-foreground"
											role="img"
											aria-label={CELL_ICON.none.label}
										>
											—
										</span>
									) : (
										<span
											role="img"
											aria-label={CELL_ICON[c].label}
											className={cn(CELL_ICON[c].icon, "inline-block size-4")}
										/>
									)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
