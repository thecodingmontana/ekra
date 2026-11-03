import { Av } from "@ekra/ui/components/av";
import { cn } from "@ekra/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ProgressRing } from "@/components/progress-ring";
import type { ReportPerson } from "@/graphql/report";
import { mainRole, ROLE_LABEL } from "@/lib/members";

export const CELL = "border-border/70 border-b px-3 py-[9px] text-left";
export const HEAD = cn(
	CELL,
	"whitespace-nowrap font-medium text-muted-foreground text-xs",
);
export const PAGE =
	"mx-auto w-full min-w-0 max-w-[1160px] px-4 pt-5 pb-24 sm:px-6 sm:pt-7";

/** The reports' own pages, as tabs under the page title. */
export function ReportsNav({ slug }: { slug: string }) {
	const link =
		"relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 font-medium text-muted-foreground text-sm transition-colors duration-140 hover:text-foreground data-[status=active]:text-foreground data-[status=active]:after:absolute data-[status=active]:after:inset-x-2 data-[status=active]:after:-bottom-px data-[status=active]:after:h-0.5 data-[status=active]:after:rounded-full data-[status=active]:after:bg-foreground";
	return (
		<nav
			className="mb-4 flex gap-0.5 overflow-x-auto border-b [scrollbar-width:none]"
			aria-label="Reports"
		>
			<Link
				to="/o/$slug/reports"
				params={{ slug }}
				activeOptions={{ exact: true, includeSearch: false }}
				className={link}
				data-testid="reports-learners"
			>
				<span
					aria-hidden="true"
					className="icon-[solar--users-group-rounded-linear] size-4"
				/>
				Learners
			</Link>
			<Link
				to="/o/$slug/reports/content"
				params={{ slug }}
				activeOptions={{ includeSearch: false }}
				className={link}
				data-testid="reports-content"
			>
				<span
					aria-hidden="true"
					className="icon-[solar--library-linear] size-4"
				/>
				Content
			</Link>
		</nav>
	);
}

/** Segmented tabs that live in the address (?tab=…), so a reload keeps them. */
export function Tabs<T extends string>({
	value,
	tabs,
	onChange,
	label,
}: {
	value: T;
	tabs: readonly (readonly [T, string])[];
	onChange: (v: T) => void;
	label: string;
}) {
	return (
		<div
			role="tablist"
			aria-label={label}
			className="mb-4 inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[8px] bg-muted p-0.5 [scrollbar-width:none]"
		>
			{tabs.map(([v, text]) => (
				<button
					key={v}
					type="button"
					role="tab"
					aria-selected={value === v}
					data-testid={`tab-${v}`}
					onClick={() => onChange(v)}
					className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-[6px] px-3 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)]"
				>
					{text}
				</button>
			))}
		</div>
	);
}

/** A bordered panel with a title, an optional line under it and something on the right. */
export function Panel({
	title,
	sub,
	right,
	className,
	children,
	testId,
}: {
	title: string;
	sub?: string;
	right?: ReactNode;
	className?: string;
	children: ReactNode;
	testId?: string;
}) {
	return (
		<section
			className={cn("min-w-0 rounded-[10px] border bg-card p-4", className)}
			data-testid={testId}
		>
			<header className="mb-3 flex items-start gap-2">
				<div className="min-w-0">
					<h2 className="font-semibold text-sm">{title}</h2>
					{sub && <p className="text-muted-foreground text-xs">{sub}</p>}
				</div>
				{right && <div className="ml-auto shrink-0">{right}</div>}
			</header>
			{children}
		</section>
	);
}

/** Someone with their avatar, and their role under the name. */
export function PersonCell({ person }: { person: ReportPerson }) {
	return (
		<span className="flex min-w-0 items-center gap-2.5">
			<Av name={person.name} image={person.image} size="md" />
			<span className="flex min-w-0 flex-col">
				<b className="truncate font-medium">{person.name}</b>
				<span className="truncate text-muted-foreground text-xs">
					{ROLE_LABEL[mainRole(person.role)]}
				</span>
			</span>
		</span>
	);
}

/** A small ring and the percent beside it; a dash when there's no number. */
export function PercentRing({
	percent,
	tone = "text-brand",
	testId,
}: {
	percent: number | null;
	tone?: string;
	testId?: string;
}) {
	if (percent == null) return <span className="text-muted-foreground">—</span>;
	return (
		<span className="flex items-center gap-2" data-testid={testId}>
			<ProgressRing percent={percent} className={cn("size-5 shrink-0", tone)} />
			<span className="font-medium text-xs tabular-nums">{percent}%</span>
		</span>
	);
}

/** A quiet line in the middle of an empty panel or table. */
export function EmptyLine({
	icon,
	children,
}: {
	icon: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-muted-foreground text-sm">
			<span aria-hidden="true" className={cn(icon, "size-5")} />
			{children}
		</div>
	);
}

const bar = "animate-pulse rounded bg-muted";

/** Rows of grey bars while a table loads. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
	return (
		<div className="overflow-hidden rounded-[10px] border" aria-hidden="true">
			{Array.from({ length: rows }, (_, n) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: placeholders never move
					key={n}
					className="flex h-[52px] items-center gap-3 border-t px-3.5 first:border-t-0"
				>
					<span className={cn(bar, "size-7 rounded-full")} />
					<span className={cn(bar, "h-3.5 w-1/3")} />
					<span className={cn(bar, "ml-auto h-3.5 w-16")} />
				</div>
			))}
		</div>
	);
}

/** A grey block the size of a panel while it loads. */
export function PanelSkeleton({ className }: { className?: string }) {
	return (
		<div
			className={cn("rounded-[10px] border p-4", className)}
			aria-hidden="true"
		>
			<span className={cn(bar, "mb-4 block h-3.5 w-1/3")} />
			<span className={cn(bar, "block h-[180px] rounded-[7px]")} />
		</div>
	);
}

/** One number with its label, as in a report's header. */
export function Stat({
	label,
	children,
	testId,
}: {
	label: string;
	children: ReactNode;
	testId?: string;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-1" data-testid={testId}>
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="flex items-center gap-2 font-semibold text-lg tabular-nums">
				{children}
			</span>
		</div>
	);
}
