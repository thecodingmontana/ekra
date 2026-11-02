export type EnrollmentStatus =
	| "completed"
	| "overdue"
	| "not_started"
	| "in_progress";

/**
 * Where a learner is with something they were given: completed (100%), overdue (past the due date and not done),
 * not started (nothing opened yet), else in progress. The reference's assignee table uses these four.
 */
export function enrollmentStatus(
	p: { percent: number; started: boolean; dueAt: Date | string | null },
	now = new Date(),
): EnrollmentStatus {
	if (p.percent >= 100) return "completed";
	if (p.dueAt && new Date(p.dueAt).getTime() < now.getTime()) return "overdue";
	if (!p.started && p.percent <= 0) return "not_started";
	return "in_progress";
}
