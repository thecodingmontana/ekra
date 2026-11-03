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

const DAY_PARTS = { day: "numeric", month: "short", year: "numeric" } as const;

/** "5 Nov 2026": the same wording on every machine, in `timeZone` (the runtime's own when left out). */
export function day(iso: string | Date, timeZone?: string): string {
	return new Date(iso).toLocaleDateString("en-GB", { ...DAY_PARTS, timeZone });
}

/** "5 Nov 2026, 00:30" (24-hour clock), in `timeZone` (the runtime's own when left out). */
export function dateTime(iso: string | Date, timeZone?: string): string {
	return new Date(iso).toLocaleString("en-GB", {
		...DAY_PARTS,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
		timeZone,
	});
}
