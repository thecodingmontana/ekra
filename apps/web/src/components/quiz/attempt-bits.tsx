import { cn } from "@ekra/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import type { AnswerCheck } from "@/graphql/quiz";
import { clock } from "@/lib/quiz-player";

/** Time left until `deadline`; calls `onEnd` once when it reaches zero. */
export function Countdown({
	deadline,
	onEnd,
}: {
	deadline: string;
	onEnd: () => void;
}) {
	const end = new Date(deadline).getTime();
	const [now, setNow] = useState(() => Date.now());
	const ended = useRef(false);
	const onEndRef = useRef(onEnd);
	onEndRef.current = onEnd;

	useEffect(() => {
		const tick = () => {
			const t = Date.now();
			setNow(t);
			if (t >= end && !ended.current) {
				ended.current = true;
				onEndRef.current();
			}
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, [end]);

	const left = end - now;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-sm tabular-nums",
				left < 60_000 ? "bg-destructive/10 text-destructive" : "bg-muted",
			)}
			role="timer"
			aria-label={`Time left ${clock(left)}`}
			data-testid="quiz-timer"
		>
			<span
				className="icon-[solar--clock-circle-linear] size-3.5"
				aria-hidden="true"
			/>
			{clock(left)}
		</span>
	);
}

/** Right or wrong, straight after answering (when the quiz shows answers after each question). */
export function CheckPanel({ check }: { check: AnswerCheck }) {
	return (
		<div
			role="status"
			className={cn(
				"mt-5 flex gap-3 rounded-[10px] border px-3.5 py-3",
				check.correct
					? "border-tint-green/40 bg-tint-green/8"
					: "border-destructive/40 bg-destructive/6",
			)}
			data-testid="answer-check"
		>
			<span
				className={cn(
					check.correct
						? "icon-[solar--check-circle-bold] text-tint-green"
						: "icon-[solar--close-circle-bold] text-destructive",
					"mt-0.5 size-5 shrink-0",
				)}
				aria-hidden="true"
			/>
			<div className="min-w-0">
				<p className="m-0 font-semibold">
					{check.correct ? "That's right" : "Not quite"}
				</p>
				{!check.correct && (
					<p className="m-0 mt-0.5 text-muted-foreground text-sm">
						The right answer is marked above.
					</p>
				)}
				{check.explanation && (
					<p className="m-0 mt-1.5 whitespace-pre-line text-sm">
						{check.explanation}
					</p>
				)}
			</div>
		</div>
	);
}
