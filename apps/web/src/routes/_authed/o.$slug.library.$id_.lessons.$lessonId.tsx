import { useMutation, useQuery } from "@apollo/client/react";
import { Button, buttonVariants } from "@ekra/ui/components/button";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import {
	createFileRoute,
	Link,
	notFound,
	redirect,
} from "@tanstack/react-router";
import { useState } from "react";
import {
	LESSON_ICON,
	LESSON_TINT,
} from "@/components/course/builder-lesson-row";
import { InlineTitle } from "@/components/course/inline-title";
import { QuizCard } from "@/components/course/quiz-card";
import { VideoUploader } from "@/components/course/video-uploader";
import { BodyEditor, type BodySave } from "@/components/editor/body-editor";
import {
	COURSE,
	type CourseData,
	LESSON_QUERY,
	type LessonData,
	RENAME_LESSON,
	SAVE_LESSON_BODY,
} from "@/graphql/course";
import { LIBRARY, type LibraryData } from "@/graphql/library";
import { lessonPlace, neighbor } from "@/lib/course-outline";
import { prime, reloadOnEnter } from "@/lib/routing";

const LESSON_BODY: BodySave = {
	mutation: SAVE_LESSON_BODY,
	field: "saveLessonBody",
	typename: "Lesson",
	query: LESSON_QUERY,
	queryField: "lesson",
};

export const Route = createFileRoute(
	"/_authed/o/$slug/library/$id_/lessons/$lessonId",
)({
	shouldReload: reloadOnEnter,
	loader: async ({ context, params }) => {
		const [{ data }, { data: lib }] = await Promise.all([
			prime<LessonData, { slug: string; id: string }>(context.apolloClient, {
				query: LESSON_QUERY,
				variables: { slug: params.slug, id: params.lessonId },
			}),
			prime<LibraryData, { slug: string; archived: boolean }>(
				context.apolloClient,
				{ query: LIBRARY, variables: { slug: params.slug, archived: false } },
			),
			prime(context.apolloClient, {
				query: COURSE,
				variables: { slug: params.slug, id: params.id },
			}),
		]);
		if (!data?.lesson || data.lesson.courseId !== params.id) throw notFound();
		// learners take the lesson in the player
		if (!lib?.library.canManage)
			throw redirect({
				to: "/o/$slug/learn/$courseId/$lessonId",
				params: {
					slug: params.slug,
					courseId: params.id,
					lessonId: params.lessonId,
				},
			});
		return { title: data.lesson.title };
	},
	head: ({ loaderData, match }) => ({
		meta: [
			{
				title: `${loaderData?.title ?? "Lesson"} · ${match.context.membership.organization.name}`,
			},
		],
	}),
	component: LessonEditorPage,
});

function LessonEditorPage() {
	const { slug, id, lessonId } = Route.useParams();
	const { data } = useQuery<LessonData>(LESSON_QUERY, {
		variables: { slug, id: lessonId },
	});
	const { data: courseData } = useQuery<CourseData>(COURSE, {
		variables: { slug, id },
	});
	const [rename] = useMutation(RENAME_LESSON);
	const [renaming, setRenaming] = useState(false);
	const lesson = data?.lesson;
	const course = courseData?.course;
	if (!lesson) return null;
	const place = course && lessonPlace(course, lesson.id);
	const prev = course && neighbor(course, lesson.id, -1);
	const next = course && neighbor(course, lesson.id, 1);

	const save = (title: string) =>
		rename({
			variables: { slug, id: lesson.id, title },
			optimisticResponse: {
				renameLesson: { __typename: "Lesson", id: lesson.id, title },
			},
		}).catch((e: Error) =>
			toast.error("Couldn't rename the lesson", { desc: e.message }),
		);

	return (
		<main className="mx-auto w-full max-w-[880px] px-4 pt-5 pb-24 sm:px-6 sm:pt-7">
			<nav
				className="mb-5 flex min-w-0 items-center gap-2 text-muted-foreground text-sm"
				aria-label="Where you are"
			>
				<Link
					to="/o/$slug/library"
					params={{ slug }}
					className="whitespace-nowrap transition-colors hover:text-foreground"
				>
					Library
				</Link>
				<Sep />
				<Link
					to="/o/$slug/library/$id"
					params={{ slug, id }}
					className="truncate transition-colors hover:text-foreground"
					data-testid="crumb-course"
				>
					{course?.title ?? "Course"}
				</Link>
				<Sep />
				<span className="truncate font-medium text-foreground">
					{lesson.title}
				</span>
			</nav>

			<header className="mb-6 flex flex-wrap items-start gap-3.5">
				<span
					className={cn(
						"grid size-10 shrink-0 place-items-center rounded-[10px]",
						LESSON_TINT[lesson.kind],
						"bg-current/13",
					)}
				>
					<span
						className={cn(LESSON_ICON[lesson.kind], "size-5 text-current")}
						aria-hidden="true"
					/>
				</span>
				<div className="min-w-0 flex-1">
					{place && (
						<p className="m-0 mb-1 text-muted-foreground text-xs">
							Section {place.section} · Lesson {place.lesson} of {place.of}
						</p>
					)}
					{renaming ? (
						<InlineTitle
							value={lesson.title}
							label="Lesson title"
							onSave={save}
							onDone={() => setRenaming(false)}
							className="h-9 font-semibold text-xl"
						/>
					) : (
						<h1 className="m-0 break-words font-semibold text-xl leading-[1.2] tracking-[-0.022em] sm:text-2xl">
							<button
								type="button"
								className="text-left"
								onClick={() => setRenaming(true)}
								title="Rename"
								data-testid="lesson-heading"
							>
								{lesson.title}
							</button>
						</h1>
					)}
				</div>
				<div className="flex w-full items-center gap-1.5 sm:w-auto">
					<Button variant="outline" onClick={() => setRenaming(true)}>
						<span
							className="icon-[solar--pen-linear] size-3.5"
							aria-hidden="true"
						/>
						Rename
					</Button>
					<Link
						to="/o/$slug/learn/$courseId/$lessonId"
						params={{ slug, courseId: id, lessonId: lesson.id }}
						className={buttonVariants({ variant: "outline" })}
					>
						<span
							className="icon-[solar--eye-linear] size-3.5"
							aria-hidden="true"
						/>
						Preview
					</Link>
				</div>
			</header>

			<div className="flex flex-col gap-6">
				{lesson.kind === "video" && (
					<VideoUploader slug={slug} lesson={lesson} />
				)}
				{lesson.kind === "quiz" && (
					<QuizCard
						slug={slug}
						quizId={lesson.quizId}
						completed={false}
						forManager
					/>
				)}
				<BodyEditor
					key={lesson.id}
					slug={slug}
					item={lesson}
					save={LESSON_BODY}
				/>
			</div>

			<div className="mt-10 flex items-center gap-2 border-t pt-4">
				{prev && (
					<Link
						to="/o/$slug/library/$id/lessons/$lessonId"
						params={{ slug, id, lessonId: prev.id }}
						className={buttonVariants({ variant: "ghost" })}
					>
						<span
							className="icon-[solar--arrow-left-linear] size-3.5"
							aria-hidden="true"
						/>
						<span className="max-w-[200px] truncate">{prev.title}</span>
					</Link>
				)}
				{next && (
					<Link
						to="/o/$slug/library/$id/lessons/$lessonId"
						params={{ slug, id, lessonId: next.id }}
						className={cn(buttonVariants({ variant: "ghost" }), "ml-auto")}
					>
						<span className="max-w-[200px] truncate">{next.title}</span>
						<span
							className="icon-[solar--arrow-right-linear] size-3.5"
							aria-hidden="true"
						/>
					</Link>
				)}
			</div>
		</main>
	);
}

function Sep() {
	return (
		<span
			className="icon-[solar--alt-arrow-right-linear] size-3 shrink-0 opacity-60"
			aria-hidden="true"
		/>
	);
}
