import { cn } from "@ekra/ui/lib/utils";
import type { ReactNode } from "react";

/** A settings page's title and the line under it. */
export function SettingsHeader({
	title,
	lead,
}: {
	title: string;
	lead: ReactNode;
}) {
	return (
		<>
			<h1 className="mb-1 font-semibold text-xl tracking-[-0.015em]">
				{title}
			</h1>
			<p className="mb-6 text-muted-foreground">{lead}</p>
		</>
	);
}

/** A titled group of settings. */
export function SBlock({
	title,
	first,
	danger,
	children,
}: {
	title?: string;
	first?: boolean;
	danger?: boolean;
	children: ReactNode;
}) {
	return (
		<section className={cn(!first && "mt-7")}>
			{title && (
				<h2
					className={cn(
						"mb-1 font-semibold text-md",
						danger && "text-destructive",
					)}
				>
					{title}
				</h2>
			)}
			{children}
		</section>
	);
}

/** One setting: what it is on the left, its control on the right. */
export function SRow({
	t,
	d,
	children,
}: {
	t: ReactNode;
	d?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-border/70 border-b py-3.5">
			<div className="min-w-0">
				<div className="font-medium">{t}</div>
				{d && <div className="mt-0.5 text-muted-foreground text-sm">{d}</div>}
			</div>
			<div className="flex items-center gap-2">{children}</div>
		</div>
	);
}
