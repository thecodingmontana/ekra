import type { ContentItem } from "../graphql/library.ts";

export type LibraryView = {
	kind: string;
	show: "all" | "favorites" | "recent" | "templates" | "archived";
	status: "all" | "published" | "draft";
	sort: "updated" | "created" | "title";
	q: string;
	/** categories: an item matches when it has any of them */
	tags: string[];
	folder?: string;
};

/** Every category used in the library, each once (first spelling wins), A to Z. */
export function libraryTags(items: ContentItem[]): string[] {
	const seen = new Map<string, string>();
	for (const i of items)
		for (const t of i.tags)
			if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
	return [...seen.values()].sort((a, b) =>
		a.localeCompare(b, undefined, { sensitivity: "base" }),
	);
}

/**
 * What the library shows for a view. Folders are browsed only on the plain All view; any filter or search lists
 * matches from every folder. `items` is what the page lists; `all` is the live library (for folders and
 * breadcrumbs, also while the page lists Archived).
 */
export function filterLibrary(
	items: ContentItem[],
	all: ContentItem[],
	v: LibraryView,
) {
	const byId = new Map(all.map((i) => [i.id, i]));
	const browsing =
		v.show === "all" &&
		!v.q.trim() &&
		v.kind === "all" &&
		v.status === "all" &&
		!v.tags.length;
	// a folder that's gone (deleted, archived, never existed) shows the top of the library
	const here = browsing && v.folder ? byId.get(v.folder) : undefined;
	const listed = new Set(items.map((i) => i.id));
	// content in a folder you can't see (a draft folder, an archived one) shows at the top
	const inHere = (i: ContentItem) =>
		here ? i.parentId === here.id : !i.parentId || !listed.has(i.parentId);

	const query = v.q.trim().toLowerCase();
	const tags = new Set(v.tags.map((t) => t.toLowerCase()));
	const matching = items.filter(
		(i) =>
			(v.show !== "favorites" || i.isFavorite) &&
			(v.show !== "recent" || i.viewedAt) &&
			(v.show !== "templates" || i.isTemplate) &&
			(v.status === "all" || (i.kind !== "folder" && i.status === v.status)) &&
			(!tags.size || i.tags.some((t) => tags.has(t.toLowerCase()))) &&
			(!query ||
				i.title.toLowerCase().includes(query) ||
				(i.description ?? "").toLowerCase().includes(query)),
	);
	// tab counts are totals across folders
	const counts = new Map<string, number>([["all", matching.length]]);
	for (const i of matching) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);

	const key = {
		updated: (i: ContentItem) =>
			v.show === "recent" ? (i.viewedAt ?? "") : i.updatedAt,
		created: (i: ContentItem) => i.createdAt,
		title: (i: ContentItem) => i.title.toLowerCase(),
	}[v.sort];
	const shown = (browsing ? matching.filter(inHere) : matching)
		.filter((i) => v.kind === "all" || i.kind === v.kind)
		.sort((a, b) => {
			// folders first while browsing, then by the chosen order
			if (browsing && (a.kind === "folder") !== (b.kind === "folder"))
				return a.kind === "folder" ? -1 : 1;
			const [x, y] = [key(a), key(b)];
			if (x === y) return 0;
			return v.sort === "title" ? (x > y ? 1 : -1) : x < y ? 1 : -1;
		});

	const crumbs: ContentItem[] = [];
	for (
		let at = here;
		at && crumbs.length < 20;
		at = at.parentId ? byId.get(at.parentId) : undefined
	)
		crumbs.unshift(at);

	return { shown, counts, here, crumbs, browsing };
}
