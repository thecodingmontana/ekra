import { Button } from "@ekra/ui/components/button";
import {
	Menu,
	MenuContent,
	MenuItem,
	MenuSeparator,
	MenuTrigger,
} from "@ekra/ui/components/menu";
import { cn } from "@ekra/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { StatusPill } from "@/components/library/bits";
import type { PathStep } from "@/graphql/path";
import { KINDS } from "@/lib/content-kinds";

/** One step in the path builder: drag it, open its item, move or remove it from its menu. */
export function PathStepRow({
	slug,
	step,
	dropBefore,
	onMove,
	onRemove,
	onDragStart,
	onDragEnd,
	onDragOver,
}: {
	slug: string;
	step: PathStep;
	/** a dragged step would land just above this one */
	dropBefore: boolean;
	/** null when it can't move that way */
	onMove: { up: (() => void) | null; down: (() => void) | null };
	onRemove: () => void;
	onDragStart: () => void;
	onDragEnd: () => void;
	/** `after`: the pointer is on the row's lower half */
	onDragOver: (after: boolean) => void;
}) {
	const item = step.content;
	const k = KINDS[item.kind];
	return (
		<li
			draggable
			onDragStart={(e) => {
				e.dataTransfer.effectAllowed = "move";
				e.dataTransfer.setData("text/plain", item.title);
				onDragStart();
			}}
			onDragEnd={onDragEnd}
			onDragOver={(e) => {
				e.preventDefault();
				e.stopPropagation();
				const box = e.currentTarget.getBoundingClientRect();
				onDragOver(e.clientY > box.top + box.height / 2);
			}}
			className={cn(
				"group relative flex min-h-11 items-center gap-2.5 border-border/60 border-t px-3 py-1.5 transition-colors hover:bg-muted/50",
				dropBefore &&
					"before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded-full before:bg-brand",
			)}
			data-testid="builder-step"
		>
			<span
				className="icon-[solar--hamburger-menu-linear] size-3.5 shrink-0 cursor-grab text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100"
				aria-hidden="true"
			/>
			{/* the kind's text colour only, without its tinted square */}
			<span
				className={cn(k.icon, "size-4 shrink-0", k.tint.split(" ")[0])}
				aria-hidden="true"
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
				<Link
					to="/o/$slug/library/$id"
					params={{ slug, id: item.id }}
					className="min-w-0 truncate font-medium hover:underline hover:underline-offset-2"
					data-testid="builder-step-title"
				>
					{item.title}
				</Link>
				<span className="flex items-center gap-2 sm:ml-auto">
					{item.status === "draft" && <StatusPill item={item} />}
					<span className="text-muted-foreground text-xs">{k.label}</span>
				</span>
			</div>
			<Menu>
				<MenuTrigger
					render={
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`Actions for ${item.title}`}
							className="text-muted-foreground"
						/>
					}
				>
					<span
						className="icon-[solar--menu-dots-bold] size-4"
						aria-hidden="true"
					/>
				</MenuTrigger>
				<MenuContent>
					<MenuItem
						icon="icon-[solar--alt-arrow-up-linear]"
						disabled={!onMove.up}
						onSelect={() => onMove.up?.()}
					>
						Move up
					</MenuItem>
					<MenuItem
						icon="icon-[solar--alt-arrow-down-linear]"
						disabled={!onMove.down}
						onSelect={() => onMove.down?.()}
					>
						Move down
					</MenuItem>
					<MenuSeparator />
					<MenuItem
						icon="icon-[solar--close-circle-linear]"
						danger
						onSelect={onRemove}
					>
						Remove from path
					</MenuItem>
				</MenuContent>
			</Menu>
		</li>
	);
}
