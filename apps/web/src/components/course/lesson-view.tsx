import { useEffect, useRef } from "react";
import { ReadOnlyBody } from "@/components/editor/read-only-body";
import type { LessonDetail } from "@/graphql/course";
import { QuizCard } from "./quiz-card";
import { VideoPlayer } from "./video-player";
import { VideoStatus } from "./video-status";

/**
 * A lesson for learners: its video (resuming where you stopped) and its text. Says when you reached the end
 * of the text (`onReadToEnd`) or of the video (`onEnded`). Remount it (key) for another lesson.
 */
export function LessonView({
	slug,
	lesson,
	autoPlay,
	onPosition,
	onEnded,
	onReadToEnd,
}: {
	slug: string;
	lesson: LessonDetail;
	autoPlay: boolean;
	onPosition: (seconds: number) => void;
	onEnded: () => void;
	onReadToEnd: () => void;
}) {
	const end = useRef<HTMLDivElement>(null);
	const readToEnd = useRef(onReadToEnd);
	readToEnd.current = onReadToEnd;

	useEffect(() => {
		const el = end.current;
		if (!el || lesson.kind !== "page") return;
		const seen = new IntersectionObserver((entries) => {
			if (entries.some((e) => e.isIntersecting)) {
				readToEnd.current();
				seen.disconnect();
			}
		});
		// the text renders just after mounting: look once it's in place
		const wait = setTimeout(() => seen.observe(el), 600);
		return () => {
			clearTimeout(wait);
			seen.disconnect();
		};
	}, [lesson.kind]);

	const v = lesson.video;
	return (
		<div className="flex flex-col gap-6">
			{lesson.kind === "quiz" && (
				<QuizCard
					slug={slug}
					quizId={lesson.quizId}
					completed={lesson.completed}
				/>
			)}
			{lesson.kind === "video" &&
				(v?.status === "ready" && v.playlist ? (
					<VideoPlayer
						src={v.playlist}
						poster={v.poster}
						startAt={lesson.positionSeconds}
						autoPlay={autoPlay}
						onPosition={onPosition}
						onEnded={onEnded}
					/>
				) : (
					<div className="grid aspect-video place-items-center rounded-[10px] border border-dashed bg-muted/40 text-center">
						<div className="flex flex-col items-center gap-2 px-6">
							<span
								className="icon-[solar--videocamera-record-linear] size-[22px] text-muted-foreground/70"
								aria-hidden="true"
							/>
							<p className="m-0 font-semibold">This video isn't ready yet</p>
							{v && <VideoStatus lesson={lesson} />}
						</div>
					</div>
				))}
			{lesson.doc ? (
				<ReadOnlyBody key={lesson.bodyUpdatedAt} doc={lesson.doc} />
			) : (
				lesson.kind === "page" && (
					<p className="m-0 text-muted-foreground">
						Nothing to read here yet. Its trainers are still writing it.
					</p>
				)
			)}
			<div ref={end} aria-hidden="true" className="h-px" />
		</div>
	);
}
