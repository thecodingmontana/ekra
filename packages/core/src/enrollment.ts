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

/** The two reminders a trainer can send about something a learner was given: the picker's label, the email's words. */
export const REMINDERS = {
	running_out: {
		label: "The course time is running out",
		heading: (title: string) => `Time is running out for ${title}`,
		body: "Just a reminder that this will end soon. Make sure you've finished all of it before the end date.",
	},
	overdue: {
		label: "Overdue course",
		heading: (title: string) => `${title} is overdue`,
		body: "It's past its due date. Please finish what's left as soon as you can, so you don't miss out.",
	},
} as const;
export type ReminderKind = keyof typeof REMINDERS;
