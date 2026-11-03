import { cn } from "@ekra/ui/lib/utils";
import { toggleChoice } from "@/lib/quiz-player";

export type ChoiceData = {
	options: { id: string; text?: string; image?: string }[];
	pickCount: number;
};

/** Multiple choice for a learner: pick one (or as many as are right); with `right`, marks the right ones. */
export function AnswerChoice({
	data,
	value,
	onChange,
	locked,
	right,
}: {
	data: ChoiceData;
	value: string[];
	onChange: (value: string[]) => void;
	locked?: boolean;
	/** the right choices, once they may be shown */
	right?: string[];
}) {
	const pictures = data.options.some((o) => o.image);
	const several = data.pickCount > 1;
	return (
		<div>
			<p className="m-0 mb-3 text-muted-foreground text-sm">
				{several ? `Pick ${data.pickCount} answers.` : "Pick one answer."}
			</p>
			<fieldset
				aria-label="Choices"
				className={cn(
					"m-0 grid min-w-0 gap-2 border-0 p-0",
					pictures ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1",
				)}
			>
				{data.options.map((o) => {
					const chosen = value.includes(o.id);
					const isRight = right?.includes(o.id);
					const wrong = right && chosen && !isRight;
					return (
						<button
							key={o.id}
							type="button"
							aria-pressed={chosen}
							disabled={locked}
							onClick={() =>
								onChange(toggleChoice(value, o.id, data.pickCount))
							}
							className={cn(
								"flex items-center gap-3 rounded-[10px] border bg-card p-3 text-left outline-none transition-[border-color,background-color,box-shadow] focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default",
								pictures && "flex-col items-stretch p-2",
								!locked && "hover:border-foreground/25",
								chosen &&
									!right &&
									"border-brand bg-brand/6 shadow-[0_0_0_1px_var(--brand)]",
								isRight && "border-brand bg-brand/8",
								wrong && "border-destructive/60 bg-destructive/6",
							)}
							data-testid="answer-choice"
						>
							{o.image && (
								<img
									src={o.image}
									alt={o.text ?? ""}
									className="aspect-[4/3] w-full rounded-md object-cover"
								/>
							)}
							<span className="flex min-w-0 items-center gap-2.5">
								<span
									className={cn(
										"grid size-[18px] shrink-0 place-items-center border-2",
										several ? "rounded-[5px]" : "rounded-full",
										chosen
											? "border-brand bg-brand text-brand-foreground"
											: "border-input",
										wrong && "border-destructive bg-destructive",
									)}
								>
									{chosen && (
										<span
											className={cn(
												wrong
													? "icon-[solar--close-linear]"
													: "icon-[hugeicons--tick-02]",
												wrong
													? "size-3 text-white"
													: "size-3 text-brand-foreground",
											)}
											aria-hidden="true"
										/>
									)}
								</span>
								{o.text && (
									<span className="min-w-0 text-[15px]">{o.text}</span>
								)}
								{isRight && (
									<span className="ml-auto shrink-0 font-medium text-tint-green text-xs">
										Right answer
									</span>
								)}
							</span>
						</button>
					);
				})}
			</fieldset>
		</div>
	);
}
