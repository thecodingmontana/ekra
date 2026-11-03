import { useQuery } from "@apollo/client/react";
import { ago } from "@ekra/core";
import { Av } from "@ekra/ui/components/av";
import { Button } from "@ekra/ui/components/button";
import { InputWithIcon } from "@ekra/ui/components/input-with-icon";
import { cn } from "@ekra/ui/lib/utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
	CELL,
	EmptyLine,
	HEAD,
	PAGE,
	Panel,
	PanelSkeleton,
	PercentRing,
	PersonCell,
	ReportsNav,
	TableSkeleton,
	Tabs,
} from "@/components/reports/report-bits";
import {
	ActiveLearnersChart,
	MostActiveChart,
} from "@/components/reports/report-charts";
import {
	type ActivityEvent,
	LEARNER_REPORT,
	type LearnerReport,
	type LearnerReportData,
} from "@/graphql/report";
import { downloadCsv } from "@/lib/assignees";
import { KINDS } from "@/lib/content-kinds";
import { mainRole, ROLE_LABEL } from "@/lib/members";
import {
	activeSeries,
	EVENT_VERB,
	filterLearners,
	learnersCsv,
} from "@/lib/reports";
import { prime, reloadOnEnter } from "@/lib/routing";

const search = z.object({
	tab: z.enum(["overview", "progress"]).optional().catch(undefined),
	q: z.string().max(200).optional().catch(undefined),
});
type Search = z.infer<typeof search>;

export const Route = createFileRoute("/_authed/o/$slug/reports/")({
	validateSearch: search,
	shouldReload: reloadOnEnter,
	loader: ({ context, params }) =>
		prime(context.apolloClient, {
			query: LEARNER_REPORT,
			variables: { slug: params.slug },
		}),
	head: ({ match }) => ({
		meta: [
			{
				title: `Learners · Reports · ${match.context.membership.organization.name}`,
			},
		],
	}),
	component: LearnersReportPage,
});

const TABS = [
	["overview", "Overview"],
	["progress", "Progress"],
] as const;

function LearnersReportPage() {
	const { slug } = Route.useParams();
	const { tab = "overview", q = "" } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const setSearch = (patch: Partial<Search>) =>
		navigate({ search: (s) => ({ ...s, ...patch }), replace: true });
	const { data } = useQuery<LearnerReportData>(LEARNER_REPORT, {
		variables: { slug },
	});
	const report = data?.learnerReport;

	return (
		<main className={PAGE}>
			<h1 className="mb-3 font-semibold text-xl leading-[1.2] tracking-[-0.022em] sm:text-2xl">
				Reports
			</h1>
			<ReportsNav slug={slug} />
			<Tabs
				label="Learner report"
				value={tab}
				tabs={TABS}
				onChange={(t) => setSearch({ tab: t === "overview" ? undefined : t })}
			/>
			{tab === "overview" ? (
				<Overview slug={slug} report={report} />
			) : (
				<Progress
					slug={slug}
					report={report}
					q={q}
					onSearch={(v) => setSearch({ q: v || undefined })}
				/>
			)}
		</main>
	);
}

const GRID = "grid gap-3 lg:grid-cols-2";

function Overview({
	slug,
	report,
}: {
	slug: string;
	report: LearnerReport | undefined;
}) {
	if (!report)
		return (
			<div className={GRID}>
				<PanelSkeleton />
				<PanelSkeleton />
				<PanelSkeleton />
				<PanelSkeleton />
			</div>
		);
	const series = activeSeries(report.dailyActive);
	const anyActive = series.some((p) => p.learners > 0);
	return (
		<div className={GRID}>
			<Panel
				title="Total learners"
				sub="People in this organization who take learning"
				testId="total-learners"
			>
				<p className="font-semibold text-4xl tabular-nums tracking-[-0.02em]">
					{report.totalLearners}
				</p>
				<p className="mt-1 text-muted-foreground text-sm">
					{report.learners.filter((l) => l.assigned > 0).length} with something
					assigned
				</p>
				<dl className="mt-5 grid grid-cols-3 gap-2 border-t pt-4">
					{(
						[
							["Completed", "completed", "bg-tint-green"],
							["In progress", "inProgress", "bg-tint-amber"],
							["Overdue", "overdue", "bg-tint-red"],
						] as const
					).map(([label, key, dot]) => (
						<div key={key} className="min-w-0">
							<dt className="flex items-center gap-1.5 text-muted-foreground text-xs">
								<span
									className={cn("size-2 shrink-0 rounded-full", dot)}
									aria-hidden="true"
								/>
								{label}
							</dt>
							<dd className="font-semibold text-lg tabular-nums">
								{report.learners.reduce((n, l) => n + l[key], 0)}
							</dd>
						</div>
					))}
				</dl>
			</Panel>
			<Panel
				title="Most active learners"
				sub="Things started and finished, last 7 days"
				testId="most-active"
			>
				{report.mostActive.length > 0 ? (
					<MostActiveChart
						data={report.mostActive.map((m) => ({
							name: m.person.name,
							count: m.count,
						}))}
					/>
				) : (
					<EmptyLine icon="icon-[solar--chart-2-linear]">
						Nobody was active in the last 7 days.
					</EmptyLine>
				)}
			</Panel>
			<Panel
				title="Daily active learners"
				sub="Learners active each day, last 8 weeks"
				className="lg:col-span-2"
				testId="weekly-active"
			>
				{anyActive ? (
					<ActiveLearnersChart data={series} />
				) : (
					<EmptyLine icon="icon-[solar--graph-up-linear]">
						No one has been active in the last 8 weeks.
					</EmptyLine>
				)}
			</Panel>
			<Panel
				title="Learner activity"
				sub="The latest starts, completions and quiz results"
				className="lg:col-span-2"
				testId="learner-activity"
			>
				{report.recent.length > 0 ? (
					<ul className="-mx-1 flex flex-col">
						{report.recent.map((e) => (
							<ActivityLine
								key={`${e.at}-${e.person.id}-${e.kind}-${e.content.id}`}
								slug={slug}
								event={e}
							/>
						))}
					</ul>
				) : (
					<EmptyLine icon="icon-[solar--history-linear]">
						No activity yet. It shows here once learners start their learning.
					</EmptyLine>
				)}
			</Panel>
		</div>
	);
}

const EVENT_TONE: Record<ActivityEvent["kind"], string> = {
	started: "text-tint-blue bg-tint-blue/13",
	completed: "text-tint-green bg-tint-green/13",
	passed: "text-tint-green bg-tint-green/13",
	failed: "text-tint-red bg-tint-red/13",
};

/** "Leo Learner completed Forklift basics · 2h ago" */
function ActivityLine({ slug, event }: { slug: string; event: ActivityEvent }) {
	const kind = KINDS[event.content.kind];
	return (
		<li
			className="flex items-center gap-2.5 rounded-md px-1 py-1.5"
			data-testid="activity-line"
		>
			<Av name={event.person.name} image={event.person.image} size="md" />
			<p className="min-w-0 flex-1 text-sm leading-snug">
				<b className="font-medium">{event.person.name}</b>{" "}
				<span
					className={cn(
						"inline-flex h-[18px] items-center rounded-[5px] px-1.5 font-medium text-[11px]",
						EVENT_TONE[event.kind],
					)}
				>
					{EVENT_VERB[event.kind]}
				</span>{" "}
				<Link
					to="/o/$slug/library/$id"
					params={{ slug, id: event.content.id }}
					className="inline-flex max-w-full items-center gap-1 align-bottom font-medium underline-offset-2 hover:underline"
				>
					<span
						aria-hidden="true"
						className={cn(kind.icon, "size-3.5 shrink-0 text-muted-foreground")}
					/>
					<span className="truncate">{event.content.title}</span>
				</Link>
			</p>
			<time
				dateTime={event.at}
				className="shrink-0 text-muted-foreground text-xs"
				suppressHydrationWarning
			>
				{ago(event.at)}
			</time>
		</li>
	);
}

function Progress({
	slug,
	report,
	q,
	onSearch,
}: {
	slug: string;
	report: LearnerReport | undefined;
	q: string;
	onSearch: (q: string) => void;
}) {
	const learners = report?.learners ?? [];
	const shown = filterLearners(learners, q);

	return (
		<>
			<div className="mb-3 flex flex-wrap items-center gap-2">
				<div className="min-w-0 flex-1 basis-56 sm:max-w-[320px]">
					<InputWithIcon
						icon="icon-[solar--magnifer-linear]"
						className="h-[30px]"
						placeholder="Search learners"
						aria-label="Search learners"
						value={q}
						onChange={(e) => onSearch(e.target.value)}
						data-testid="learner-search"
					/>
				</div>
				<Button
					variant="outline"
					className="ml-auto"
					disabled={shown.length === 0}
					onClick={() =>
						downloadCsv(
							"Learner progress",
							learnersCsv(
								shown.map((r) => ({
									...r,
									roleLabel: ROLE_LABEL[mainRole(r.person.role)],
								})),
							),
						)
					}
					data-testid="export-csv"
				>
					<span
						className="icon-[solar--download-minimalistic-linear] size-3.5"
						aria-hidden="true"
					/>
					Export CSV
				</Button>
			</div>
			{!report ? (
				<TableSkeleton />
			) : (
				<div className="overflow-x-auto rounded-[10px] border bg-card">
					<table className="w-full min-w-[860px] border-collapse text-sm">
						<thead>
							<tr>
								<th className={cn(HEAD, "pl-4")}>Full name</th>
								<th className={HEAD}>Assigned</th>
								<th className={HEAD}>Completed</th>
								<th className={HEAD}>In progress</th>
								<th className={HEAD}>Overdue</th>
								<th className={HEAD}>Average progress</th>
								<th className={HEAD}>Last opened</th>
							</tr>
						</thead>
						<tbody>
							{shown.map((r) => (
								<tr key={r.person.id} data-testid="learner-row">
									<td className={cn(CELL, "pl-4")}>
										<PersonCell person={r.person} />
									</td>
									<td className={cn(CELL, "tabular-nums")}>{r.assigned}</td>
									<td className={cn(CELL, "tabular-nums")}>{r.completed}</td>
									<td className={cn(CELL, "tabular-nums")}>{r.inProgress}</td>
									<td
										className={cn(
											CELL,
											"tabular-nums",
											r.overdue > 0 && "font-medium text-tint-red",
										)}
									>
										{r.overdue}
									</td>
									<td className={CELL}>
										<PercentRing percent={r.percent} />
									</td>
									<td className={cn(CELL, "max-w-[260px]")}>
										{r.lastOpened ? (
											<span className="flex min-w-0 flex-col">
												<Link
													to="/o/$slug/library/$id"
													params={{ slug, id: r.lastOpened.id }}
													className="truncate font-medium underline-offset-2 hover:underline"
												>
													{r.lastOpened.title}
												</Link>
												{r.lastOpenedAt && (
													<span
														className="text-muted-foreground text-xs"
														suppressHydrationWarning
													>
														{ago(r.lastOpenedAt)}
													</span>
												)}
											</span>
										) : (
											<span className="text-muted-foreground">Nothing yet</span>
										)}
									</td>
								</tr>
							))}
							{shown.length === 0 && (
								<tr>
									<td colSpan={7}>
										<EmptyLine icon="icon-[solar--users-group-rounded-linear]">
											{learners.length === 0
												? "No learners yet. Invite people to your organization to see their progress here."
												: "No learners match your search."}
										</EmptyLine>
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			)}
		</>
	);
}
