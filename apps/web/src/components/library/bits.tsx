import { cn } from "@ekra/ui/lib/utils";
import type { ContentItem, ContentKind } from "@/graphql/library";
import { KINDS } from "@/lib/content-kinds";

/** The kind's icon on its tinted square. */
export function KindIcon({
	kind,
	size = 28,
	className,
	decorative,
}: {
	kind: ContentKind;
	size?: 28 | 34 | 40;
	className?: string;
	/** next to the kind's name already: hidden from screen readers */
	decorative?: boolean;
}) {
	const k = KINDS[kind];
	return (
		<span
			className={cn(
				"grid shrink-0 place-items-center",
				size === 28 && "size-7 rounded-[6px]",
				size === 34 && "size-[34px] rounded-[9px]",
				size === 40 && "size-10 rounded-[10px]",
				k.tint,
				className,
			)}
			{...(decorative
				? { "aria-hidden": true }
				: { role: "img", "aria-label": k.label })}
		>
			<span
				className={cn(k.icon, size === 28 ? "size-[15px]" : "size-[19px]")}
				aria-hidden="true"
			/>
		</span>
	);
}

/** Draft or published, and Template, as small outlined pills. */
export function StatusPill({ item }: { item: ContentItem }) {
	if (item.kind === "folder") return null;
	const pill =
		"inline-flex h-5 items-center gap-[5px] whitespace-nowrap rounded-[5px] border px-[7px] font-medium text-xs";
	// a template is a starting point: draft or published doesn't apply to it
	if (item.isTemplate)
		return (
			<span className={pill} data-testid="status">
				<span
					className="icon-[solar--layers-linear] size-3 text-tint-violet"
					aria-hidden="true"
				/>
				Template
			</span>
		);
	return (
		<span className="flex items-center gap-1.5">
			<span className={pill} data-testid="status">
				<i
					className={cn(
						"size-1.5 rounded-full",
						item.status === "published" ? "bg-tint-green" : "bg-tint-amber",
					)}
				/>
				{item.status === "published" ? "Published" : "Draft"}
			</span>
		</span>
	);
}
