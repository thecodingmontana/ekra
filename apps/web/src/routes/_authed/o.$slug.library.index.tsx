import { useQuery } from "@apollo/client/react";
import { cn } from "@ekra/ui/lib/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { type ReactNode, useState } from "react";
import { z } from "zod";
import { ContentFormModal } from "@/components/library/content-form-modal";
import { ContentMenu } from "@/components/library/content-menu";
import { ContentCard, ContentRow } from "@/components/library/content-views";
import { FilterBar, LayoutToggle, Pick } from "@/components/library/filter-bar";
import {
	LIBRARY_PANEL_COOKIE,
	LibraryPanel,
	showLabel,
} from "@/components/library/library-panel";
import {
	Empty,
	NewContentMenu,
	Skeleton,
} from "@/components/library/library-states";
import {
	type ContentItem,
	type ContentKind,
	LIBRARY,
	type LibraryData,
} from "@/graphql/library";
import { KIND_ORDER, KINDS } from "@/lib/content-kinds";
import { filterLibrary, libraryTags } from "@/lib/library-filter";
import { prime, reloadOnEnter } from "@/lib/routing";

const SORTS = [
	["updated", "Last updated"],
	["created", "Newest"],
	["title", "Name"],
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
	/** categories: content with any of them */
	tags: z.array(z.string().max(30)).max(8).optional().catch(undefined),
});
type Search = z.infer<typeof search>;

// read during server rendering too, so a collapsed panel is already collapsed on first paint
const readCollapsed = createIsomorphicFn()
	.server(async () => {
		const { getRequestHeaders } = await import("@tanstack/react-start/server");
		return (getRequestHeaders().get("cookie") ?? "").includes(
			`${LIBRARY_PANEL_COOKIE}=1`,
		);
	})
	.client(async () => document.cookie.includes(`${LIBRARY_PANEL_COOKIE}=1`));

export const Route = createFileRoute("/_authed/o/$slug/library/")({
	validateSearch: search,
	beforeLoad: async () => ({ libraryPanelCollapsed: await readCollapsed() }),
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
	const { libraryPanelCollapsed } = Route.useRouteContext();
	const {
		kind = "all",
		show = "all",
		sort = "updated",
		status = "all",
		view = "grid",
		folder,
		q = "",
		tags = [],
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
	const [creating, setCreating] = useState<{
		kind: ContentKind;
		parentId: string | null;
	} | null>(null);

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
		tags,
		folder,
	});
	const listed = new Set(all.map((i) => i.id));
	// folders at the top, and those inside a folder you can't see
	const topFolders = folders.filter(
		(f) => !f.parentId || !listed.has(f.parentId),
	);
	const favorites = all.filter((i) => i.isFavorite);
	const create = (k: ContentKind, top = false) =>
		setCreating({ kind: k, parentId: top ? null : (here?.id ?? null) });
	const childCount = (id: string) =>
		items.filter((i) => i.parentId === id).length;

	const browse = (id: string) =>
		setSearch({
			folder: id,
			show: undefined,
			kind: undefined,
			status: undefined,
			q: undefined,
			tags: undefined,
		});
	const open = (i: ContentItem, live = !archived) =>
		i.kind === "folder" && live
			? browse(i.id)
			: navigate({ to: "/o/$slug/library/$id", params: { slug, id: i.id } });
	const menu = (i: ContentItem) => (
		<ContentMenu slug={slug} item={i} canManage={canManage} folders={folders} />
	);
	const filtered =
		kind !== "all" || status !== "all" || !!q.trim() || tags.length > 0;

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
					setSearch({
						kind: undefined,
						status: undefined,
						q: undefined,
						tags: undefined,
					})
				}
				onCreate={() => create(kind === "all" ? "course" : kind)}
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
		<LibraryPanel
			initialCollapsed={libraryPanelCollapsed}
			show={show}
			folderId={here?.id}
			canManage={canManage}
			favorites={favorites}
			folders={topFolders}
			onShow={(v) =>
				setSearch({ show: v === "all" ? undefined : v, folder: undefined })
			}
			onOpen={(i) => open(i, true)}
			onNewFolder={() => create("folder", true)}
		>
			<main className="mx-auto w-full max-w-[1160px] px-4 pt-5 pb-24 sm:px-6 sm:pt-7">
				<div className="mb-4 flex flex-wrap items-start gap-3">
					<div className="min-w-0">
						<h1 className="m-0 font-semibold text-xl leading-[1.2] tracking-[-0.022em] sm:text-2xl">
							Library
						</h1>
						<p
							className="mt-1 text-muted-foreground"
							data-testid="library-count"
						>
							{data ? summary(items.length, archived, canManage) : "Loading…"}
						</p>
					</div>
					{canManage && !archived && (
						<div className="flex w-full items-center gap-1.5 sm:ml-auto sm:w-auto">
							<NewContentMenu onCreate={create} />
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
					<FilterBar
						tags={tags}
						allTags={libraryTags(all)}
						status={status}
						canManage={canManage}
						onTags={(t) => setSearch({ tags: t.length ? t : undefined })}
						onStatus={(v) => setSearch({ status: v === "all" ? undefined : v })}
						onReset={() => setSearch({ tags: undefined, status: undefined })}
					/>
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
					<LayoutToggle
						view={view}
						onChange={(v) => setSearch({ view: v === "grid" ? undefined : v })}
					/>
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
									{showLabel(show)}
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
						kind={creating?.kind}
						parentId={creating?.parentId ?? null}
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
		</LibraryPanel>
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
