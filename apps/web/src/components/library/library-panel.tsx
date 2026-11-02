import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ekra/ui/components/tooltip";
import { cn } from "@ekra/ui/lib/utils";
import { type ReactElement, type ReactNode, useState } from "react";
import type { ContentItem } from "@/graphql/library";
import { KINDS } from "@/lib/content-kinds";

export const LIBRARY_PANEL_COOKIE = "library_panel_collapsed";

export type LibraryShow =
	| "all"
	| "favorites"
	| "recent"
	| "templates"
	| "archived";

const VIEWS: {
	show: LibraryShow;
	label: string;
	icon: string;
	manage?: true;
}[] = [
	{ show: "all", label: "All content", icon: "icon-[solar--library-linear]" },
	{
		show: "recent",
		label: "Recents",
		icon: "icon-[solar--clock-circle-linear]",
	},
	{
		show: "archived",
		label: "Archived",
		icon: "icon-[solar--archive-linear]",
		manage: true,
	},
	{
		show: "templates",
		label: "Templates",
		icon: "icon-[solar--layers-linear]",
		manage: true,
	},
];

export const showLabel = (show: LibraryShow) =>
	show === "favorites"
		? "Favorites"
		: (VIEWS.find((v) => v.show === show)?.label ?? "All content");

const ACTIVE =
	"aria-[current=page]:bg-background aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:shadow-[0_1px_2px_rgba(0,0,0,0.05),0_0_0_1px_var(--border)] dark:aria-[current=page]:bg-muted dark:aria-[current=page]:shadow-none";
const LABEL =
	"font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.06em]";
const ICON_BTN =
	"grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground";

/** A tooltip to the right of an icon, only while the panel is collapsed. */
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

/** A collapsible group in the panel: Favorites, Folders. */
function Section({
	title,
	count,
	action,
	onTitle,
	current,
	children,
}: {
	title: string;
	count: number;
	action?: ReactNode;
	/** the title opens a view of everything in the group */
	onTitle?: () => void;
	current?: boolean;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(true);
	return (
		<div
			className="mt-3 flex flex-col gap-0.5 border-t pt-3"
			data-testid={`panel-${title.toLowerCase()}`}
		>
			<div className="flex h-7 items-center gap-1 pr-0.5 pl-2">
				{onTitle ? (
					<button
						type="button"
						onClick={onTitle}
						aria-current={current ? "page" : undefined}
						className={cn(
							LABEL,
							"hover:text-foreground aria-[current=page]:text-foreground",
						)}
					>
						{title}
					</button>
				) : (
					<span className={LABEL}>{title}</span>
				)}
				<span className="rounded-[4px] bg-muted px-1 text-[10px] text-muted-foreground tabular-nums">
					{count}
				</span>
				<span className="flex-1" />
				{action}
				<button
					type="button"
					className={ICON_BTN}
					aria-expanded={open}
					aria-label={
						open ? `Hide ${title.toLowerCase()}` : `Show ${title.toLowerCase()}`
					}
					onClick={() => setOpen(!open)}
				>
					<span
						className={cn(
							"icon-[solar--alt-arrow-down-linear] size-3.5 transition-transform duration-150",
							!open && "-rotate-90",
						)}
						aria-hidden="true"
					/>
				</button>
			</div>
			{open && children}
		</div>
	);
}

/**
 * The library's side panel (views, favorites, folders) beside the content. It collapses to icons (remembered on
 * this device); on phones it slides over the page and closes with ×.
 */
export function LibraryPanel({
	initialCollapsed,
	show,
	folderId,
	canManage,
	favorites,
	folders,
	onShow,
	onOpen,
	onNewFolder,
	children,
}: {
	initialCollapsed: boolean;
	show: LibraryShow;
	/** the folder being browsed */
	folderId?: string;
	canManage: boolean;
	favorites: ContentItem[];
	/** top-level folders */
	folders: ContentItem[];
	onShow: (show: LibraryShow) => void;
	onOpen: (item: ContentItem) => void;
	onNewFolder: () => void;
	children: ReactNode;
}) {
	const [collapsed, setCollapsed] = useState(initialCollapsed);
	const [drawer, setDrawer] = useState(false);

	function toggle() {
		const next = !collapsed;
		setCollapsed(next);
		// biome-ignore lint/suspicious/noDocumentCookie: a tiny preference the server reads on the next page load
		document.cookie = `${LIBRARY_PANEL_COOKIE}=${next ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
	}
	// the phone drawer closes once you pick something
	const pick = (fn: () => void) => () => {
		setDrawer(false);
		fn();
	};

	const hide = collapsed ? "md:hidden" : "";
	const row = cn(
		"flex h-[30px] w-full shrink-0 items-center gap-[9px] whitespace-nowrap rounded-md px-2 text-left font-[450] text-base text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
		collapsed && "md:justify-center md:px-0",
	);
	const itemRow = (i: ContentItem, current: boolean) => (
		<button
			key={i.id}
			type="button"
			className={cn(row, ACTIVE)}
			aria-current={current ? "page" : undefined}
			onClick={pick(() => onOpen(i))}
			data-testid="panel-item"
		>
			<span
				className={cn(
					"grid size-[18px] shrink-0 place-items-center rounded-[5px]",
					KINDS[i.kind].tint,
				)}
			>
				<span className={cn(KINDS[i.kind].icon, "size-3")} aria-hidden="true" />
			</span>
			<span className="min-w-0 truncate">{i.title}</span>
		</button>
	);

	const nav = (
		<nav
			aria-label="Learning content"
			className="flex h-full flex-col overflow-hidden border-r bg-background"
		>
			<div className="flex h-12 shrink-0 items-center gap-1 px-2.5">
				<span className={cn("flex-1 truncate pl-1.5 font-semibold", hide)}>
					Learning content
				</span>
				<Tip label="Expand" show={collapsed}>
					<button
						type="button"
						onClick={toggle}
						aria-label={
							collapsed
								? "Expand learning content panel"
								: "Collapse learning content panel"
						}
						data-testid="panel-toggle"
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
					aria-label="Close learning content panel"
					className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
				>
					<span aria-hidden className="icon-[hugeicons--cancel-01] size-4" />
				</button>
			</div>
			{/* scrolls without a visible bar, and never sideways */}
			<div className="flex flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto px-2.5 pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{VIEWS.filter((v) => canManage || !v.manage).map((v) => (
					<Tip key={v.show} label={v.label} show={collapsed}>
						<button
							type="button"
							className={cn(row, ACTIVE)}
							aria-current={show === v.show && !folderId ? "page" : undefined}
							onClick={pick(() => onShow(v.show))}
							data-testid={`panel-${v.show}`}
						>
							<span
								aria-hidden
								className={cn(v.icon, "size-[15px] shrink-0")}
							/>
							<span className={cn("min-w-0 truncate", hide)}>{v.label}</span>
						</button>
					</Tip>
				))}
				<div className={cn("flex flex-col", hide)}>
					<Section
						title="Favorites"
						count={favorites.length}
						onTitle={pick(() => onShow("favorites"))}
						current={show === "favorites"}
					>
						{favorites.map((i) => itemRow(i, false))}
						{!favorites.length && (
							<p className="px-2 py-1 text-muted-foreground text-xs">
								Star content from its ⋯ menu.
							</p>
						)}
					</Section>
					<Section
						title="Folders"
						count={folders.length}
						action={
							canManage && (
								<button
									type="button"
									className={ICON_BTN}
									aria-label="New folder"
									onClick={pick(onNewFolder)}
									data-testid="panel-new-folder"
								>
									<span
										className="icon-[hugeicons--plus-sign] size-3.5"
										aria-hidden="true"
									/>
								</button>
							)
						}
					>
						{folders.map((i) => itemRow(i, i.id === folderId))}
						{!folders.length && (
							<p className="px-2 py-1 text-muted-foreground text-xs">
								No folders yet.
							</p>
						)}
					</Section>
				</div>
			</div>
		</nav>
	);

	return (
		<div
			className={cn(
				// the panel's width animates (drawer curve, 220ms)
				"grid min-h-0 flex-1 transition-[grid-template-columns] duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:grid-cols-[var(--lib-w)_minmax(0,1fr)]",
				collapsed ? "[--lib-w:52px]" : "[--lib-w:232px]",
			)}
		>
			{/* phones: the panel slides over the page */}
			{drawer && (
				<button
					type="button"
					aria-label="Close learning content panel"
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
					data-testid="panel-open"
				>
					<span
						aria-hidden
						className="icon-[solar--hamburger-menu-linear] size-4 text-muted-foreground"
					/>
					<span className="text-muted-foreground">Learning content</span>
					<span aria-hidden className="text-muted-foreground">
						/
					</span>
					<span className="font-medium">{showLabel(show)}</span>
				</button>
				{children}
			</div>
		</div>
	);
}
