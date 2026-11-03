import { Modal, ModalBody } from "@ekra/ui/components/modal";
import { cn } from "@ekra/ui/lib/utils";
import { useState } from "react";
import { type Answer, type MapFilter, quizMap } from "@/lib/quiz-player";

const FILTERS = [
	["all", "All questions", "icon-[solar--list-linear]"],
	["answered", "Answered", "icon-[solar--check-circle-linear]"],
	["unanswered", "Not answered", "icon-[solar--record-linear]"],
	["unsure", "Not sure", "icon-[solar--question-circle-linear]"],
] as const;

/** Every question by number, filtered by answered / not answered / not sure; picking one jumps there. */
export function QuizMap({
	open,
	onOpenChange,
	ids,
	answers,
	unsure,
	current,
	onJump,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	ids: string[];
	answers: Record<string, Answer | undefined>;
	unsure: ReadonlySet<string>;
	current: number;
	onJump: (index: number) => void;
}) {
	const [filter, setFilter] = useState<MapFilter>("all");
	const map = quizMap(ids, answers, unsure);
	const shown = map.pick(filter);

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title="Quiz map"
			sub={`${ids.length} ${ids.length === 1 ? "question" : "questions"}`}
		>
			<ModalBody className="gap-4 pb-5 sm:grid sm:grid-cols-[180px_minmax(0,1fr)]">
				<div role="tablist" aria-label="Show" className="flex flex-col gap-1">
					{FILTERS.map(([f, label, icon]) => (
						<button
							key={f}
							type="button"
							role="tab"
							aria-selected={filter === f}
							onClick={() => setFilter(f)}
							className={cn(
								"flex h-8 items-center gap-2 rounded-md border px-2.5 text-sm transition-colors",
								filter === f
									? "border-brand/60 bg-brand/8 font-medium"
									: "border-transparent hover:bg-muted",
							)}
							data-testid={`map-${f}`}
						>
							<span
								className={cn(icon, "size-3.5 text-muted-foreground")}
								aria-hidden="true"
							/>
							{label}
							<span className="ml-auto rounded bg-muted px-1.5 text-muted-foreground text-xs tabular-nums">
								{map.counts[f]}
							</span>
						</button>
					))}
				</div>
				<div>
					{shown.length === 0 ? (
						<p className="m-0 py-6 text-center text-muted-foreground text-sm">
							No questions here.
						</p>
					) : (
						<ol className="m-0 flex list-none flex-wrap gap-2 p-0">
							{shown.map((q) => (
								<li key={q.id} className="relative">
									<button
										type="button"
										onClick={() => {
											onJump(q.index);
											onOpenChange(false);
										}}
										aria-label={`Question ${q.index + 1}${q.answered ? ", answered" : ""}${q.unsure ? ", not sure" : ""}`}
										aria-current={q.index === current ? "step" : undefined}
										className={cn(
											"grid size-10 place-items-center rounded-full border font-medium text-sm tabular-nums transition-colors",
											q.index === current
												? "border-foreground bg-foreground text-background"
												: q.answered
													? "border-brand/50 bg-brand/15"
													: "bg-card hover:bg-muted",
										)}
										data-testid="map-question"
									>
										{q.index + 1}
									</button>
									{q.unsure && (
										<span
											className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-tint-amber text-[10px] text-white"
											aria-hidden="true"
										>
											?
										</span>
									)}
								</li>
							))}
						</ol>
					)}
				</div>
			</ModalBody>
		</Modal>
	);
}
