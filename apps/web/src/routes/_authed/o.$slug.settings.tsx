import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ekra/ui/components/tooltip";
import { cn } from "@ekra/ui/lib/utils";
import {
	createFileRoute,
	Link,
	Outlet,
	useLocation,
} from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import { SETTINGS_GROUPS } from "@/lib/settings-nav";

const COOKIE = "settings_nav_collapsed";

// read during server rendering too, so a collapsed settings sidebar is already collapsed on first paint
const readCollapsed = createIsomorphicFn()
	.server(async () => {
		const { getRequestHeaders } = await import("@tanstack/react-start/server");
		return (getRequestHeaders().get("cookie") ?? "").includes(`${COOKIE}=1`);
	})
	.client(async () => document.cookie.includes(`${COOKIE}=1`));

export const Route = createFileRoute("/_authed/o/$slug/settings")({
	beforeLoad: async () => ({ settingsCollapsed: await readCollapsed() }),
	component: SettingsLayout,
});

// the page you're on (TanStack Router marks active links with data-status="active")
const ACTIVE =
	"data-[status=active]:bg-background data-[status=active]:font-medium data-[status=active]:text-foreground data-[status=active]:shadow-[0_1px_2px_rgba(0,0,0,0.05),0_0_0_1px_var(--border)] dark:data-[status=active]:bg-muted dark:data-[status=active]:shadow-none";

/** A tooltip to the right of an icon, only while the settings sidebar is collapsed. */
function Tip({
	label,
	show,
	children,
}: {
	label: ReactNode;
	show: boolean;
	children: ReactElement;
}) {
	if (!show) return children;
	return (
		<Tooltip>
			<TooltipTrigger render={children} />
			<TooltipContent side="right" sideOffset={6} className="max-md:hidden">
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * Settings: a sidebar of grouped pages beside one readable column. The sidebar collapses to icons (remembered
 * on this device); on phones it slides over the page and closes with ×.
 */
function SettingsLayout() {
	const { settingsCollapsed, membership } = Route.useRouteContext();
	const slug = membership.organization.slug;
	const pathname = useLocation({ select: (l) => l.pathname });
	const [collapsed, setCollapsed] = useState(settingsCollapsed);
	const [drawer, setDrawer] = useState(false);

	// the phone drawer closes after moving to another page
	// biome-ignore lint/correctness/useExhaustiveDependencies: run on navigation only
	useEffect(() => setDrawer(false), [pathname]);

	function toggle() {
		const next = !collapsed;
		setCollapsed(next);
		// biome-ignore lint/suspicious/noDocumentCookie: a tiny preference the server reads on the next page load
		document.cookie = `${COOKIE}=${next ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
	}

	const groups = SETTINGS_GROUPS;
	const current = groups
		.flatMap((g) => g.items)
		.find((i) => pathname.endsWith(i.to.replace("/o/$slug", "")));
	const hide = collapsed ? "md:hidden" : "";
	const row = cn(
		"flex h-[30px] shrink-0 items-center gap-[9px] whitespace-nowrap rounded-md px-2 text-left font-[450] text-base text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
		collapsed && "md:justify-center md:px-0",
	);

	const nav = (
		<nav
			aria-label="Settings"
			className="flex h-full flex-col overflow-hidden border-r bg-background"
		>
			<div className="flex h-12 shrink-0 items-center gap-1 px-2.5">
				<span className={cn("flex-1 truncate pl-1.5 font-semibold", hide)}>
					Settings
				</span>
				<Tip label="Expand" show={collapsed}>
					<button
						type="button"
						onClick={toggle}
						aria-label={
							collapsed ? "Expand settings menu" : "Collapse settings menu"
						}
						className={cn(
							"hidden size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:grid",
							collapsed && "md:mx-auto",
						)}
					>
						<span
							aria-hidden
							className="icon-[solar--sidebar-minimalistic-linear] size-[15px]"
						/>
					</button>
				</Tip>
				<button
					type="button"
					onClick={() => setDrawer(false)}
					aria-label="Close settings menu"
					className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
				>
					<span aria-hidden className="icon-[hugeicons--cancel-01] size-4" />
				</button>
			</div>
			{/* scrolls without a visible bar, and never sideways */}
			<div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto px-2.5 pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{groups.map((group, i) => (
					<div
						key={group.title}
						className={cn(
							"flex flex-col gap-0.5",
							i > 0 && collapsed && "md:mt-2.5 md:border-t md:pt-2.5",
						)}
					>
						<div
							className={cn(
								"px-2 pt-3.5 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.06em]",
								hide,
							)}
						>
							{group.title}
						</div>
						{group.items.map((item) => (
							<Tip key={item.to} label={item.label} show={collapsed}>
								<Link
									to={item.to}
									params={{ slug }}
									className={cn(row, ACTIVE)}
								>
									<span
										aria-hidden
										className={cn(item.icon, "size-[15px] shrink-0")}
									/>
									<span className={cn("min-w-0 truncate", hide)}>
										{item.label}
									</span>
								</Link>
							</Tip>
						))}
					</div>
				))}
			</div>
		</nav>
	);

	return (
		<div
			className={cn(
				// the sidebar's width animates (drawer curve, 220ms)
				"grid min-h-0 flex-1 transition-[grid-template-columns] duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:grid-cols-[var(--set-w)_minmax(0,1fr)]",
				collapsed ? "[--set-w:52px]" : "[--set-w:220px]",
			)}
		>
			{/* phones: the settings menu slides over the page */}
			{drawer && (
				<button
					type="button"
					aria-label="Close settings menu"
					className="fixed inset-0 z-40 bg-black/30 animate-in fade-in duration-150 md:hidden"
					onClick={() => setDrawer(false)}
				/>
			)}
			<div
				className={cn(
					"fixed inset-y-0 left-0 z-50 w-[260px] transition-transform duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none md:static md:w-auto md:translate-x-0 md:transition-none",
					drawer ? "translate-x-0 shadow-2xl" : "-translate-x-full",
				)}
			>
				{nav}
			</div>
			<div className="min-w-0 overflow-y-auto">
				<button
					type="button"
					onClick={() => setDrawer(true)}
					className="flex w-full items-center gap-2 border-b px-4 py-2.5 text-left text-sm md:hidden"
				>
					<span
						aria-hidden
						className="icon-[solar--hamburger-menu-linear] size-4 text-muted-foreground"
					/>
					<span className="text-muted-foreground">Settings</span>
					<span aria-hidden className="text-muted-foreground">
						/
					</span>
					<span className="font-medium">{current?.label}</span>
				</button>
				<div className="mx-auto w-full max-w-[720px] px-5 pt-8 pb-20 md:px-10">
					<Outlet />
				</div>
			</div>
		</div>
	);
}
