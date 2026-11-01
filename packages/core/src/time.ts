const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5m ago", "3h ago", "2d ago", then "Mar 4" (with the year once it's not this year). */
export function ago(iso: string | Date, now = new Date()): string {
	const date = new Date(iso);
	const ms = now.getTime() - date.getTime();
	if (ms < MINUTE) return "just now";
	if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m ago`;
	if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
	if (ms < 7 * DAY) return `${Math.floor(ms / DAY)}d ago`;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		...(date.getFullYear() !== now.getFullYear() && { year: "numeric" }),
	});
}
