import { ago } from "@ekra/core";
import { Av } from "@ekra/ui/components/av";
import { cn } from "@ekra/ui/lib/utils";
import type { ReactNode } from "react";
import type { ContentItem } from "@/graphql/library";
import { KINDS } from "@/lib/content-kinds";
import { KindIcon, StatusPill } from "./bits";

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
			className="group relative flex cursor-pointer flex-col gap-3 rounded-[10px] border bg-card p-3.5 text-left transition-[border-color,box-shadow] duration-140 hover:border-foreground/15 hover:shadow-[0_4px_12px_-6px_rgba(0,0,0,0.1)]"
			onClick={onOpen}
			data-testid="content-card"
			data-kind={item.kind}
		>
			<div className="flex items-center gap-2 pr-7">
				<KindIcon kind={item.kind} />
				<div className="flex min-w-0 flex-1 items-center gap-1.5">
					<Title
						item={item}
						onOpen={onOpen}
						className="font-semibold text-[14px]"
					/>
					<Star item={item} />
				</div>
			</div>
			<p className="line-clamp-2 min-h-[2.9em] text-muted-foreground text-sm leading-[1.45]">
				{item.description ||
					(item.kind === "folder"
						? `${childCount ?? 0} ${childCount === 1 ? "item" : "items"} inside`
						: "No description yet.")}
			</p>
			<div className="flex items-center gap-2.5 border-t border-border/60 pt-2.5 text-muted-foreground text-xs">
				<span className="truncate">{KINDS[item.kind].label}</span>
				<StatusPill item={item} />
				<span className="flex-1" />
				<span className="shrink-0" suppressHydrationWarning>
					{ago(item.updatedAt)}
				</span>
				{item.author && (
					<span title={`Made by ${item.author.name}`} className="inline-flex">
						<Av name={item.author.name} image={item.author.image} size="sm" />
					</span>
				)}
			</div>
			<span className="absolute top-2.5 right-2.5 opacity-0 transition-opacity duration-140 group-focus-within:opacity-100 group-hover:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)]:opacity-100">
				<Stop>{menu}</Stop>
			</span>
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
			<KindIcon kind={item.kind} />
			<div className="min-w-0 flex-1 py-1.5">
				<div className="flex items-center gap-1.5">
					<Title item={item} onOpen={onOpen} className="font-medium" />
					<Star item={item} />
				</div>
				<div className="truncate text-muted-foreground text-xs">
					{item.description ||
						(item.kind === "folder"
							? `${childCount ?? 0} ${childCount === 1 ? "item" : "items"} inside`
							: KINDS[item.kind].label)}
				</div>
			</div>
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
