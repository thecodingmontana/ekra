import type { ContentKind } from "../graphql/library.ts";
import type { ActivityEvent, DayCount, LearnerRow } from "../graphql/report.ts";
import { csvText } from "./assignees.ts";

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

/** Learners whose name has the search text (any case). */
export function filterLearners<T extends Pick<LearnerRow, "person">>(
	rows: readonly T[],
	search: string,
): T[] {
	const q = search.trim().toLowerCase();
	return q
		? rows.filter((r) => r.person.name.toLowerCase().includes(q))
		: [...rows];
}

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
