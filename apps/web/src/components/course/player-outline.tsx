import { cn } from "@ekra/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { Course, Lesson } from "@/graphql/course";
import { clock, searchOutline } from "@/lib/course-outline";
import { LESSON_ICON } from "./builder-lesson-row";

/** The player's side panel: the course's sections and lessons with what you've done, and a search. */
export function PlayerOutline({
	slug,
	course,
	currentId,
	onClose,
}: {
	slug: string;
	course: Course;
	currentId: string;
	/** phones: the panel is a drawer with a close button */
	onClose: () => void;
}) {
	const [query, setQuery] = useState("");
	const sections = searchOutline(course, query);

	return (
		<div className="flex h-full flex-col" data-testid="player-outline">
			<div className="flex items-center gap-2 border-b px-4">
				<span className="-mb-px border-foreground border-b-2 py-2.5 font-semibold text-sm">
					Content
				</span>
				<span className="ml-auto text-muted-foreground text-xs tabular-nums">
					{course.completedCount}/{course.lessonCount} done
				</span>
				<button
					type="button"
					aria-label="Close course content"
					className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted lg:hidden"
					onClick={onClose}
				>
					<span
						className="icon-[solar--close-linear] size-4"
						aria-hidden="true"
					/>
				</button>
			</div>
			<div className="px-3 pt-3 pb-2">
				<label className="flex h-8 items-center gap-2 rounded-lg border border-input px-2.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
					<span
						className="icon-[solar--magnifer-linear] size-3.5 text-muted-foreground"
						aria-hidden="true"
					/>
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search lessons"
						aria-label="Search lessons"
						className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>
				</label>
			</div>
			<nav
				className="min-h-0 flex-1 overflow-y-auto px-2 pb-4"
				aria-label="Lessons"
			>
				{sections.length === 0 && (
					<p className="px-2 py-6 text-center text-muted-foreground text-sm">
						No lessons match “{query.trim()}”.
					</p>
				)}
				{sections.map((section) => {
					const n = course.sections.findIndex((s) => s.id === section.id) + 1;
					const done = section.lessons.filter((l) => l.completed).length;
					return (
						<div key={section.id} className="mt-2">
							<div className="flex items-center gap-2 px-2 py-1.5">
								<span
									className={cn(
										"size-3.5 shrink-0",
										done === section.lessons.length && done > 0
											? "icon-[solar--check-circle-bold] text-brand"
											: "icon-[solar--round-alt-arrow-down-linear] text-muted-foreground",
									)}
									aria-hidden="true"
								/>
								<span className="min-w-0 flex-1 truncate font-semibold text-[13px]">
									Sec {n}: {section.title}
								</span>
							</div>
							<ul className="m-0 list-none p-0">
								{section.lessons.map((lesson) => {
									const current = lesson.id === currentId;
									return (
										<li key={lesson.id}>
											{lesson.locked ? (
												<div
													className="flex min-h-9 items-center gap-2 rounded-md py-1.5 pr-2 pl-7 text-[13px] text-muted-foreground/70"
													title="Finish the lessons before this one first"
													data-testid="outline-lesson-locked"
												>
													<OutlineLine lesson={lesson} />
												</div>
											) : (
												<Link
													to="/o/$slug/learn/$courseId/$lessonId"
													params={{
														slug,
														courseId: course.id,
														lessonId: lesson.id,
													}}
													aria-current={current ? "page" : undefined}
													className={cn(
														"flex min-h-9 items-center gap-2 rounded-md py-1.5 pr-2 pl-7 text-[13px] transition-colors",
														current
															? "bg-muted font-medium text-foreground"
															: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
													)}
													data-testid="outline-lesson"
												>
													<OutlineLine lesson={lesson} />
												</Link>
											)}
										</li>
									);
								})}
							</ul>
						</div>
					);
				})}
			</nav>
		</div>
	);
}

function OutlineLine({ lesson }: { lesson: Lesson }) {
	return (
		<>
			<span
				className={cn(
					"size-3.5 shrink-0",
					lesson.completed
						? "icon-[solar--check-circle-bold] text-brand"
						: lesson.locked
							? "icon-[solar--lock-keyhole-minimalistic-linear]"
							: LESSON_ICON[lesson.kind],
				)}
				aria-hidden="true"
			/>
			<span className="min-w-0 flex-1 truncate">{lesson.title}</span>
			{lesson.completed && <span className="sr-only">(done)</span>}
			{lesson.locked && <span className="sr-only">(locked)</span>}
			{lesson.video?.durationSeconds != null && (
				<span className="text-[11px] tabular-nums">
					{clock(lesson.video.durationSeconds)}
				</span>
			)}
		</>
	);
}
