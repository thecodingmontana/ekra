import { useQuery } from "@apollo/client/react";
import { cn } from "@ekra/ui/lib/utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
	CELL,
	EmptyLine,
	HEAD,
	PAGE,
	PercentRing,
	ReportsNav,
	TableSkeleton,
	Tabs,
} from "@/components/reports/report-bits";
import {
	CONTENT_REPORT,
	type ContentReportData,
	type ContentReportRow,
} from "@/graphql/report";
import { KINDS } from "@/lib/content-kinds";
import { REPORT_KINDS, type ReportKind } from "@/lib/reports";
import { prime, reloadOnEnter } from "@/lib/routing";

const search = z.object({
	kind: z.enum(REPORT_KINDS).optional().catch(undefined),
});

export const Route = createFileRoute("/_authed/o/$slug/reports/content")({
	validateSearch: search,
	loaderDeps: ({ search }) => ({ kind: search.kind ?? "course" }),
	shouldReload: reloadOnEnter,
	loader: ({ context, params, deps }) =>
		prime(context.apolloClient, {
			query: CONTENT_REPORT,
			variables: { slug: params.slug, kind: deps.kind },
		}),
	head: ({ match }) => ({
		meta: [
			{
				title: `Content · Reports · ${match.context.membership.organization.name}`,
			},
		],
	}),
	component: ContentReportPage,
});

const TABS = REPORT_KINDS.map((k) => [k, KINDS[k].plural] as const);

const STATUS: Record<string, string> = {
	published: "text-tint-green bg-tint-green/13",
	draft: "text-muted-foreground bg-muted",
};

function ContentReportPage() {
	const { slug } = Route.useParams();
	const { kind = "course" } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const { data } = useQuery<ContentReportData>(CONTENT_REPORT, {
		variables: { slug, kind },
	});
	const rows = data?.contentReport;
	const quiz = kind === "quiz";

	return (
		<main className={PAGE}>
			<h1 className="mb-3 font-semibold text-xl leading-[1.2] tracking-[-0.022em] sm:text-2xl">
				Reports
			</h1>
			<ReportsNav slug={slug} />
			<Tabs<ReportKind>
				label="Kinds of content"
				value={kind}
				tabs={TABS}
				onChange={(k) =>
					navigate({
						search: { kind: k === "course" ? undefined : k },
						replace: true,
					})
				}
			/>
			{!rows ? (
				<TableSkeleton />
			) : (
				<div className="overflow-x-auto rounded-[10px] border bg-card">
					<table className="w-full min-w-[720px] border-collapse text-sm">
						<thead>
							<tr>
								<th className={cn(HEAD, "pl-4")}>{KINDS[kind].label}</th>
								<th className={HEAD}>Status</th>
								<th className={HEAD}>Learners</th>
								<th className={HEAD}>Completed</th>
								<th className={HEAD}>Average progress</th>
								{quiz && <th className={HEAD}>Accuracy</th>}
								<th className={CELL}>
									<span className="sr-only">Open</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => (
								<Row key={r.content.id} slug={slug} row={r} quiz={quiz} />
							))}
							{rows.length === 0 && (
								<tr>
									<td colSpan={quiz ? 7 : 6}>
										<EmptyLine icon={KINDS[kind].icon}>
											No {KINDS[kind].plural.toLowerCase()} yet. Create one in
											the library and give it to learners to see how they do.
										</EmptyLine>
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			)}
		</main>
	);
}

/** One item; quizzes open their report, everything else who has it. */
function Row({
	slug,
	row,
	quiz,
}: {
	slug: string;
	row: ContentReportRow;
	quiz: boolean;
}) {
	const kind = KINDS[row.content.kind];
	const title = (
		<span className="flex min-w-0 items-center gap-2.5">
			<span
				className={cn(
					"grid size-7 shrink-0 place-items-center rounded-md",
					kind.tint,
				)}
				aria-hidden="true"
			>
				<span className={cn(kind.icon, "size-4")} />
			</span>
			<b className="truncate font-medium">{row.content.title}</b>
		</span>
	);
	const linkClass =
		"flex min-w-0 items-center rounded-sm underline-offset-2 hover:underline";
	return (
		<tr className="hover:bg-muted/40" data-testid="content-row">
			<td className={cn(CELL, "max-w-[360px] pl-4")}>
				{quiz ? (
					<Link
						to="/o/$slug/reports/quiz/$id"
						params={{ slug, id: row.content.id }}
						className={linkClass}
					>
						{title}
					</Link>
				) : (
					<Link
						to="/o/$slug/library/$id/assignees"
						params={{ slug, id: row.content.id }}
						className={linkClass}
					>
						{title}
					</Link>
				)}
			</td>
			<td className={CELL}>
				<span
					className={cn(
						"inline-flex h-5 items-center rounded-[5px] px-1.5 font-medium text-xs capitalize",
						STATUS[row.status] ?? STATUS.draft,
					)}
				>
					{row.status}
				</span>
			</td>
			<td className={cn(CELL, "tabular-nums")}>{row.learners}</td>
			<td className={cn(CELL, "tabular-nums")}>{row.completed}</td>
			<td className={CELL}>
				{row.learners > 0 ? (
					<PercentRing percent={row.percent} />
				) : (
					<span className="text-muted-foreground">—</span>
				)}
			</td>
			{quiz && (
				<td className={CELL}>
					<PercentRing percent={row.accuracy} tone="text-tint-amber" />
				</td>
			)}
			<td className={cn(CELL, "pr-4 text-right")}>
				<span
					aria-hidden="true"
					className="icon-[solar--alt-arrow-right-linear] size-4 text-muted-foreground"
				/>
			</td>
		</tr>
	);
}
