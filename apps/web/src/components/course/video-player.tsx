import { useEffect, useRef, useState } from "react";

const SAVE_EVERY_MS = 10_000;

/**
 * Plays a lesson's HLS video with hls.js (loaded only here), or natively where Media Source is missing (iPhone).
 * Starts at `startAt`, reports where you are every few seconds, on pause and on leaving (`onPosition`).
 * Remount it (key) for another video.
 */
export function VideoPlayer({
	src,
	poster,
	startAt = 0,
	autoPlay = false,
	onPosition,
	onEnded,
}: {
	src: string;
	poster?: string | null;
	startAt?: number;
	autoPlay?: boolean;
	onPosition?: (seconds: number) => void;
	onEnded?: () => void;
}) {
	const ref = useRef<HTMLVideoElement>(null);
	const [error, setError] = useState<string | null>(null);
	const callbacks = useRef({ onPosition, onEnded });
	callbacks.current = { onPosition, onEnded };

	// biome-ignore lint/correctness/useExhaustiveDependencies: start position and autoplay count once per video
	useEffect(() => {
		const video = ref.current;
		if (!video) return;
		let cancelled = false;
		let destroy = () => {};
		const begin = () => {
			if (startAt > 0 && startAt < video.duration - 2)
				video.currentTime = startAt;
			if (autoPlay) void video.play().catch(() => {});
		};
		video.addEventListener("loadedmetadata", begin, { once: true });
		const failed = () => setError("The video couldn't load. Try again.");
		video.addEventListener("error", failed);
		// hls.js wherever Media Source works; some browsers claim native HLS but can't play every stream
		const mse = "MediaSource" in window || "ManagedMediaSource" in window;
		if (!mse && video.canPlayType("application/vnd.apple.mpegurl"))
			video.src = src;
		else
			void import("hls.js")
				.then(({ default: Hls }) => {
					if (cancelled) return;
					if (!Hls.isSupported())
						return setError("This browser can't play the video.");
					const hls = new Hls();
					hls.on(Hls.Events.ERROR, (_e, data) => {
						if (data.fatal) failed();
					});
					hls.loadSource(src);
					hls.attachMedia(video);
					destroy = () => hls.destroy();
				})
				.catch(() => setError("The video player couldn't load."));
		return () => {
			cancelled = true;
			video.removeEventListener("loadedmetadata", begin);
			video.removeEventListener("error", failed);
			destroy();
		};
	}, [src]);

	// where you are, saved while playing, on pause and when leaving
	useEffect(() => {
		const video = ref.current;
		if (!video) return;
		let last = -1;
		const report = () => {
			const at = Math.floor(video.currentTime);
			if (at === last || !Number.isFinite(at)) return;
			last = at;
			callbacks.current.onPosition?.(at);
		};
		const timer = setInterval(() => {
			if (!video.paused) report();
		}, SAVE_EVERY_MS);
		const ended = () => callbacks.current.onEnded?.();
		video.addEventListener("pause", report);
		video.addEventListener("ended", ended);
		window.addEventListener("pagehide", report);
		return () => {
			clearInterval(timer);
			report();
			video.removeEventListener("pause", report);
			video.removeEventListener("ended", ended);
			window.removeEventListener("pagehide", report);
		};
	}, []);

	return (
		<div className="relative overflow-hidden rounded-[10px] bg-black">
			{/* biome-ignore lint/a11y/useMediaCaption: lesson videos have no caption track yet */}
			<video
				ref={ref}
				controls
				playsInline
				preload="metadata"
				poster={poster ?? undefined}
				className="aspect-video w-full"
				data-testid="video-player"
			/>
			{error && (
				<p
					role="alert"
					className="absolute inset-x-0 bottom-0 m-0 bg-black/70 px-3 py-2 text-sm text-white"
				>
					{error}
				</p>
			)}
		</div>
	);
}
