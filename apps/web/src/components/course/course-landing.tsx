import { buttonVariants } from "@ekra/ui/components/button";
import { cn } from "@ekra/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import type { Course, Lesson } from "@/graphql/course";
import { clock, resumeLesson } from "@/lib/course-outline";
import { LESSON_ICON } from "./builder-lesson-row";

/** A course as learners first see it: cover, progress, Start or Continue, and its outline. */
export function CourseLanding({
	slug,
	course,
	cover,
}: {
	slug: string;
	course: Course;
	cover: string | null;
}) {
	const next = resumeLesson(course);
	const done = course.completedCount;
	const total = course.lessonCount;
	const pct = total ? Math.round((done / total) * 100) : 0;
	const cta =
		done === 0 ? "Start course" : done === total ? "Watch again" : "Continue";

	return (
		<section className="flex flex-col gap-5" data-testid="course-landing">
			{cover && (
				<img
					src={cover}
					alt=""
					className="aspect-[21/9] w-full rounded-[10px] border object-cover"
				/>
			)}
			<div className="flex flex-wrap items-center gap-4 rounded-[10px] border bg-card px-4 py-3.5">
				<div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
					<span className="text-sm">
						<b className="font-semibold">{done}</b>
						<span className="text-muted-foreground">
							{" "}
							of {total} {total === 1 ? "lesson" : "lessons"} done
						</span>
					</span>
					<div
						className="h-1.5 overflow-hidden rounded-full bg-muted"
						role="progressbar"
						aria-label="Course progress"
						aria-valuenow={pct}
						aria-valuemin={0}
						aria-valuemax={100}
					>
						<div
							className="h-full rounded-full bg-brand"
							style={{ width: `${pct}%` }}
						/>
					</div>
				</div>
				{next ? (
					<Link
						to="/o/$slug/learn/$courseId/$lessonId"
						params={{ slug, courseId: course.id, lessonId: next.id }}
						className={buttonVariants({ size: "lg" })}
						data-testid="start-course"
					>
						{cta}
						<span
							className="icon-[solar--arrow-right-linear] size-4"
							aria-hidden="true"
						/>
					</Link>
				) : (
					<span className="text-muted-foreground text-sm">
						No lessons yet. Check back soon.
					</span>
				)}
			</div>

			<div className="flex flex-col gap-1">
				<h2 className="m-0 font-semibold text-md">Course content</h2>
				<p className="m-0 text-muted-foreground text-sm">
					{course.sections.length}{" "}
					{course.sections.length === 1 ? "section" : "sections"} · {total}{" "}
					{total === 1 ? "lesson" : "lessons"}
				</p>
			</div>
			<div className="overflow-hidden rounded-[10px] border bg-card">
				{course.sections.map((section) => (
					<details
						key={section.id}
						open
						className="group border-b last:border-b-0"
					>
						<summary className="flex cursor-pointer list-none items-center gap-2 bg-muted/40 px-4 py-2.5 font-semibold text-sm [&::-webkit-details-marker]:hidden">
							<span className="min-w-0 flex-1 truncate">{section.title}</span>
							<span className="font-normal text-muted-foreground text-xs">
								{section.lessons.length}{" "}
								{section.lessons.length === 1 ? "lesson" : "lessons"}
							</span>
							<span
								className="icon-[solar--alt-arrow-down-linear] size-3.5 text-muted-foreground transition-transform group-open:rotate-180"
								aria-hidden="true"
							/>
						</summary>
						<ul className="m-0 list-none p-0">
							{section.lessons.map((lesson) => (
								<li key={lesson.id} className="border-border/60 border-t">
									{lesson.locked ? (
										<div
											className="flex min-h-11 items-center gap-2.5 px-4 py-2 text-muted-foreground text-sm"
											title="Finish the lessons before this one first"
											data-testid="locked-lesson"
										>
											<LessonLine lesson={lesson} />
										</div>
									) : (
										<Link
											to="/o/$slug/learn/$courseId/$lessonId"
											params={{
												slug,
												courseId: course.id,
												lessonId: lesson.id,
											}}
											className="flex min-h-11 items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-muted/50"
										>
											<LessonLine lesson={lesson} />
										</Link>
									)}
								</li>
							))}
						</ul>
					</details>
				))}
			</div>
		</section>
	);
}

/** A lesson's icon (done, locked or its kind), title and length. */
function LessonLine({ lesson }: { lesson: Lesson }) {
	const [icon, label] = lesson.completed
		? ["icon-[solar--check-circle-bold] text-brand", "Done"]
		: lesson.locked
			? ["icon-[solar--lock-keyhole-minimalistic-linear]", "Locked"]
			: [cn(LESSON_ICON[lesson.kind], "text-muted-foreground"), null];
	return (
		<>
			<span
				className={cn(icon, "size-4 shrink-0")}
				{...(label
					? { role: "img", "aria-label": label }
					: { "aria-hidden": true })}
			/>
			<span className="min-w-0 flex-1 truncate">{lesson.title}</span>
			{lesson.video?.durationSeconds != null && (
				<span className="text-muted-foreground text-xs tabular-nums">
					{clock(lesson.video.durationSeconds)}
				</span>
			)}
		</>
	);
}
