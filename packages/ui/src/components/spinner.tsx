import { cn } from "../lib/utils";

/** A small spinning loader for buttons and inline "working on it" states. */
export function Spinner({ className }: { className?: string }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"icon-[hugeicons--loading-03] size-4 shrink-0 motion-safe:animate-spin",
				className,
			)}
		/>
	);
}
