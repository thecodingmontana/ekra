import { cn } from "@ekra/ui/lib/utils";
import { STATUS_LABEL } from "@/lib/assignees";

/** A ring filled to `percent` (0–100) in the text color, on a faint track; size and place it with `className`. */
export function ProgressRing({
	percent,
	stroke = 10,
	className,
}: {
	percent: number;
	/** line width, out of the ring's 80 units */
	stroke?: number;
	className?: string;
}) {
	const r = 37 - stroke / 2;
	const c = 2 * Math.PI * r;
	const filled = Math.min(100, Math.max(0, percent)) / 100;
	return (
		<svg
			viewBox="0 0 80 80"
			className={cn("-rotate-90", className)}
			aria-hidden="true"
		>
			<circle
				cx="40"
				cy="40"
				r={r}
				fill="none"
				stroke="currentColor"
				strokeOpacity={0.18}
				strokeWidth={stroke}
			/>
			<circle
				cx="40"
				cy="40"
				r={r}
				fill="none"
				stroke="currentColor"
				strokeWidth={stroke}
				strokeLinecap="round"
				strokeDasharray={c}
				strokeDashoffset={c * (1 - filled)}
			/>
		</svg>
	);
}

const RING_TONE: Record<string, string> = {
	completed: "text-tint-green",
	overdue: "text-tint-red",
	in_progress: "text-tint-amber",
	not_started: "text-muted-foreground",
};

/** A small ring filled to the percent, in the colour of an assignment's status, with the status and percent beside it. */
export function StatusRing({
	status,
	percent,
}: {
	status: string;
	percent: number;
}) {
	return (
		<span className="flex items-center gap-2" data-testid="assignee-status">
			<ProgressRing
				percent={percent}
				className={cn("size-5 shrink-0", RING_TONE[status])}
			/>
			<span className="flex flex-col leading-tight">
				<span className="whitespace-nowrap text-muted-foreground text-xs">
					{STATUS_LABEL[status] ?? status}
				</span>
				<span className="font-medium text-xs">{percent}%</span>
			</span>
		</span>
	);
}
