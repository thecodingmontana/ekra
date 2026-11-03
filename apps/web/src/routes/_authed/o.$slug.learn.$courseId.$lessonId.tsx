import { CombinedGraphQLErrors } from "@apollo/client";
import { useApolloClient, useMutation, useQuery } from "@apollo/client/react";
import { Button, buttonVariants } from "@ekra/ui/components/button";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import {
	createFileRoute,
	Link,
	notFound,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CourseFinished } from "@/components/course/course-finished";
import { LessonView } from "@/components/course/lesson-view";
import { PlayerOutline } from "@/components/course/player-outline";
import { useAutoplay } from "@/components/course/use-autoplay";
import { KindIcon } from "@/components/library/bits";
import {
	COMPLETE_LESSON,
	COURSE,
	type CourseData,
	LESSON_QUERY,
	type LessonData,
	SAVE_LESSON_POSITION,
} from "@/graphql/course";
import { lessonPlace, neighbor, resumeLesson } from "@/lib/course-outline";
import { prime, reloadOnEnter } from "@/lib/routing";

export const Route = createFileRoute(
	"/_authed/o/$slug/learn/$courseId/$lessonId",
)({
	shouldReload: reloadOnEnter,
	loader: async ({ context, params }) => {
		const [{ data }, { data: course }] = await Promise.all([
			prime<LessonData, { slug: string; id: string }>(context.apolloClient, {
				query: LESSON_QUERY,
				variables: { slug: params.slug, id: params.lessonId },
			}).catch((error) => {
				// a locked lesson (course taken in order): back to the course's outline
				if (
					CombinedGraphQLErrors.is(error) &&
					error.errors[0]?.extensions?.code === "FORBIDDEN"
				)
					throw redirect({
						to: "/o/$slug/library/$id",
						params: { slug: params.slug, id: params.courseId },
					});
				throw error;
			}),
			prime<CourseData, { slug: string; id: string }>(context.apolloClient, {
				query: COURSE,
				variables: { slug: params.slug, id: params.courseId },
			}),
		]);
		if (
			!data?.lesson ||
			!course?.course ||
			data.lesson.courseId !== params.courseId
		)
			throw notFound();
		return { title: data.lesson.title };
	},
	head: ({ loaderData, match }) => ({
		meta: [
			{
				title: `${loaderData?.title ?? "Lesson"} · ${match.context.membership.organization.name}`,
			},
		],
	}),
	component: PlayerPage,
});

// set when a video ends and autoplay moves on: the next lesson's video starts by itself
let playNext = false;

function PlayerPage() {
	const { slug, courseId, lessonId } = Route.useParams();
	const { viewer } = Route.useRouteContext();
	const navigate = useNavigate();
	const client = useApolloClient();
	const courseVars = { slug, id: courseId };
	const { data } = useQuery<LessonData>(LESSON_QUERY, {
		variables: { slug, id: lessonId },
	});
	const { data: courseData } = useQuery<CourseData>(COURSE, {
		variables: courseVars,
	});
	const [complete] = useMutation(COMPLETE_LESSON, {
		refetchQueries: [{ query: COURSE, variables: courseVars }],
		awaitRefetchQueries: true,
	});
	const [savePosition] = useMutation(SAVE_LESSON_POSITION);
	const [autoplay, setAutoplay] = useAutoplay(viewer.id);
	const [drawer, setDrawer] = useState(false);
	const [finished, setFinished] = useState(false);
	const [busy, setBusy] = useState(false);
	// read the text to its end, or watched the video to its end
	const reached = useRef(false);
	const auto = useRef({ id: "", play: false });
	if (auto.current.id !== lessonId) {
		auto.current = { id: lessonId, play: playNext };
		playNext = false;
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset per lesson
	useEffect(() => {
		reached.current = false;
		setDrawer(false);
		setFinished(false);
	}, [lessonId]);

	const lesson = data?.lesson;
	const course = courseData?.course;
	if (!lesson || !course) return null;
	const place = lessonPlace(course, lesson.id);
	const prev = neighbor(course, lesson.id, -1);
	const next = neighbor(course, lesson.id, 1);
	const go = (id: string) =>
		navigate({
			to: "/o/$slug/learn/$courseId/$lessonId",
			params: { slug, courseId, lessonId: id },
		});

	const setDone = (done: boolean) =>
		complete({ variables: { slug, id: lesson.id, complete: done } }).catch(
			(e: Error) => {
				toast.error("Couldn't save your progress", { desc: e.message });
				throw e;
			},
		);

	const goNext = async () => {
		setBusy(true);
		try {
			// the last lesson's Finish counts as done; a quiz lesson is done by passing its quiz
			if (
				!lesson.completed &&
				lesson.kind !== "quiz" &&
				(reached.current || !next)
			)
				await setDone(true);
			if (next) {
				if (nextLocked())
					return void toast.info("Finish this lesson to unlock the next one", {
						desc:
							lesson.kind === "quiz"
								? "Pass the quiz first."
								: "Mark it complete when you're done.",
					});
				return void (await go(next.id));
			}
			const { data: fresh } = await client.query<CourseData>({
				query: COURSE,
				variables: courseVars,
				fetchPolicy: "network-only",
			});
			const c = fresh?.course;
			if (c && c.completedCount >= c.lessonCount) return setFinished(true);
			const open = c && resumeLesson(c);
			toast.info("A few lessons are still open", {
				desc: "Finish them to complete the course.",
			});
			if (open) await go(open.id);
		} catch {
			// the toast already said what went wrong
		} finally {
			setBusy(false);
		}
	};

	/** The next lesson is still locked, by the outline as it is now (after a completion's refresh). */
	const nextLocked = () => {
		const now = client.readQuery<CourseData>({
			query: COURSE,
			variables: courseVars,
		})?.course;
		return !!(now && neighbor(now, lesson.id, 1)?.locked);
	};

	const onEnded = async () => {
		reached.current = true;
		if (!lesson.completed) await setDone(true).catch(() => {});
		if (autoplay && next?.kind === "video" && !nextLocked()) {
			playNext = true;
			void go(next.id);
		}
	};

	const onPosition = (seconds: number) =>
		void savePosition({
			variables: { slug, id: lesson.id, seconds },
			update: (cache) =>
				cache.modify({
					id: cache.identify({ __typename: "Lesson", id: lesson.id }),
					fields: { positionSeconds: () => seconds },
				}),
		}).catch(() => {});

	return (
		<div className="flex h-dvh flex-col bg-background">
			<header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
				<Link
					to="/o/$slug/library/$id"
					params={{ slug, id: courseId }}
					aria-label="Back to the course"
					className={buttonVariants({ variant: "ghost", size: "icon" })}
					data-testid="player-back"
				>
					<span
						className="icon-[solar--arrow-left-linear] size-4"
						aria-hidden="true"
					/>
				</Link>
				<KindIcon kind="course" decorative />
				<span className="min-w-0 flex-1 truncate font-semibold text-sm">
					{course.title}
				</span>
				<Button
					variant="outline"
					size="sm"
					className="lg:hidden"
					onClick={() => setDrawer(true)}
					data-testid="open-outline"
				>
					<span
						className="icon-[solar--list-linear] size-3.5"
						aria-hidden="true"
					/>
					Content
				</Button>
			</header>

			<div className="flex min-h-0 flex-1">
				{finished ? (
					<CourseFinished
						slug={slug}
						courseId={courseId}
						title={course.title}
					/>
				) : (
					<div className="flex min-w-0 flex-1 flex-col">
						<div className="min-h-0 flex-1 overflow-y-auto">
							<article className="mx-auto w-full max-w-[860px] px-4 pt-6 pb-16 sm:px-8 sm:pt-8">
								{place && (
									<p
										className="m-0 mb-1.5 text-muted-foreground text-xs"
										data-testid="lesson-place"
									>
										Section {place.section} · Lesson {place.lesson} of{" "}
										{place.of}
									</p>
								)}
								<h1
									className="m-0 mb-6 break-words font-semibold text-xl leading-[1.25] tracking-[-0.02em] sm:text-2xl"
									data-testid="lesson-title"
								>
									{lesson.title}
								</h1>
								<LessonView
									slug={slug}
									key={lesson.id}
									lesson={lesson}
									autoPlay={auto.current.play}
									onPosition={onPosition}
									onEnded={() => void onEnded()}
									onReadToEnd={() => {
										reached.current = true;
									}}
								/>
							</article>
						</div>
						<footer className="flex shrink-0 flex-wrap items-center gap-2 border-t px-3 py-2.5 sm:px-6">
							{lesson.kind === "video" && (
								<label className="mr-auto flex items-center gap-2 text-muted-foreground text-xs">
									<input
										type="checkbox"
										checked={autoplay}
										onChange={(e) => setAutoplay(e.target.checked)}
										className="size-3.5 accent-brand"
										data-testid="autoplay"
									/>
									Autoplay next video
								</label>
							)}
							{lesson.kind === "quiz" ? (
								<span className="mr-auto text-muted-foreground text-xs">
									{lesson.completed
										? "Quiz passed"
										: "Pass the quiz to finish this lesson"}
								</span>
							) : (
								<Button
									variant="ghost"
									className={cn(lesson.kind !== "video" && "mr-auto")}
									onClick={() =>
										void setDone(!lesson.completed).catch(() => {})
									}
									aria-pressed={lesson.completed}
									data-testid="mark-complete"
								>
									<span
										className={cn(
											lesson.completed
												? "icon-[solar--check-circle-bold] text-brand"
												: "icon-[solar--check-circle-linear]",
											"size-4",
										)}
										aria-hidden="true"
									/>
									{lesson.completed ? "Completed" : "Mark complete"}
								</Button>
							)}
							<Button
								variant="outline"
								disabled={!prev}
								onClick={() => prev && void go(prev.id)}
								data-testid="lesson-back"
							>
								Back
							</Button>
							<Button
								disabled={busy}
								onClick={() => void goNext()}
								data-testid="lesson-next"
							>
								{next ? "Next lesson" : "Finish course"}
								<span
									className="icon-[solar--arrow-right-linear] size-3.5"
									aria-hidden="true"
								/>
							</Button>
						</footer>
					</div>
				)}

				{drawer && (
					<button
						type="button"
						aria-label="Close course content"
						className="fixed inset-0 z-40 bg-black/30 animate-in fade-in duration-150 lg:hidden"
						onClick={() => setDrawer(false)}
					/>
				)}
				<aside
					className={cn(
						"fixed inset-y-0 right-0 z-50 w-[300px] max-w-[85vw] border-l bg-background transition-transform duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none lg:static lg:z-auto lg:w-[320px] lg:max-w-none lg:translate-x-0 lg:transition-none",
						drawer ? "translate-x-0 shadow-2xl" : "translate-x-full",
					)}
					aria-label="Course content"
				>
					<PlayerOutline
						slug={slug}
						course={course}
						currentId={lesson.id}
						onClose={() => setDrawer(false)}
					/>
				</aside>
			</div>
		</div>
	);
}
