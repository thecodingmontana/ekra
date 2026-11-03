/** One assignee as exported: dates as ISO strings (empty when there is none). */
export type AssigneeRow = {
	name: string;
	email: string;
	role: string;
	startAt: string;
	dueAt: string | null;
	status: string;
	percent: number;
};

export const STATUS_LABEL: Record<string, string> = {
	completed: "Completed",
	overdue: "Overdue",
	not_started: "Not started",
	in_progress: "In progress",
};

/**
 * A CSV field: quoted when it holds a comma, quote or line break, with quotes doubled; a leading = + - @, tab or
 * carriage return gets a ' so spreadsheets don't run it as a formula.
 */
const field = (raw: string) => {
	const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
	return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
};

/** The assignees as CSV text (with a UTF-8 BOM so spreadsheets read accents), a header line then one per person. */
export function assigneesCsv(rows: readonly AssigneeRow[]): string {
	const lines = [
		["Name", "Email", "Role", "Start", "Due", "Status", "Percent"],
		...rows.map((r) => [
			r.name,
			r.email,
			r.role,
			r.startAt,
			r.dueAt ?? "",
			STATUS_LABEL[r.status] ?? r.status,
			String(r.percent),
		]),
	];
	return `\uFEFF${lines.map((l) => l.map(field).join(",")).join("\r\n")}\r\n`;
}

/** "Send again in 29m" while a reminder must wait (null: it can be sent now). */
export function sendAgainLabel(
	remindAgainAt: string | null,
	now: number,
): string | null {
	if (!remindAgainAt) return null;
	const ms = new Date(remindAgainAt).getTime() - now;
	if (!(ms > 0)) return null;
	return `Send again in ${Math.ceil(ms / 60_000)}m`;
}

/** An ISO date as a datetime-local input's value, in the browser's time zone. */
export function toLocalInput(iso: string | null): string {
	if (!iso) return "";
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local input's value as an ISO date (null when empty). */
export const fromLocalInput = (value: string) =>
	value ? new Date(value).toISOString() : null;
