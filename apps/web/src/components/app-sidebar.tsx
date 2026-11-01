import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ekra/ui/components/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ekra/ui/components/tooltip";
import { cn } from "@ekra/ui/lib/utils";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import type { Viewer } from "@/graphql/viewer";
import { authClient } from "@/lib/auth-client";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { useSignOut } from "@/lib/use-sign-out";

/** One entry per page that exists. Add a line when a phase ships a page (Courses, Members, Quizzes…). */
const NAV = [
	{ to: "/", label: "Home", icon: "icon-[solar--home-2-linear]" },
] as const;

const ROLE_LABEL: Record<string, string> = {
	owner: "Owner",
	admin: "Admin",
	trainer: "Trainer",
	learner: "Learner",
	guest: "Guest",
};

const REPO = "https://github.com/thecodingmontana/ekra";

// the page you're on (TanStack Router marks active links with data-status="active")
const ACTIVE =
	"data-[status=active]:bg-background data-[status=active]:font-medium data-[status=active]:text-foreground data-[status=active]:shadow-[0_1px_2px_rgba(0,0,0,0.05),0_0_0_1px_var(--border)] dark:data-[status=active]:bg-muted dark:data-[status=active]:shadow-none";

const THEMES = [
	["light", "icon-[solar--sun-2-linear]", "Light"],
	["dark", "icon-[solar--moon-linear]", "Dark"],
	["system", "icon-[solar--monitor-linear]", "System"],
] as const;

const initial = (name: string) => name.trim()[0]?.toUpperCase() ?? "?";

function Kbd({ children }: { children: ReactNode }) {
	return (
		<kbd className="rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground leading-4">
			{children}
		</kbd>
	);
}

/** zadaci's SideTip: a tooltip to the right of a sidebar item while the sidebar is collapsed to icons. */
function SideTip({
	label,
	collapsed,
	always,
	children,
}: {
	label: ReactNode;
	collapsed: boolean;
	/** the collapse button explains itself (and its shortcut) in both states */
	always?: boolean;
	children: ReactElement;
}) {
	if (!collapsed && !always) return children;
	return (
		<Tooltip>
			<TooltipTrigger render={children} />
			<TooltipContent
				side={collapsed ? "right" : "bottom"}
				sideOffset={6}
				className="max-md:hidden"
			>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

function ExternalItem({
	href,
	icon,
	children,
}: {
	href: string;
	icon: string;
	children: string;
}) {
	return (
		<DropdownMenuItem
			onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
		>
			<span aria-hidden className={cn(icon, "size-4")} />
			<span className="flex-1">{children}</span>
			<span
				aria-hidden
				className="icon-[solar--arrow-right-up-linear] size-3 text-muted-foreground"
			/>
		</DropdownMenuItem>
	);
}

function Avatar({
	viewer,
	size = "size-6",
}: {
	viewer: Viewer;
	size?: string;
}) {
	return viewer.image ? (
		// a fixed round frame the photo fills, so any image shape stays a circle
		<span className={cn(size, "block shrink-0 overflow-hidden rounded-full")}>
			<img
				src={viewer.image}
				alt=""
				className="size-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
				referrerPolicy="no-referrer"
			/>
		</span>
	) : (
		<span
			aria-hidden
			className={cn(
				size,
				"grid shrink-0 place-items-center rounded-full bg-muted font-medium text-foreground text-xs",
			)}
		>
			{initial(viewer.name)}
		</span>
	);
}

function Logo({ name, size = "size-6" }: { name: string; size?: string }) {
	return (
		<span
			aria-hidden
			className={cn(
				"grid shrink-0 place-items-center rounded-md bg-brand font-semibold text-brand-foreground text-xs",
				size,
			)}
		>
			{initial(name)}
		</span>
	);
}

/** zadaci's sidebar with Frappe Learning's layout: organization on top, pages, then you at the bottom. */
export function AppSidebar({
	viewer,
	collapsed,
	onToggle,
}: {
	viewer: Viewer;
	collapsed: boolean;
	onToggle: () => void;
}) {
	const router = useRouter();
	const navigate = useNavigate();
	const signOut = useSignOut();
	const active = viewer.memberships.find(
		(m) => m.organization.id === viewer.activeOrganizationId,
	);
	// the server can't know the theme, so read it after mount
	const [theme, setThemeChoice] = useState<Theme>("system");
	useEffect(() => setThemeChoice(getTheme()), []);

	async function switchTo(organizationId: string) {
		await authClient.organization.setActive({ organizationId });
		await router.invalidate();
	}

	const item =
		"flex h-[30px] shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-2 text-left font-[450] text-base text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground";
	// zadaci's collapse: the column narrows, icons stay put, labels fade while the edge clips them (desktop only;
	// the phone drawer is always full width)
	const fadeOnly = cn(
		"transition-opacity duration-150 ease-out motion-reduce:transition-none",
		collapsed && "md:opacity-0",
	);
	const fade = cn("min-w-0", fadeOnly);

	return (
		<nav
			aria-label="Main"
			className="flex h-full flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground"
		>
			<div className="flex items-center gap-1 p-2">
				<DropdownMenu>
					<SideTip
						label={active?.organization.name ?? "Switch organization"}
						collapsed={collapsed}
					>
						<DropdownMenuTrigger
							className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1.5 text-left transition-colors hover:bg-muted"
							aria-label="Switch organization"
							data-testid="organization-switcher"
						>
							<Logo name={active?.organization.name ?? "Ekra"} />
							<span
								className={cn(
									"flex min-w-0 flex-1 items-center gap-2",
									fadeOnly,
								)}
							>
								<span className="min-w-0 flex-1">
									<span className="block truncate font-semibold text-base">
										{active?.organization.name ?? "Choose an organization"}
									</span>
									{active && (
										<span className="block truncate text-muted-foreground text-xs">
											{ROLE_LABEL[active.role] ?? active.role}
										</span>
									)}
								</span>
								<span
									aria-hidden
									className="icon-[solar--sort-vertical-linear] size-3.5 shrink-0 text-muted-foreground"
								/>
							</span>
						</DropdownMenuTrigger>
					</SideTip>
					<DropdownMenuContent align="start" className="w-64">
						<DropdownMenuGroup>
							<DropdownMenuLabel>Organizations</DropdownMenuLabel>
							{viewer.memberships.map(({ organization, role }) => (
								<DropdownMenuItem
									key={organization.id}
									onClick={() => switchTo(organization.id)}
								>
									<Logo name={organization.name} size="size-5" />
									<span className="min-w-0 flex-1 truncate">
										{organization.name}
									</span>
									<span className="text-muted-foreground text-xs">
										{organization.id === viewer.activeOrganizationId
											? "✓"
											: (ROLE_LABEL[role] ?? role)}
									</span>
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => navigate({ to: "/onboarding" })}>
							<span
								aria-hidden
								className="icon-[solar--add-circle-linear] size-4"
							/>
							Create organization
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				{!collapsed && (
					<SideTip
						label={
							<>
								Collapse sidebar <Kbd>[</Kbd>
							</>
						}
						collapsed={collapsed}
						always
					>
						<button
							type="button"
							onClick={onToggle}
							aria-label="Collapse sidebar"
							className="hidden size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:grid"
						>
							<span
								aria-hidden
								className="icon-[solar--sidebar-minimalistic-linear] size-4"
							/>
						</button>
					</SideTip>
				)}
			</div>

			{/* scrolls without a visible bar (one would eat width and shift the icons when collapsed), and never sideways */}
			<div className="flex flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto px-2 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{collapsed && (
					<SideTip
						label={
							<>
								Expand sidebar <Kbd>[</Kbd>
							</>
						}
						collapsed={collapsed}
					>
						<button
							type="button"
							onClick={onToggle}
							aria-label="Expand sidebar"
							className={cn(item, "max-md:hidden")}
						>
							<span
								aria-hidden
								className="icon-[solar--sidebar-minimalistic-linear] size-4 shrink-0"
							/>
						</button>
					</SideTip>
				)}
				{NAV.map((n) => (
					<SideTip key={n.to} label={n.label} collapsed={collapsed}>
						<Link
							to={n.to}
							activeOptions={{ exact: true }}
							className={cn(item, ACTIVE)}
						>
							<span aria-hidden className={cn(n.icon, "size-4 shrink-0")} />
							<span className={fade}>{n.label}</span>
						</Link>
					</SideTip>
				))}
			</div>

			<div className="flex flex-col gap-0.5 border-t p-2">
				<DropdownMenu>
					<SideTip label="Help & resources" collapsed={collapsed}>
						<DropdownMenuTrigger className={item}>
							<span
								aria-hidden
								className="icon-[solar--question-circle-linear] size-4 shrink-0"
							/>
							<span className={fade}>Help & resources</span>
						</DropdownMenuTrigger>
					</SideTip>
					<DropdownMenuContent align="start" side="top" className="w-60">
						<DropdownMenuGroup>
							<DropdownMenuLabel>Help & resources</DropdownMenuLabel>
							<ExternalItem
								href={`${REPO}/blob/main/SETUP.md`}
								icon="icon-[solar--book-2-linear]"
							>
								Setup guide
							</ExternalItem>
							<ExternalItem
								href={`${REPO}/issues/new/choose`}
								icon="icon-[solar--bug-linear]"
							>
								Report a problem
							</ExternalItem>
							<ExternalItem href={REPO} icon="icon-[hugeicons--github]">
								Source code on GitHub
							</ExternalItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
				<SideTip label="Send feedback" collapsed={collapsed}>
					<a
						href={`${REPO}/issues/new/choose`}
						target="_blank"
						rel="noopener noreferrer"
						className={item}
					>
						<span
							aria-hidden
							className="icon-[solar--chat-square-like-linear] size-4 shrink-0"
						/>
						<span className={fade}>Send feedback</span>
					</a>
				</SideTip>
				<SideTip label="Settings" collapsed={collapsed}>
					<Link to="/settings/security" className={cn(item, ACTIVE)}>
						<span
							aria-hidden
							className="icon-[solar--settings-linear] size-4 shrink-0"
						/>
						<span className={fade}>Settings</span>
					</Link>
				</SideTip>
				<DropdownMenu>
					<SideTip label={viewer.name} collapsed={collapsed}>
						<DropdownMenuTrigger
							className={cn(item, "h-9 font-medium text-foreground")}
							aria-label="Your account"
						>
							<Avatar viewer={viewer} />
							<span
								className={cn(
									"flex min-w-0 flex-1 items-center gap-2",
									fadeOnly,
								)}
							>
								<span className="min-w-0 flex-1 truncate">{viewer.name}</span>
								<span
									aria-hidden
									className="icon-[solar--sort-vertical-linear] size-3.5 shrink-0 text-muted-foreground"
								/>
							</span>
						</DropdownMenuTrigger>
					</SideTip>
					<DropdownMenuContent align="start" side="top" className="w-64">
						<div className="flex items-center gap-2.5 px-2 py-2">
							<Avatar viewer={viewer} size="size-9" />
							<div className="min-w-0">
								<div className="truncate font-semibold text-sm">
									{viewer.name}
								</div>
								<div className="truncate text-muted-foreground text-xs">
									{viewer.email}
								</div>
							</div>
						</div>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => navigate({ to: "/settings/security" })}
						>
							<span
								aria-hidden
								className="icon-[solar--settings-linear] size-4"
							/>
							Account settings
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuLabel>Theme</DropdownMenuLabel>
						</DropdownMenuGroup>
						<fieldset className="mx-1.5 mb-1.5 flex gap-0.5 rounded-md bg-muted p-0.5">
							<legend className="sr-only">Theme</legend>
							{THEMES.map(([choice, icon, label]) => (
								<button
									key={choice}
									type="button"
									aria-pressed={theme === choice}
									onClick={() => {
										setTheme(choice);
										setThemeChoice(choice);
									}}
									className="flex flex-1 items-center justify-center gap-1.5 rounded-[5px] py-1 text-muted-foreground text-xs transition-colors hover:text-foreground aria-pressed:bg-background aria-pressed:font-medium aria-pressed:text-foreground aria-pressed:shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)]"
								>
									<span aria-hidden className={cn(icon, "size-3.5")} />
									{label}
								</button>
							))}
						</fieldset>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={signOut}>
							<span
								aria-hidden
								className="icon-[solar--logout-2-linear] size-4"
							/>
							Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</nav>
	);
}
