import type { ContentKind } from "../graphql/library.ts";
import type {
	ActivityEvent,
	ContentReportRow,
	DayCount,
	LearnerRow,
} from "../graphql/report.ts";
import { csvText } from "./assignees.ts";
import { mainRole } from "./members.ts";

/** The kinds the content report has a tab for, in tab order (folders hold nothing to report). */
export const REPORT_KINDS = [
	"course",
	"quiz",
	"path",
	"page",
	"assignment",
	"wiki",
] as const satisfies readonly ContentKind[];
export type ReportKind = (typeof REPORT_KINDS)[number];

export const EVENT_VERB: Record<ActivityEvent["kind"], string> = {
	started: "started",
	completed: "completed",
	passed: "passed",
	failed: "failed",
};

const utc = (d: string) => new Date(`${d}T00:00:00Z`);

/** "3 Nov" for a "YYYY-MM-DD" day, the same on every machine. */
export const dayLabel = (d: string) =>
	utc(d).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});

/** One chart point per week (the server sends every week, oldest first), labelled by the week's first day. */
export const activeSeries = (weeks: readonly DayCount[]) =>
	weeks.map((w) => ({ day: w.day, label: dayLabel(w.day), learners: w.count }));

export const LEARNER_STATUSES = [
	["overdue", "Has overdue"],
	["in_progress", "Has in progress"],
	["completed", "All completed"],
	["none", "Nothing assigned"],
] as const;
export type LearnerStatus = (typeof LEARNER_STATUSES)[number][0];
export const FILTER_ROLES = ["learner", "trainer", "admin", "owner"] as const;
export type LearnerFilters = {
	status?: LearnerStatus;
	role?: (typeof FILTER_ROLES)[number];
	/** a content id: people who have it assigned */
	content?: string;
};

const STATUS_TEST: Record<
	LearnerStatus,
	(
		r: Pick<LearnerRow, "assigned" | "completed" | "inProgress" | "overdue">,
	) => boolean
> = {
	overdue: (r) => r.overdue > 0,
	in_progress: (r) => r.inProgress > 0,
	completed: (r) => r.assigned > 0 && r.completed === r.assigned,
	none: (r) => r.assigned === 0,
};

/** Learners whose name has the search text (any case) and who pass every filter set. */
export function filterLearners<
	T extends Pick<
		LearnerRow,
		| "person"
		| "assigned"
		| "completed"
		| "inProgress"
		| "overdue"
		| "assignedIds"
	>,
>(rows: readonly T[], search: string, filters: LearnerFilters = {}): T[] {
	const q = search.trim().toLowerCase();
	const { status, role, content } = filters;
	return rows.filter(
		(r) =>
			(!q || r.person.name.toLowerCase().includes(q)) &&
			(!status || STATUS_TEST[status](r)) &&
			(!role || mainRole(r.person.role) === role) &&
			(!content || r.assignedIds.includes(content)),
	);
}

export type SortDir = "asc" | "desc";
type SortValue = string | number | null | undefined;

/**
 * The rows ordered by one value, ascending or descending; text ignores case, equal values keep their order,
 * and rows without a value always go last.
 */
export function sortRows<T>(
	rows: readonly T[],
	value: (row: T) => SortValue,
	dir: SortDir,
): T[] {
	const sign = dir === "desc" ? -1 : 1;
	return rows
		.map((row, i) => ({ row, i, v: value(row) }))
		.sort((a, b) => {
			const an = a.v == null;
			const bn = b.v == null;
			if (an || bn) return an === bn ? a.i - b.i : an ? 1 : -1;
			const c =
				typeof a.v === "string" && typeof b.v === "string"
					? a.v.localeCompare(b.v, undefined, { sensitivity: "base" })
					: Number(a.v) - Number(b.v);
			return c * sign || a.i - b.i;
		})
		.map((x) => x.row);
}

/** What each sortable column of the learners table orders by. */
export const LEARNER_SORT = {
	name: (r: LearnerRow) => r.person.name,
	assigned: (r: LearnerRow) => r.assigned,
	completed: (r: LearnerRow) => r.completed,
	inProgress: (r: LearnerRow) => r.inProgress,
	overdue: (r: LearnerRow) => r.overdue,
	percent: (r: LearnerRow) => r.percent,
	lastOpened: (r: LearnerRow) => r.lastOpenedAt,
} as const;
export type LearnerSort = keyof typeof LEARNER_SORT;

/** What each sortable column of the content table orders by (no progress without learners). */
export const CONTENT_SORT = {
	title: (r: ContentReportRow) => r.content.title,
	learners: (r: ContentReportRow) => r.learners,
	completed: (r: ContentReportRow) => r.completed,
	percent: (r: ContentReportRow) => (r.learners > 0 ? r.percent : null),
	accuracy: (r: ContentReportRow) => r.accuracy,
} as const;
export type ContentSort = keyof typeof CONTENT_SORT;

/** The learners' progress as CSV text, a header line then one per person. */
export function learnersCsv(
	rows: readonly (LearnerRow & { roleLabel: string })[],
): string {
	return csvText([
		[
			"Name",
			"Role",
			"Assigned",
			"Completed",
			"In progress",
			"Overdue",
			"Percent",
			"Last opened",
			"Last opened at",
		],
		...rows.map((r) => [
			r.person.name,
			r.roleLabel,
			String(r.assigned),
			String(r.completed),
			String(r.inProgress),
			String(r.overdue),
			String(r.percent),
			r.lastOpened?.title ?? "",
			r.lastOpenedAt ?? "",
		]),
	]);
}

/** What one cell of the learners × questions grid shows. */
export type Cell = "right" | "wrong" | "none";
export const cellOf = (answer: boolean | null | undefined): Cell =>
	answer === true ? "right" : answer === false ? "wrong" : "none";

/** One learner's row of cells, exactly one per question (missing answers count as not asked). */
export const gridRow = (
	answers: readonly (boolean | null)[],
	questions: number,
): Cell[] => Array.from({ length: questions }, (_, i) => cellOf(answers[i]));

/** A whole percent of `part` in `whole`; null when there is nothing to count. */
export const percentOf = (part: number, whole: number): number | null =>
	whole > 0 ? Math.round((part / whole) * 100) : null;

/** "0:45", "12:03", then "3h 32m" from an hour on; "—" when unknown. */
export function duration(seconds: number | null): string {
	if (seconds == null) return "—";
	const s = Math.max(0, Math.round(seconds));
	if (s >= 3600)
		return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
