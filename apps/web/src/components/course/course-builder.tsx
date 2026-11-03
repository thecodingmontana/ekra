import { Button } from "@ekra/ui/components/button";
import {
	Menu,
	MenuContent,
	MenuItem,
	MenuSeparator,
	MenuTrigger,
} from "@ekra/ui/components/menu";
import { ConfirmModal } from "@ekra/ui/components/modal";
import { cn } from "@ekra/ui/lib/utils";
import { useState } from "react";
import { LibraryPicker } from "@/components/path/library-picker";
import type { Course, CourseSection, LessonKind } from "@/graphql/course";
import { dropPosition, stepTarget } from "@/lib/course-outline";
import { BuilderLessonRow } from "./builder-lesson-row";
import { InlineTitle } from "./inline-title";
import { type CourseEdits, useCourseEdits } from "./use-course-edits";

type Over = { sectionId: string; beforeId: string | null };
type Doomed = { kind: "section" | "lesson"; id: string; title: string };

/** The course's outline for its trainers: sections and their lessons, added, renamed, reordered and deleted here. */
export function CourseBuilder({
	slug,
	course,
}: {
	slug: string;
	course: Course;
}) {
	const edits = useCourseEdits(slug, course.id);
	const [renaming, setRenaming] = useState<string | null>(null);
	const [dragging, setDragging] = useState<string | null>(null);
	const [over, setOver] = useState<Over | null>(null);
	const [doomed, setDoomed] = useState<Doomed | null>(null);
	// the section a quiz lesson is being added to
	const [quizFor, setQuizFor] = useState<string | null>(null);

	const addSection = async () => {
		const id = await edits.addSection(`Section ${course.sections.length + 1}`);
		if (id) setRenaming(id);
	};

	const drop = () => {
		if (!dragging || !over) return;
		const target = course.sections.find((s) => s.id === over.sectionId);
		setDragging(null);
		setOver(null);
		if (!target) return;
		const ids = target.lessons.map((l) => l.id);
		const position = dropPosition(ids, dragging, over.beforeId);
		// dropped where it already is
		if (ids.indexOf(dragging) === position) return;
		void edits.moveLesson(dragging, target.id, position);
	};

	return (
		<section className="flex flex-col gap-3" data-testid="course-builder">
			<div className="flex items-center gap-2">
				<h2 className="m-0 font-semibold text-md">Course outline</h2>
				<span className="text-muted-foreground text-sm">
					{course.sections.length}{" "}
					{course.sections.length === 1 ? "section" : "sections"} ·{" "}
					{course.lessonCount} {course.lessonCount === 1 ? "lesson" : "lessons"}
				</span>
				<Button
					variant="outline"
					className="ml-auto"
					onClick={() => void addSection()}
					data-testid="add-section"
				>
					<span
						className="icon-[solar--add-circle-linear] size-3.5"
						aria-hidden="true"
					/>
					Add section
				</Button>
			</div>
			<label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
				<input
					type="checkbox"
					checked={course.sequential}
					onChange={(e) => void edits.setSequential(e.target.checked)}
					className="size-4 accent-brand"
					data-testid="sequential"
				/>
				<span>
					Take lessons in order
					<span className="text-muted-foreground">
						{" "}
						· each lesson unlocks when the ones before it are done
					</span>
				</span>
			</label>

			{course.sections.length === 0 && (
				<div className="flex flex-col items-center gap-1.5 rounded-[10px] border border-dashed px-6 py-14 text-center">
					<span
						className="icon-[solar--square-academic-cap-linear] mb-1 size-[22px] text-muted-foreground/70"
						aria-hidden="true"
					/>
					<h3 className="m-0 font-semibold text-md">Start with a section</h3>
					<p className="m-0 max-w-[380px] text-muted-foreground text-sm">
						Sections group the course's lessons. Each lesson is a video, a page
						to read or a quiz.
					</p>
				</div>
			)}

			{course.sections.map((section, si) => (
				<SectionCard
					key={section.id}
					slug={slug}
					course={course}
					section={section}
					index={si}
					edits={edits}
					renaming={renaming}
					setRenaming={setRenaming}
					over={dragging ? over : null}
					setOver={setOver}
					setDragging={setDragging}
					onDrop={drop}
					onDelete={setDoomed}
					onAddQuiz={() => setQuizFor(section.id)}
				/>
			))}

			<LibraryPicker
				slug={slug}
				kinds={["quiz"]}
				title="Add a quiz lesson"
				sub="Learners finish the lesson by passing the quiz."
				empty="There are no quizzes in the library yet. Create one with New → Quiz, then add it here."
				open={!!quizFor}
				onOpenChange={(o) => !o && setQuizFor(null)}
				onPick={async (quiz) => {
					const sectionId = quizFor;
					setQuizFor(null);
					if (sectionId)
						void edits.addLesson(sectionId, "quiz", quiz.title, quiz.id);
				}}
			/>
			<ConfirmModal
				open={!!doomed}
				onOpenChange={(o) => !o && setDoomed(null)}
				danger
				title={`Delete ${doomed?.title ?? ""}?`}
				body={
					doomed?.kind === "section"
						? "The section and every lesson in it are deleted, with their videos and learners' progress. This can't be undone."
						: "The lesson, its video and learners' progress on it are deleted. This can't be undone."
				}
				ok={doomed?.kind === "section" ? "Delete section" : "Delete lesson"}
				onConfirm={async () => {
					if (!doomed) return;
					await (doomed.kind === "section"
						? edits.deleteSection(doomed.id)
						: edits.deleteLesson(doomed.id));
					setDoomed(null);
				}}
			/>
		</section>
	);
}

function SectionCard({
	slug,
	course,
	section,
	index,
	edits,
	renaming,
	setRenaming,
	over,
	setOver,
	setDragging,
	onDrop,
	onDelete,
	onAddQuiz,
}: {
	slug: string;
	course: Course;
	section: CourseSection;
	index: number;
	edits: CourseEdits;
	renaming: string | null;
	setRenaming: (id: string | null) => void;
	over: Over | null;
	setOver: (over: Over | null) => void;
	setDragging: (id: string | null) => void;
	onDrop: () => void;
	onDelete: (doomed: Doomed) => void;
	onAddQuiz: () => void;
}) {
	const add = async (kind: LessonKind) => {
		const id = await edits.addLesson(
			section.id,
			kind,
			kind === "video" ? "New video lesson" : "New reading",
		);
		if (id) setRenaming(id);
	};
	const overHere = over?.sectionId === section.id;
	const move = (id: string, dir: 1 | -1) => {
		const to = stepTarget(course, id, dir);
		return to
			? () => void edits.moveLesson(id, to.sectionId, to.position)
			: null;
	};

	return (
		<div
			className={cn(
				"rounded-[10px] border bg-card transition-shadow",
				overHere && "ring-2 ring-brand/30",
			)}
			data-testid="builder-section"
		>
			<div className="flex items-center gap-2 px-3 py-2">
				<span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
					Section {index + 1}
				</span>
				{renaming === section.id ? (
					<InlineTitle
						value={section.title}
						label="Section title"
						onSave={(t) => edits.renameSection(section.id, t)}
						onDone={() => setRenaming(null)}
						className="font-semibold"
					/>
				) : (
					<button
						type="button"
						className="min-w-0 flex-1 truncate text-left font-semibold"
						onClick={() => setRenaming(section.id)}
						title="Rename"
						data-testid="section-title"
					>
						{section.title}
					</button>
				)}
				<span className="ml-auto shrink-0 text-muted-foreground text-xs">
					{section.lessons.length}{" "}
					{section.lessons.length === 1 ? "lesson" : "lessons"}
				</span>
				<Menu>
					<MenuTrigger
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Actions for ${section.title}`}
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
							icon="icon-[solar--pen-linear]"
							onSelect={() => setRenaming(section.id)}
						>
							Rename
						</MenuItem>
						<MenuItem
							icon="icon-[solar--alt-arrow-up-linear]"
							disabled={index === 0}
							onSelect={() => void edits.moveSection(section.id, index - 1)}
						>
							Move up
						</MenuItem>
						<MenuItem
							icon="icon-[solar--alt-arrow-down-linear]"
							disabled={index === course.sections.length - 1}
							onSelect={() => void edits.moveSection(section.id, index + 1)}
						>
							Move down
						</MenuItem>
						<MenuSeparator />
						<MenuItem
							icon="icon-[solar--trash-bin-minimalistic-linear]"
							danger
							onSelect={() =>
								onDelete({
									kind: "section",
									id: section.id,
									title: section.title,
								})
							}
						>
							Delete section
						</MenuItem>
					</MenuContent>
				</Menu>
			</div>
			<ul
				className="m-0 list-none p-0"
				onDragOver={(e) => {
					e.preventDefault();
					setOver({ sectionId: section.id, beforeId: null });
				}}
				onDrop={(e) => {
					e.preventDefault();
					onDrop();
				}}
			>
				{section.lessons.map((lesson, li) => (
					<BuilderLessonRow
						key={lesson.id}
						slug={slug}
						lesson={lesson}
						renaming={renaming === lesson.id}
						dropBefore={overHere && over?.beforeId === lesson.id}
						onRename={(t) => edits.renameLesson(lesson.id, t)}
						onRenameDone={() => setRenaming(null)}
						onStartRename={() => setRenaming(lesson.id)}
						onMove={{ up: move(lesson.id, -1), down: move(lesson.id, 1) }}
						onDelete={() =>
							onDelete({ kind: "lesson", id: lesson.id, title: lesson.title })
						}
						onDragStart={() => setDragging(lesson.id)}
						onDragEnd={() => {
							setDragging(null);
							setOver(null);
						}}
						onDragOver={(after) =>
							setOver({
								sectionId: section.id,
								beforeId: after
									? (section.lessons[li + 1]?.id ?? null)
									: lesson.id,
							})
						}
					/>
				))}
				<li
					className={cn(
						"relative flex flex-wrap items-center gap-1.5 border-border/60 border-t px-3 py-2",
						overHere &&
							over?.beforeId === null &&
							"before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded-full before:bg-brand",
					)}
				>
					{section.lessons.length === 0 && (
						<span className="mr-auto text-muted-foreground text-sm">
							No lessons yet.
						</span>
					)}
					<Button
						size="sm"
						variant="ghost"
						onClick={() => void add("video")}
						data-testid="add-video-lesson"
					>
						<span
							className="icon-[solar--videocamera-record-linear] size-3.5"
							aria-hidden="true"
						/>
						Video lesson
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => void add("page")}
						data-testid="add-page-lesson"
					>
						<span
							className="icon-[solar--document-text-linear] size-3.5"
							aria-hidden="true"
						/>
						Reading
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={onAddQuiz}
						data-testid="add-quiz-lesson"
					>
						<span
							className="icon-[solar--checklist-minimalistic-linear] size-3.5"
							aria-hidden="true"
						/>
						Quiz
					</Button>
				</li>
			</ul>
		</div>
	);
}
