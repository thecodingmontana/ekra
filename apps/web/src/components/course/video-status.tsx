import { cn } from "@ekra/ui/lib/utils";
import type { Lesson } from "@/graphql/course";
import { clock } from "@/lib/course-outline";
import { percent } from "@/lib/video-upload";
import { useUpload } from "./upload-store";

/** Where a video lesson's video stands: none yet, uploading, processing, ready (with its length) or failed. */
export function VideoStatus({
	lesson,
	className,
}: {
	lesson: Pick<Lesson, "id" | "video">;
	className?: string;
}) {
	const upload = useUpload(lesson.id);
	const v = lesson.video;
	const [icon, text, tone] = upload
		? [
				"icon-[solar--upload-linear]",
				`Uploading ${percent(upload.sent, upload.size)}%`,
				"text-tint-blue",
			]
		: !v
			? ["icon-[solar--videocamera-record-linear]", "No video yet", ""]
			: v.status === "ready"
				? [
						"icon-[solar--play-circle-linear]",
						v.durationSeconds != null ? clock(v.durationSeconds) : "Ready",
						"",
					]
				: v.status === "processing"
					? ["icon-[solar--hourglass-linear]", "Processing…", "text-tint-amber"]
					: v.status === "failed"
						? [
								"icon-[solar--danger-triangle-linear]",
								v.error ? `Failed: ${v.error}` : "Failed",
								"text-destructive",
							]
						: [
								"icon-[solar--danger-triangle-linear]",
								"Upload didn't finish",
								"text-tint-amber",
							];
	return (
		<span
			className={cn(
				"inline-flex min-w-0 items-center gap-1 text-muted-foreground text-xs",
				tone,
				className,
			)}
			data-testid="video-status"
			title={text}
		>
			<span className={cn(icon, "size-3.5 shrink-0")} aria-hidden="true" />
			<span className="truncate">{text}</span>
		</span>
	);
}
