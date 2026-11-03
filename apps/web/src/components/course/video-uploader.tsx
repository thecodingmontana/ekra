import { useApolloClient } from "@apollo/client/react";
import { Button } from "@ekra/ui/components/button";
import { toast } from "@ekra/ui/lib/toast";
import { useRef } from "react";
import type { Lesson } from "@/graphql/course";
import { percent } from "@/lib/video-upload";
import { cancelUpload, startUpload, useUpload } from "./upload-store";
import { VideoPlayer } from "./video-player";
import { VideoStatus } from "./video-status";

const mb = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MB`;

/** A video lesson's video for its trainers: upload (with progress and cancel), replace, its state, and playing it. */
export function VideoUploader({
	slug,
	lesson,
}: {
	slug: string;
	lesson: Pick<Lesson, "id" | "video">;
}) {
	const client = useApolloClient();
	const input = useRef<HTMLInputElement>(null);
	const upload = useUpload(lesson.id);
	const v = lesson.video;

	const send = (file: File) => {
		const refresh = () => client.refetchQueries({ include: "active" });
		startUpload(slug, lesson.id, file)
			.then(() => {
				toast.success("Video uploaded", {
					desc: "It's being prepared for playback; this takes a moment.",
				});
				return refresh();
			})
			.catch((error: Error) => {
				if (error.name === "AbortError") toast.info("Upload cancelled");
				else toast.error("Couldn't upload the video", { desc: error.message });
				return refresh();
			});
		// the lesson now points at the new video (status "uploading")
		setTimeout(() => void refresh(), 600);
	};

	const picker = (
		<input
			ref={input}
			type="file"
			accept="video/*"
			className="hidden"
			data-testid="video-file"
			onChange={(e) => {
				const file = e.target.files?.[0];
				e.target.value = "";
				if (file) send(file);
			}}
		/>
	);

	if (upload)
		return (
			<div
				className="flex flex-col gap-2.5 rounded-[10px] border bg-card px-4 py-3.5"
				data-testid="video-uploading"
			>
				<div className="flex items-center gap-2 text-sm">
					<span
						className="icon-[solar--upload-linear] size-4 text-tint-blue"
						aria-hidden="true"
					/>
					<span className="min-w-0 flex-1 truncate font-medium">
						{upload.fileName}
					</span>
					<span className="text-muted-foreground tabular-nums">
						{mb(upload.sent)} / {mb(upload.size)}
					</span>
					<Button
						size="sm"
						variant="outline"
						onClick={() => cancelUpload(lesson.id)}
					>
						Cancel
					</Button>
				</div>
				<div
					className="h-1.5 overflow-hidden rounded-full bg-muted"
					role="progressbar"
					aria-label="Upload progress"
					aria-valuenow={percent(upload.sent, upload.size)}
					aria-valuemin={0}
					aria-valuemax={100}
				>
					<div
						className="h-full rounded-full bg-brand transition-[width] duration-300"
						style={{ width: `${percent(upload.sent, upload.size)}%` }}
					/>
				</div>
			</div>
		);

	if (v?.status === "ready" && v.playlist)
		return (
			<div className="flex flex-col gap-2">
				<VideoPlayer key={v.id} src={v.playlist} poster={v.poster} />
				<div className="flex items-center gap-2">
					<VideoStatus lesson={lesson} />
					<Button
						size="sm"
						variant="outline"
						className="ml-auto"
						onClick={() => input.current?.click()}
					>
						Replace video
					</Button>
				</div>
				{picker}
			</div>
		);

	return (
		<div className="flex flex-col items-center gap-2 rounded-[10px] border border-dashed px-6 py-10 text-center">
			<span
				className="icon-[solar--videocamera-record-linear] mb-1 size-[22px] text-muted-foreground/70"
				aria-hidden="true"
			/>
			{v ? (
				<VideoStatus lesson={lesson} className="text-sm" />
			) : (
				<p className="m-0 font-semibold">Add this lesson's video</p>
			)}
			<p className="m-0 max-w-[380px] text-muted-foreground text-sm">
				{v?.status === "processing"
					? "It's being prepared for playback in every size. This page updates when it's ready."
					: "Upload an MP4, MOV or WebM up to 5 GB. It's converted for smooth playback on any connection."}
			</p>
			{v?.status !== "processing" && (
				<Button
					className="mt-2"
					onClick={() => input.current?.click()}
					data-testid="upload-video"
				>
					<span
						className="icon-[solar--upload-linear] size-3.5"
						aria-hidden="true"
					/>
					{v ? "Upload again" : "Upload video"}
				</Button>
			)}
			{picker}
		</div>
	);
}
