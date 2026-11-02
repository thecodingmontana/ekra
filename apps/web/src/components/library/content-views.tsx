import { ago } from "@ekra/core";
import { Av } from "@ekra/ui/components/av";
import { cn } from "@ekra/ui/lib/utils";
import type { ReactNode } from "react";
import type { ContentItem } from "@/graphql/library";
import { KINDS } from "@/lib/content-kinds";
import { KindIcon, StatusPill, TagChips } from "./bits";

/** The menu and the star stop a click from also opening the card. */
function Stop({ children }: { children: ReactNode }) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: keeps a click on the menu from opening the content
		// biome-ignore lint/a11y/useKeyWithClickEvents: only stops propagation; the controls inside handle keys
		<span className="contents" onClick={(e) => e.stopPropagation()}>
			{children}
		</span>
	);
}

function Star({ item }: { item: ContentItem }) {
	if (!item.isFavorite) return null;
	return (
		<span
			className="inline-flex text-tint-amber"
			role="img"
			aria-label="Favorite"
		>
			<span className="icon-[solar--star-bold] size-3" aria-hidden="true" />
		</span>
	);
}

function Title({
	item,
	onOpen,
	className,
}: {
	item: ContentItem;
	onOpen: () => void;
	className?: string;
}) {
	return (
		<button
			type="button"
			className={cn("truncate text-left hover:underline", className)}
			onClick={(e) => {
				e.stopPropagation();
				onOpen();
			}}
			data-testid="content-title"
		>
			{item.title}
		</button>
	);
}

const inside = (n = 0) => `${n} ${n === 1 ? "item" : "items"} inside`;

/** The card's top: the cover picture, or the kind's icon on a panel in the kind's tint. */
function Cover({ item }: { item: ContentItem }) {
	const k = KINDS[item.kind];
	return (
		<div
			className={cn(
				"relative grid h-[108px] place-items-center overflow-hidden rounded-[7px]",
				!item.cover && k.tint,
			)}
		>
			{item.cover ? (
				<img
					src={item.cover}
					alt=""
					loading="lazy"
					className="size-full object-cover"
					data-testid="card-cover"
				/>
			) : (
				<span className={cn(k.icon, "size-7 opacity-80")} aria-hidden="true" />
			)}
			<span className="absolute top-1.5 left-1.5 inline-flex h-5 items-center rounded-[5px] bg-background/90 px-1.5 font-medium text-[11px] text-foreground backdrop-blur-sm">
				{k.label}
			</span>
		</div>
	);
}

/** A piece of content in the grid. */
export function ContentCard({
	item,
	childCount,
	onOpen,
	menu,
}: {
	item: ContentItem;
	/** for folders: how much is inside */
	childCount?: number;
	onOpen: () => void;
	menu: ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the title button is the keyboard target; the card is a bigger click area
		// biome-ignore lint/a11y/useKeyWithClickEvents: same as above
		<div
			className="group relative flex cursor-pointer flex-col gap-2.5 rounded-[10px] border bg-card p-1.5 pb-3 text-left transition-[border-color,box-shadow] duration-140 hover:border-foreground/15 hover:shadow-[0_4px_12px_-6px_rgba(0,0,0,0.1)]"
			onClick={onOpen}
			data-testid="content-card"
			data-kind={item.kind}
		>
			<Cover item={item} />
			<div className="flex min-w-0 flex-col gap-2 px-2">
				<div className="flex min-w-0 items-center gap-1.5">
					<Title
						item={item}
						onOpen={onOpen}
						className="font-semibold text-[14px]"
					/>
					<Star item={item} />
				</div>
				<div className="flex min-h-5 items-center">
					<TagChips tags={item.tags} />
				</div>
				<div className="flex items-center gap-2 text-muted-foreground text-xs">
					<span className="truncate" suppressHydrationWarning>
						{item.kind === "folder" && `${inside(childCount)} · `}
						Edited {ago(item.updatedAt)}
					</span>
					<StatusPill item={item} />
					<span className="flex-1" />
					{item.author && (
						<span title={`Made by ${item.author.name}`} className="inline-flex">
							<Av name={item.author.name} image={item.author.image} size="sm" />
						</span>
					)}
					<span className="inline-flex opacity-0 transition-opacity duration-140 group-focus-within:opacity-100 group-hover:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)]:opacity-100">
						<Stop>{menu}</Stop>
					</span>
				</div>
			</div>
		</div>
	);
}

/** A piece of content in the list. */
export function ContentRow({
	item,
	childCount,
	onOpen,
	menu,
}: {
	item: ContentItem;
	childCount?: number;
	onOpen: () => void;
	menu: ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the title button is the keyboard target
		// biome-ignore lint/a11y/useKeyWithClickEvents: same as above
		<div
			className="flex min-h-[52px] cursor-pointer items-center gap-3 border-t border-border/60 px-3.5 transition-colors duration-140 first:border-t-0 hover:bg-muted/60"
			onClick={onOpen}
			data-testid="content-row"
			data-kind={item.kind}
		>
			{item.cover ? (
				<img
					src={item.cover}
					alt=""
					loading="lazy"
					className="size-7 shrink-0 rounded-[6px] object-cover"
				/>
			) : (
				<KindIcon kind={item.kind} />
			)}
			<div className="min-w-0 flex-1 py-1.5">
				<div className="flex items-center gap-1.5">
					<Title item={item} onOpen={onOpen} className="font-medium" />
					<Star item={item} />
				</div>
				<div className="truncate text-muted-foreground text-xs">
					{item.description ||
						(item.kind === "folder"
							? inside(childCount)
							: KINDS[item.kind].label)}
				</div>
			</div>
			<span className="hidden w-[170px] lg:flex">
				<TagChips tags={item.tags} max={2} />
			</span>
			<span className="hidden w-28 truncate text-muted-foreground text-xs md:block">
				{KINDS[item.kind].label}
			</span>
			<span className="hidden w-[92px] sm:block">
				<StatusPill item={item} />
			</span>
			<span
				className="hidden w-[70px] text-muted-foreground text-xs tabular-nums md:block"
				suppressHydrationWarning
			>
				{ago(item.updatedAt)}
			</span>
			<span className="hidden md:inline-flex">
				{item.author && (
					<span title={`Made by ${item.author.name}`} className="inline-flex">
						<Av name={item.author.name} image={item.author.image} size="sm" />
					</span>
				)}
			</span>
			<Stop>{menu}</Stop>
		</div>
	);
}
