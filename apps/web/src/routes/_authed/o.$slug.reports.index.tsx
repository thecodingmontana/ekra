import { useQuery } from "@apollo/client/react";
import { ago } from "@ekra/core";
import { Button } from "@ekra/ui/components/button";
import { InputWithIcon } from "@ekra/ui/components/input-with-icon";
import { cn } from "@ekra/ui/lib/utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { LearnerFilterBar } from "@/components/reports/learner-filters";
import { LearnerSheet } from "@/components/reports/learner-sheet";
import {
	ActivityLine,
	CELL,
	EmptyLine,
	PAGE,
	Panel,
	PanelSkeleton,
	PercentRing,
	PersonCell,
	ReportsNav,
	SortHead,
	TableSkeleton,
	Tabs,
} from "@/components/reports/report-bits";
import {
	ActiveLearnersChart,
	MostActiveChart,
} from "@/components/reports/report-charts";
import {
	LEARNER_REPORT,
	type LearnerReport,
	type LearnerReportData,
} from "@/graphql/report";
import { downloadCsv } from "@/lib/assignees";
import { mainRole, ROLE_LABEL } from "@/lib/members";
import {
	activeSeries,
	FILTER_ROLES,
	filterLearners,
	LEARNER_SORT,
	LEARNER_STATUSES,
	type LearnerFilters,
	type LearnerSort,
	type LearnerStatus,
	learnersCsv,
	sortRows,
} from "@/lib/reports";
import { prime, reloadOnEnter } from "@/lib/routing";

const search = z.object({
	tab: z.enum(["overview", "progress"]).optional().catch(undefined),
	q: z.string().max(200).optional().catch(undefined),
	sort: z
		.enum(Object.keys(LEARNER_SORT) as [LearnerSort, ...LearnerSort[]])
		.optional()
		.catch(undefined),
	dir: z.enum(["asc", "desc"]).optional().catch(undefined),
	status: z
		.enum(
			LEARNER_STATUSES.map(([k]) => k) as [LearnerStatus, ...LearnerStatus[]],
		)
		.optional()
		.catch(undefined),
	role: z.enum(FILTER_ROLES).optional().catch(undefined),
	content: z.string().max(64).optional().catch(undefined),
	learner: z.string().max(64).optional().catch(undefined),
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
	const params = Route.useSearch();
	const { tab = "overview", learner } = params;
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
					params={params}
					setSearch={setSearch}
				/>
			)}
			<LearnerSheet
				slug={slug}
				userId={learner}
				onClose={() => setSearch({ learner: undefined })}
			/>
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
	const series = activeSeries(report.weeklyActive);
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
				title="Weekly active learners"
				sub="People active each week, each counted once, last 8 weeks"
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

const COLUMNS: [LearnerSort, string][] = [
	["assigned", "Assigned"],
	["completed", "Completed"],
	["inProgress", "In progress"],
	["overdue", "Overdue"],
	["percent", "Average progress"],
	["lastOpened", "Last opened"],
];

function Progress({
	slug,
	report,
	params,
	setSearch,
}: {
	slug: string;
	report: LearnerReport | undefined;
	params: Search;
	setSearch: (patch: Partial<Search>) => void;
}) {
	const { q = "", sort, dir = "asc", status, role, content } = params;
	const learners = report?.learners ?? [];
	const filters: LearnerFilters = { status, role, content };
	const filtered = filterLearners(learners, q, filters);
	const shown = sort ? sortRows(filtered, LEARNER_SORT[sort], dir) : filtered;
	const onSort = (id: LearnerSort, d: "asc" | "desc") =>
		setSearch({ sort: id, dir: d === "asc" ? undefined : d });
	const open = (id: string) => setSearch({ learner: id });

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
						onChange={(e) => setSearch({ q: e.target.value || undefined })}
						data-testid="learner-search"
					/>
				</div>
				<LearnerFilterBar
					filters={filters}
					content={report?.assignedContent ?? []}
					onChange={(f) =>
						setSearch({
							status: f.status,
							role: f.role,
							content: f.content,
						})
					}
				/>
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
								<SortHead
									id="name"
									label="Full name"
									sort={sort}
									dir={dir}
									onSort={onSort}
									className="pl-4"
								/>
								{COLUMNS.map(([id, label]) => (
									<SortHead
										key={id}
										id={id}
										label={label}
										sort={sort}
										dir={dir}
										onSort={onSort}
									/>
								))}
							</tr>
						</thead>
						<tbody>
							{shown.map((r) => (
								<tr
									key={r.person.id}
									className="cursor-pointer hover:bg-muted/40"
									onClick={() => open(r.person.id)}
									data-testid="learner-row"
								>
									<td className={cn(CELL, "pl-4")}>
										<button
											type="button"
											className="-m-1 flex min-w-0 rounded-md p-1 text-left focus-visible:outline-2 focus-visible:outline-ring"
											onClick={(e) => {
												e.stopPropagation();
												open(r.person.id);
											}}
											aria-label={`Open ${r.person.name}'s details`}
											data-testid="learner-open"
										>
											<PersonCell person={r.person} />
										</button>
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
													onClick={(e) => e.stopPropagation()}
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
												: "No learners match your search and filters."}
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
