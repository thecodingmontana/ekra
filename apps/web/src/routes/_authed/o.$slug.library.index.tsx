import { useQuery } from "@apollo/client/react";
import { Button } from "@ekra/ui/components/button";
import {
	Menu,
	MenuContent,
	MenuItem,
	MenuLabel,
	MenuSeparator,
	MenuTrigger,
} from "@ekra/ui/components/menu";
import { cn } from "@ekra/ui/lib/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { z } from "zod";
import { ContentFormModal } from "@/components/library/content-form-modal";
import { ContentMenu } from "@/components/library/content-menu";
import { ContentCard, ContentRow } from "@/components/library/content-views";
import {
	type ContentItem,
	type ContentKind,
	LIBRARY,
	type LibraryData,
} from "@/graphql/library";
import { KIND_ORDER, KINDS } from "@/lib/content-kinds";
import { filterLibrary } from "@/lib/library-filter";
import { prime, reloadOnEnter } from "@/lib/routing";

const SHOWS = [
	["all", "All content", "icon-[solar--library-linear]"],
	["favorites", "Favorites", "icon-[solar--star-linear]"],
	["recent", "Recently opened", "icon-[solar--clock-circle-linear]"],
	["templates", "Templates", "icon-[solar--layers-linear]"],
	["archived", "Archived", "icon-[solar--archive-linear]"],
] as const;
const SORTS = [
	["updated", "Last updated"],
	["created", "Newest"],
	["title", "Name"],
] as const;
const STATUSES = [
	["all", "Any status"],
	["published", "Published"],
	["draft", "Drafts"],
] as const;
const LAYOUTS = [
	["grid", "Grid", "icon-[solar--widget-linear]"],
	["list", "List", "icon-[solar--list-linear]"],
] as const;

const search = z.object({
	kind: z
		.enum(["all", ...KIND_ORDER])
		.optional()
		.catch(undefined),
	show: z
		.enum(["all", "favorites", "recent", "templates", "archived"])
		.optional()
		.catch(undefined),
	sort: z.enum(["updated", "created", "title"]).optional().catch(undefined),
	status: z.enum(["all", "published", "draft"]).optional().catch(undefined),
	view: z.enum(["grid", "list"]).optional().catch(undefined),
	folder: z.string().max(32).optional().catch(undefined),
	q: z.string().max(200).optional().catch(undefined),
});
type Search = z.infer<typeof search>;

export const Route = createFileRoute("/_authed/o/$slug/library/")({
	validateSearch: search,
	loaderDeps: ({ search }) => ({ archived: search.show === "archived" }),
	shouldReload: reloadOnEnter,
	loader: ({ context, params, deps }) =>
		prime(context.apolloClient, {
			query: LIBRARY,
			variables: { slug: params.slug, archived: deps.archived },
		}),
	head: ({ match }) => ({
		meta: [
			{ title: `Library · ${match.context.membership.organization.name}` },
		],
	}),
	component: LibraryPage,
});

function LibraryPage() {
	const { slug } = Route.useParams();
	const {
		kind = "all",
		show = "all",
		sort = "updated",
		status = "all",
		view = "grid",
		folder,
		q = "",
	} = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const archived = show === "archived";
	const { data } = useQuery<LibraryData>(LIBRARY, {
		variables: { slug, archived },
	});
	// folders for breadcrumbs and "Move to" come from the live library, also while looking at Archived
	const { data: live } = useQuery<LibraryData>(LIBRARY, {
		variables: { slug, archived: false },
		skip: !archived,
	});
	const [creating, setCreating] = useState<ContentKind | null>(null);

	const items = data?.library.items ?? [];
	const canManage = data?.library.canManage ?? false;
	const all = archived ? (live?.library.items ?? []) : items;
	const folders = all.filter((i) => i.kind === "folder");
	const setSearch = (patch: Partial<Search>) =>
		navigate({ search: (s) => ({ ...s, ...patch }), replace: true });

	const { shown, counts, here, crumbs } = filterLibrary(items, all, {
		kind,
		show,
		status,
		sort,
		q,
		folder,
	});
	const childCount = (id: string) =>
		items.filter((i) => i.parentId === id).length;

	const open = (i: ContentItem) =>
		i.kind === "folder" && !archived
			? setSearch({ folder: i.id, kind: undefined, q: undefined })
			: navigate({ to: "/o/$slug/library/$id", params: { slug, id: i.id } });
	const menu = (i: ContentItem) => (
		<ContentMenu slug={slug} item={i} canManage={canManage} folders={folders} />
	);
	const filtered = kind !== "all" || status !== "all" || !!q.trim();
	const showLabel = SHOWS.find(([k]) => k === show)?.[1] ?? "All content";

	let body: ReactNode;
	if (!data) body = <Skeleton view={view} />;
	else if (!shown.length)
		body = (
			<Empty
				filtered={filtered}
				show={show}
				here={here}
				canManage={canManage}
				onClear={() =>
					setSearch({ kind: undefined, status: undefined, q: undefined })
				}
				onCreate={() => setCreating(kind === "all" ? "course" : kind)}
			/>
		);
	else if (view === "grid")
		body = (
			<div className="grid grid-cols-[repeat(auto-fill,minmax(min(290px,100%),1fr))] gap-3">
				{shown.map((i) => (
					<ContentCard
						key={i.id}
						item={i}
						childCount={childCount(i.id)}
						onOpen={() => open(i)}
						menu={menu(i)}
					/>
				))}
			</div>
		);
	else
		body = (
			<div className="overflow-hidden rounded-[10px] border bg-card">
				{shown.map((i) => (
					<ContentRow
						key={i.id}
						item={i}
						childCount={childCount(i.id)}
						onOpen={() => open(i)}
						menu={menu(i)}
					/>
				))}
			</div>
		);

	return (
		<main className="mx-auto w-full max-w-[1160px] px-4 pt-5 pb-24 sm:px-6 sm:pt-7">
			<div className="mb-4 flex flex-wrap items-start gap-3">
				<div className="min-w-0">
					<h1 className="m-0 font-semibold text-xl leading-[1.2] tracking-[-0.022em] sm:text-2xl">
						Library
					</h1>
					<p className="mt-1 text-muted-foreground" data-testid="library-count">
						{data ? summary(items.length, archived, canManage) : "Loading…"}
					</p>
				</div>
				{canManage && !archived && (
					<div className="flex w-full items-center gap-1.5 sm:ml-auto sm:w-auto">
						<Menu>
							<MenuTrigger render={<Button data-testid="new-content" />}>
								<span
									className="icon-[hugeicons--plus-sign] size-3.5"
									aria-hidden="true"
								/>
								New
								<span
									className="icon-[solar--alt-arrow-down-linear] -mr-0.5 size-3.5 opacity-70"
									aria-hidden="true"
								/>
							</MenuTrigger>
							<MenuContent width={240}>
								<MenuLabel>Create</MenuLabel>
								{KIND_ORDER.filter((k) => k !== "folder").map((k) => (
									<MenuItem
										key={k}
										icon={KINDS[k].icon}
										onSelect={() => setCreating(k)}
									>
										{KINDS[k].label}
									</MenuItem>
								))}
								<MenuSeparator />
								<MenuItem
									icon={KINDS.folder.icon}
									onSelect={() => setCreating("folder")}
								>
									Folder
								</MenuItem>
							</MenuContent>
						</Menu>
					</div>
				)}
			</div>

			<nav
				className="mb-3 flex gap-0.5 overflow-x-auto border-b [scrollbar-width:none]"
				aria-label="Kinds of content"
			>
				{(["all", ...KIND_ORDER] as const).map((k) => (
					<button
						key={k}
						type="button"
						aria-current={kind === k ? "page" : undefined}
						data-testid={`tab-${k}`}
						onClick={() => setSearch({ kind: k === "all" ? undefined : k })}
						className={cn(
							"relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 font-medium text-sm transition-colors duration-140",
							kind === k
								? "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{k === "all" ? "All" : KINDS[k].plural}
						<span className="text-[11px] text-muted-foreground tabular-nums">
							{counts.get(k) ?? 0}
						</span>
					</button>
				))}
			</nav>

			<div className="mb-4 flex flex-wrap items-center gap-2">
				<div className="relative flex w-full items-center sm:w-auto">
					<span
						className="icon-[solar--magnifier-linear] pointer-events-none absolute left-[9px] size-[13px] text-muted-foreground"
						aria-hidden="true"
					/>
					<input
						className="h-[26px] w-full rounded-md border border-input bg-transparent pr-2.5 pl-[30px] text-sm outline-none transition-[border-color,box-shadow] duration-140 placeholder:text-muted-foreground focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_10%,transparent)] sm:w-[220px] dark:bg-input/30"
						placeholder="Search the library"
						aria-label="Search the library"
						value={q}
						onChange={(e) => setSearch({ q: e.target.value || undefined })}
						data-testid="library-search"
					/>
				</div>
				<Pick
					label="Show"
					value={show}
					options={SHOWS.filter(
						([k]) => canManage || (k !== "templates" && k !== "archived"),
					)}
					onChange={(v) =>
						setSearch({
							show: v === "all" ? undefined : (v as Search["show"]),
							folder: undefined,
						})
					}
					testId="show"
				/>
				{canManage && (
					<Pick
						label="Status"
						value={status}
						options={STATUSES}
						onChange={(v) =>
							setSearch({
								status: v === "all" ? undefined : (v as Search["status"]),
							})
						}
						testId="status-filter"
					/>
				)}
				<Pick
					label="Sort"
					value={sort}
					options={SORTS}
					prefix="Sort: "
					onChange={(v) =>
						setSearch({
							sort: v === "updated" ? undefined : (v as Search["sort"]),
						})
					}
					testId="sort"
				/>
				<span className="flex-1" />
				<fieldset className="inline-flex gap-0.5 rounded-md bg-muted p-0.5">
					<legend className="sr-only">Layout</legend>
					{LAYOUTS.map(([k, n, icon]) => (
						<button
							key={k}
							type="button"
							aria-pressed={view === k}
							aria-label={n}
							data-testid={`layout-${k}`}
							onClick={() => setSearch({ view: k === "grid" ? undefined : k })}
							className={cn(
								"inline-flex h-6 items-center gap-[5px] rounded-[5px] px-[9px] font-medium text-xs transition-colors duration-140",
								view === k
									? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)]"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							<span className={cn(icon, "size-[13px]")} aria-hidden="true" />
							<span className="hidden sm:inline">{n}</span>
						</button>
					))}
				</fieldset>
			</div>

			{(crumbs.length > 0 || show !== "all") && (
				<nav
					className="mb-3 flex min-w-0 items-center gap-2 text-muted-foreground text-sm"
					aria-label="Where you are"
				>
					<button
						type="button"
						className="whitespace-nowrap transition-colors hover:text-foreground"
						onClick={() => setSearch({ folder: undefined, show: undefined })}
						data-testid="crumb-library"
					>
						Library
					</button>
					{show !== "all" && (
						<>
							<Sep />
							<span className="truncate font-medium text-foreground">
								{showLabel}
							</span>
						</>
					)}
					{crumbs.map((c, n) => (
						<span key={c.id} className="flex min-w-0 items-center gap-2">
							<Sep />
							{n === crumbs.length - 1 ? (
								<span
									className="flex min-w-0 items-center gap-1.5 font-medium text-foreground"
									data-testid="current-folder"
								>
									<span className="truncate">{c.title}</span>
								</span>
							) : (
								<button
									type="button"
									className="truncate transition-colors hover:text-foreground"
									onClick={() => setSearch({ folder: c.id })}
								>
									{c.title}
								</button>
							)}
						</span>
					))}
					{here && (
						<span className="ml-auto shrink-0">
							<ContentMenu
								slug={slug}
								item={here}
								canManage={canManage}
								folders={folders}
								onArchived={() =>
									setSearch({ folder: here.parentId ?? undefined })
								}
							/>
						</span>
					)}
				</nav>
			)}

			{body}

			{canManage && (
				<ContentFormModal
					open={!!creating}
					onOpenChange={(o) => !o && setCreating(null)}
					slug={slug}
					kind={creating ?? undefined}
					parentId={here?.id ?? null}
					onCreated={(i) => {
						if (i.kind !== "folder")
							navigate({
								to: "/o/$slug/library/$id",
								params: { slug, id: i.id },
							});
					}}
				/>
			)}
		</main>
	);
}

const summary = (n: number, archived: boolean, canManage: boolean) =>
	`${n} ${n === 1 ? "item" : "items"}${archived ? " archived" : canManage ? "" : " published for you"}`;

function Sep() {
	return (
		<span
			className="icon-[solar--alt-arrow-right-linear] size-3 shrink-0 opacity-60"
			aria-hidden="true"
		/>
	);
}

/** A small dropdown that picks one value (filters and sort). */
function Pick({
	label,
	value,
	options,
	onChange,
	prefix = "",
	testId,
}: {
	label: string;
	value: string;
	options: readonly (readonly [string, string, ...string[]])[];
	onChange: (value: string) => void;
	prefix?: string;
	testId?: string;
}) {
	const current = options.find(([k]) => k === value)?.[1] ?? "";
	return (
		<Menu>
			<MenuTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						className="font-normal"
						aria-label={`${label}: ${current}`}
						data-testid={testId}
					/>
				}
			>
				{prefix}
				{current}
				<span
					className="icon-[solar--alt-arrow-down-linear] size-3.5 opacity-60"
					aria-hidden="true"
				/>
			</MenuTrigger>
			<MenuContent align="start" width={200}>
				{options.map(([k, n, icon]) => (
					<MenuItem
						key={k}
						icon={icon}
						checked={k === value}
						onSelect={() => onChange(k)}
					>
						{n}
					</MenuItem>
				))}
			</MenuContent>
		</Menu>
	);
}

const EMPTY: Record<string, [string, string, string]> = {
	favorites: [
		"icon-[solar--star-linear]",
		"No favorites yet",
		"Star content from its ⋯ menu to find it here quickly.",
	],
	recent: [
		"icon-[solar--clock-circle-linear]",
		"Nothing opened yet",
		"Content you open shows up here, newest first.",
	],
	templates: [
		"icon-[solar--layers-linear]",
		"No templates yet",
		"Save a course or page as a template so your team can start from it.",
	],
	archived: [
		"icon-[solar--archive-linear]",
		"Nothing archived",
		"Archived content waits here until you restore or delete it.",
	],
};

function Empty({
	filtered,
	show,
	here,
	canManage,
	onClear,
	onCreate,
}: {
	filtered: boolean;
	show: string;
	here: ContentItem | undefined;
	canManage: boolean;
	onClear: () => void;
	onCreate: () => void;
}) {
	let [icon, title, lead] = EMPTY[show] ?? [
		"icon-[solar--folder-with-files-linear]",
		canManage ? "Your library is empty" : "Nothing here yet",
		canManage
			? "Create your first course, page or quiz to start building your library."
			: "Content your trainers publish will show up here.",
	];
	if (here && show === "all")
		[icon, title, lead] = [
			"icon-[solar--folder-open-linear]",
			"This folder is empty",
			canManage
				? "Create content here, or move content in from its ⋯ menu."
				: "Nothing has been published in this folder yet.",
		];
	if (filtered)
		[icon, title, lead] = [
			"icon-[solar--magnifier-bug-linear]",
			"No results found",
			"Nothing matches your search or filters. Try a different word.",
		];
	return (
		<div className="rounded-[10px] border bg-card" data-testid="library-empty">
			<div className="flex flex-col items-center gap-1.5 px-6 py-14 text-center">
				<span className="mb-1 text-muted-foreground/70">
					<span className={cn(icon, "size-[22px]")} aria-hidden="true" />
				</span>
				<h2 className="m-0 font-semibold text-md">{title}</h2>
				<p className="m-0 mb-2.5 max-w-[340px] text-muted-foreground text-sm">
					{lead}
				</p>
				{filtered ? (
					<Button variant="outline" size="sm" onClick={onClear}>
						Clear filters
					</Button>
				) : (
					canManage &&
					show === "all" && (
						<Button size="sm" onClick={onCreate}>
							<span
								className="icon-[hugeicons--plus-sign] size-3.5"
								aria-hidden="true"
							/>
							Create content
						</Button>
					)
				)}
			</div>
		</div>
	);
}

function Skeleton({ view }: { view: string }) {
	const bar = "animate-pulse rounded bg-muted";
	if (view === "list")
		return (
			<div className="overflow-hidden rounded-[10px] border" aria-hidden="true">
				{[0, 1, 2, 3, 4].map((n) => (
					<div
						key={n}
						className="flex h-[52px] items-center gap-3 border-t px-3.5 first:border-t-0"
					>
						<span className={cn(bar, "size-7")} />
						<span className={cn(bar, "h-3.5 w-1/3")} />
					</div>
				))}
			</div>
		);
	return (
		<div
			className="grid grid-cols-[repeat(auto-fill,minmax(min(290px,100%),1fr))] gap-3"
			aria-hidden="true"
		>
			{[0, 1, 2, 3, 4, 5].map((n) => (
				<div
					key={n}
					className="flex h-[148px] flex-col gap-3 rounded-[10px] border p-3.5"
				>
					<div className="flex items-center gap-2">
						<span className={cn(bar, "size-7")} />
						<span className={cn(bar, "h-3.5 w-2/5")} />
					</div>
					<span className={cn(bar, "h-3 w-4/5")} />
					<span className={cn(bar, "h-3 w-3/5")} />
				</div>
			))}
		</div>
	);
}
