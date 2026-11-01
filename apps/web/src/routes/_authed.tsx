import { TooltipProvider } from "@ekra/ui/components/tooltip";
import { cn } from "@ekra/ui/lib/utils";
import {
	createFileRoute,
	Outlet,
	redirect,
	useLocation,
} from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { VIEWER, type Viewer } from "@/graphql/viewer";

/** Everything behind sign-in. Signed-out visitors go to /sign-in and come back here afterwards. */
export const Route = createFileRoute("/_authed")({
	beforeLoad: async ({ context, location }) => {
		const { data } = await context.apolloClient.query<{
			viewer: Viewer | null;
		}>({
			query: VIEWER,
			fetchPolicy: "network-only",
		});
		if (!data?.viewer) {
			throw redirect({
				to: "/sign-in",
				search: { next: location.href, error: undefined, mode: undefined },
			});
		}
		return { viewer: data.viewer, collapsed: await readCollapsed() };
	},
	component: AuthedLayout,
});

const SIDEBAR_COOKIE = "sidebar_collapsed";

// read during server rendering too, so a collapsed sidebar is already collapsed on first paint
const readCollapsed = createIsomorphicFn()
	.server(async () => {
		const { getRequestHeaders } = await import("@tanstack/react-start/server");
		return (getRequestHeaders().get("cookie") ?? "").includes(
			`${SIDEBAR_COOKIE}=1`,
		);
	})
	.client(async () => document.cookie.includes(`${SIDEBAR_COOKIE}=1`));

function AuthedLayout() {
	const { viewer, collapsed: startCollapsed } = Route.useRouteContext();
	const pathname = useLocation({ select: (l) => l.pathname });
	const [collapsed, setCollapsed] = useState(startCollapsed);
	const [drawer, setDrawer] = useState(false);

	// the phone drawer closes after moving to another page
	// biome-ignore lint/correctness/useExhaustiveDependencies: run on navigation only
	useEffect(() => setDrawer(false), [pathname]);

	function toggle() {
		setCollapsed((was) => {
			const next = !was;
			// biome-ignore lint/suspicious/noDocumentCookie: a tiny preference the server reads on the next page load
			document.cookie = `${SIDEBAR_COOKIE}=${next ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
			return next;
		});
	}

	// "[" collapses and expands the sidebar (not while typing)
	// biome-ignore lint/correctness/useExhaustiveDependencies: toggle only uses state setters
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
			const el = e.target as HTMLElement | null;
			if (el?.closest("input, textarea, select, [contenteditable='true']"))
				return;
			e.preventDefault();
			toggle();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// onboarding draws its own header (Exit setup + theme)
	if (pathname === "/onboarding") return <Outlet />;

	return (
		<TooltipProvider>
			<div
				className={cn(
					// the column width animates (drawer curve, 220ms)
					"grid h-dvh transition-[grid-template-columns] duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:grid-cols-[var(--side-w)_minmax(0,1fr)]",
					collapsed ? "[--side-w:52px]" : "[--side-w:248px]",
				)}
			>
				{/* phones: the sidebar is a drawer over the page */}
				{drawer && (
					<button
						type="button"
						aria-label="Close menu"
						className="fixed inset-0 z-40 bg-black/30 animate-in fade-in duration-150 md:hidden"
						onClick={() => setDrawer(false)}
					/>
				)}
				<div
					className={cn(
						"fixed inset-y-0 left-0 z-50 w-70 transition-transform duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none md:static md:w-auto md:translate-x-0 md:transition-none",
						drawer ? "translate-x-0 shadow-2xl" : "-translate-x-full",
					)}
				>
					<AppSidebar viewer={viewer} collapsed={collapsed} onToggle={toggle} />
				</div>
				<div className="flex min-h-0 min-w-0 flex-col overflow-y-auto">
					<div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
						<button
							type="button"
							aria-label="Open menu"
							className="grid size-8 place-items-center rounded-md hover:bg-muted"
							onClick={() => setDrawer(true)}
						>
							<span
								aria-hidden
								className="icon-[solar--hamburger-menu-linear] size-5"
							/>
						</button>
						<span className="font-semibold">Ekra</span>
					</div>
					<Outlet />
				</div>
			</div>
		</TooltipProvider>
	);
}
