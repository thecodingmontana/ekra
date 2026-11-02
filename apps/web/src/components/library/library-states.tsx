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
import type { ContentItem, ContentKind } from "@/graphql/library";
import { KIND_ORDER, KINDS } from "@/lib/content-kinds";

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

export function Empty({
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

export function Skeleton({ view }: { view: string }) {
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
					className="flex h-[200px] flex-col gap-3 rounded-[10px] border p-1.5"
				>
					<span className={cn(bar, "h-[108px] rounded-[7px]")} />
					<div className="flex flex-col gap-2.5 px-2">
						<span className={cn(bar, "h-3.5 w-3/5")} />
						<span className={cn(bar, "h-3 w-2/5")} />
						<span className={cn(bar, "h-3 w-1/3")} />
					</div>
				</div>
			))}
		</div>
	);
}

/** "New": pick a kind to create. */
export function NewContentMenu({
	onCreate,
}: {
	onCreate: (kind: ContentKind) => void;
}) {
	return (
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
					<MenuItem key={k} icon={KINDS[k].icon} onSelect={() => onCreate(k)}>
						{KINDS[k].label}
					</MenuItem>
				))}
				<MenuSeparator />
				<MenuItem icon={KINDS.folder.icon} onSelect={() => onCreate("folder")}>
					Folder
				</MenuItem>
			</MenuContent>
		</Menu>
	);
}
