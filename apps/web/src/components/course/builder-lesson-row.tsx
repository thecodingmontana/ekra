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
import type { Lesson } from "@/graphql/course";
import { InlineTitle } from "./inline-title";
import { VideoStatus } from "./video-status";

export const LESSON_ICON = {
	video: "icon-[solar--videocamera-record-linear]",
	page: "icon-[solar--document-text-linear]",
	quiz: "icon-[solar--checklist-minimalistic-linear]",
} as const;

export const LESSON_TINT = {
	video: "text-tint-violet",
	page: "text-tint-blue",
	quiz: "text-tint-teal",
} as const;

/** One lesson in the course builder: drag it, open it, rename, move or delete it from its menu. */
export function BuilderLessonRow({
	slug,
	lesson,
	renaming,
	dropBefore,
	onRename,
	onRenameDone,
	onStartRename,
	onMove,
	onDelete,
	onDragStart,
	onDragEnd,
	onDragOver,
}: {
	slug: string;
	lesson: Lesson;
	renaming: boolean;
	/** a dragged lesson would land just above this one */
	dropBefore: boolean;
	onRename: (title: string) => unknown;
	onRenameDone: () => void;
	onStartRename: () => void;
	/** null when it can't move that way */
	onMove: { up: (() => void) | null; down: (() => void) | null };
	onDelete: () => void;
	onDragStart: () => void;
	onDragEnd: () => void;
	/** `after`: the pointer is on the row's lower half */
	onDragOver: (after: boolean) => void;
}) {
	return (
		<li
			draggable={!renaming}
			onDragStart={(e) => {
				e.dataTransfer.effectAllowed = "move";
				e.dataTransfer.setData("text/plain", lesson.title);
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
			data-testid="builder-lesson"
		>
			<span
				className="icon-[solar--hamburger-menu-linear] size-3.5 shrink-0 cursor-grab text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100"
				aria-hidden="true"
			/>
			<span
				className={cn(
					LESSON_ICON[lesson.kind],
					"size-4 shrink-0",
					LESSON_TINT[lesson.kind],
				)}
				aria-hidden="true"
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
				{renaming ? (
					<InlineTitle
						value={lesson.title}
						label="Lesson title"
						onSave={onRename}
						onDone={onRenameDone}
					/>
				) : (
					<Link
						to="/o/$slug/library/$id/lessons/$lessonId"
						params={{ slug, id: lesson.courseId, lessonId: lesson.id }}
						className="min-w-0 truncate font-medium hover:underline hover:underline-offset-2"
						data-testid="builder-lesson-title"
					>
						{lesson.title}
					</Link>
				)}
				{lesson.kind === "video" ? (
					<VideoStatus lesson={lesson} className="sm:ml-auto" />
				) : (
					<span className="text-muted-foreground text-xs sm:ml-auto">
						{lesson.kind === "quiz" ? "Quiz" : "Reading"}
					</span>
				)}
			</div>
			<Menu>
				<MenuTrigger
					render={
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`Actions for ${lesson.title}`}
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
					<MenuItem icon="icon-[solar--pen-linear]" onSelect={onStartRename}>
						Rename
					</MenuItem>
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
						icon="icon-[solar--trash-bin-minimalistic-linear]"
						danger
						onSelect={onDelete}
					>
						Delete lesson
					</MenuItem>
				</MenuContent>
			</Menu>
		</li>
	);
}
