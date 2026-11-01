import { Av } from "@ekra/ui/components/av";
import {
	Menu,
	MenuContent,
	MenuItem,
	MenuLabel,
	MenuSeparator,
	MenuTrigger,
} from "@ekra/ui/components/menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ekra/ui/components/tooltip";
import { cn } from "@ekra/ui/lib/utils";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import { OrgLogo } from "@/components/org-logo";
import type { Viewer } from "@/graphql/viewer";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { useSignOut } from "@/lib/use-sign-out";

/** One entry per page that exists. Add a line when a phase ships a page (Courses, Members, Quizzes…). */
const NAV = [
	{ to: "/o/$slug", label: "Home", icon: "icon-[solar--home-2-linear]" },
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

/** A keyboard key, as shown in tooltips and menus. */
function Kbd({ children }: { children: ReactNode }) {
	return (
		<kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-b-[1.5px] bg-background px-[5px] font-mono text-[11px] text-muted-foreground leading-none">
			{children}
		</kbd>
	);
}

/** A tooltip to the right of a sidebar item while the sidebar is collapsed to icons. */
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

const external = (href: string) =>
	window.open(href, "_blank", "noopener,noreferrer");

const arrow = (
	<span
		aria-hidden="true"
		className="icon-[solar--arrow-right-up-linear] size-3"
	/>
);

/** The app sidebar: organization on top, pages, then you at the bottom. */
export function AppSidebar({
	viewer,
	collapsed,
	onToggle,
}: {
	viewer: Viewer;
	collapsed: boolean;
	onToggle: () => void;
}) {
	const navigate = useNavigate();
	const signOut = useSignOut();
	// the organization in the address (/o/acme/…), or the session's one elsewhere
	const { slug: urlSlug } = useParams({ strict: false });
	const active =
		viewer.memberships.find((m) => m.organization.slug === urlSlug) ??
		viewer.memberships.find(
			(m) => m.organization.id === viewer.activeOrganizationId,
		);
	const slug = active?.organization.slug ?? "";
	// the server can't know the theme, so read it after mount
	const [theme, setThemeChoice] = useState<Theme>("system");
	useEffect(() => setThemeChoice(getTheme()), []);

	// a sidebar row; collapsed (desktop only, the phone drawer is always full): centred, no padding, labels hidden
	const item = cn(
		"flex h-[30px] shrink-0 items-center gap-[9px] whitespace-nowrap rounded-md px-2 text-left font-[450] text-base text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
		collapsed && "md:justify-center md:px-0",
	);
	const hide = collapsed ? "md:hidden" : "";
	const fade = cn("min-w-0 truncate", hide);

	return (
		<nav
			aria-label="Main"
			className="flex h-full flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground"
		>
			<div className="flex items-center gap-0.5 p-2 pb-1">
				<Menu>
					<SideTip
						label={active?.organization.name ?? "Switch organization"}
						collapsed={collapsed}
					>
						<MenuTrigger
							render={
								<button
									type="button"
									aria-label="Switch organization"
									data-testid="organization-switcher"
									className={cn(
										"flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-[5px] text-left transition-colors hover:bg-muted",
										collapsed && "md:justify-center md:px-0",
									)}
								/>
							}
						>
							<OrgLogo
								organization={
									active?.organization ?? {
										name: "Ekra",
										logo: null,
										color: null,
									}
								}
							/>
							<span
								className={cn(
									"min-w-0 flex-1 truncate font-semibold text-base",
									hide,
								)}
							>
								{active?.organization.name ?? "Choose an organization"}
							</span>
							<span
								aria-hidden
								className={cn(
									"icon-[solar--sort-vertical-linear] size-[13px] shrink-0 text-muted-foreground",
									hide,
								)}
							/>
						</MenuTrigger>
					</SideTip>
					<MenuContent width={260} align="start">
						<MenuLabel>Organizations</MenuLabel>
						{viewer.memberships.map(({ organization, role }) => (
							<MenuItem
								key={organization.id}
								checked={organization.id === viewer.activeOrganizationId}
								onSelect={() =>
									navigate({
										to: "/o/$slug",
										params: { slug: organization.slug },
									})
								}
							>
								<OrgLogo organization={organization} px={20} />
								<span className="min-w-0 flex-1 truncate">
									{organization.name}
								</span>
								<span className="text-[11px] text-muted-foreground">
									{ROLE_LABEL[role] ?? role}
								</span>
							</MenuItem>
						))}
						<MenuSeparator />
						<MenuItem
							icon="icon-[hugeicons--plus-sign]"
							onSelect={() => navigate({ to: "/onboarding" })}
						>
							Create organization
						</MenuItem>
						<MenuSeparator />
						<MenuItem icon="icon-[solar--logout-2-linear]" onSelect={signOut}>
							Sign out
						</MenuItem>
					</MenuContent>
				</Menu>
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
								className="icon-[solar--sidebar-minimalistic-linear] size-[15px]"
							/>
						</button>
					</SideTip>
				)}
			</div>

			{/* scrolls without a visible bar (one would eat width and shift the icons when collapsed), and never sideways */}
			<div className="flex flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto px-2 pt-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
							params={{ slug }}
							activeOptions={{ exact: true }}
							className={cn(item, ACTIVE)}
						>
							<span aria-hidden className={cn(n.icon, "size-4 shrink-0")} />
							<span className={fade}>{n.label}</span>
						</Link>
					</SideTip>
				))}
			</div>

			<div className="flex flex-col gap-0.5 border-t px-2 pt-1.5 pb-2">
				<Menu>
					<SideTip label="Help & resources" collapsed={collapsed}>
						<MenuTrigger render={<button type="button" className={item} />}>
							<span
								aria-hidden
								className="icon-[solar--question-circle-linear] size-4 shrink-0"
							/>
							<span className={fade}>Help & resources</span>
						</MenuTrigger>
					</SideTip>
					<MenuContent width={260} align="start" side="top">
						<MenuLabel>Help & resources</MenuLabel>
						<MenuItem
							icon="icon-[solar--book-2-linear]"
							onSelect={() => external(`${REPO}/blob/main/SETUP.md`)}
							r={arrow}
						>
							Setup guide
						</MenuItem>
						<MenuSeparator />
						<MenuLabel>Support</MenuLabel>
						<MenuItem
							icon="icon-[solar--bug-linear]"
							onSelect={() => external(`${REPO}/issues/new/choose`)}
							r={arrow}
						>
							Report a problem
						</MenuItem>
						<MenuItem
							icon="icon-[hugeicons--github]"
							onSelect={() => external(REPO)}
							r={arrow}
						>
							Source code on GitHub
						</MenuItem>
					</MenuContent>
				</Menu>
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
					<Link
						to="/o/$slug/settings"
						params={{ slug }}
						className={cn(item, ACTIVE)}
					>
						<span
							aria-hidden
							className="icon-[solar--settings-linear] size-4 shrink-0"
						/>
						<span className={fade}>Settings</span>
					</Link>
				</SideTip>
				<Menu>
					<SideTip label="Account" collapsed={collapsed}>
						<MenuTrigger
							render={
								<button
									type="button"
									aria-label="Your account"
									// a 36px row with a 22px avatar; collapsed it gets 7px padding to sit on the icons' line
									className={cn(item, "h-9", collapsed && "md:px-[7px]")}
								/>
							}
						>
							<Av name={viewer.name} image={viewer.image} />
							<span
								className={cn(
									"min-w-0 flex-1 truncate font-medium text-foreground",
									hide,
								)}
							>
								{viewer.name}
							</span>
							<span
								aria-hidden
								className={cn(
									"icon-[solar--sort-vertical-linear] size-[13px] shrink-0 text-muted-foreground",
									hide,
								)}
							/>
						</MenuTrigger>
					</SideTip>
					{/* you, your settings, the theme and sign out */}
					<MenuContent width={260} align="start" side="top">
						<div className="flex items-center gap-2.5 px-2 pt-2 pb-2.5">
							<Av name={viewer.name} image={viewer.image} size="lg" />
							<div className="min-w-0">
								<div className="font-semibold">{viewer.name}</div>
								<div className="truncate text-muted-foreground text-xs">
									{viewer.email}
								</div>
							</div>
						</div>
						<MenuSeparator />
						<MenuItem
							icon="icon-[solar--settings-linear]"
							onSelect={() =>
								navigate({ to: "/o/$slug/settings/profile", params: { slug } })
							}
						>
							Account settings
						</MenuItem>
						<MenuSeparator />
						<MenuLabel>Theme</MenuLabel>
						<div className="px-1.5 pt-0.5 pb-1.5">
							{/* segmented control: the chosen theme is raised */}
							<fieldset className="flex w-full gap-0.5 rounded-[6px] bg-muted p-0.5">
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
										className="inline-flex h-6 flex-1 items-center justify-center gap-[5px] rounded-[5px] px-[9px] font-medium text-muted-foreground text-xs transition-colors hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)]"
									>
										<span aria-hidden className={cn(icon, "size-[13px]")} />
										{label}
									</button>
								))}
							</fieldset>
						</div>
						<MenuSeparator />
						<MenuItem icon="icon-[solar--logout-2-linear]" onSelect={signOut}>
							Sign out
						</MenuItem>
					</MenuContent>
				</Menu>
			</div>
		</nav>
	);
}
