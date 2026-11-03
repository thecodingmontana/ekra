import { cn } from "@ekra/ui/lib/utils";
import { useState } from "react";
import { sentenceParts } from "@/lib/quiz-builder";
import { fillBlank, freeTiles } from "@/lib/quiz-player";

export type BlanksData = { text: string; blanks: string[]; tiles: string[] };

/**
 * Fill in the blank for a learner: drag a tile into a blank, or click a tile and then a blank (keyboard and touch).
 * Clicking a filled blank takes its word out again. With `right`, shows the right word under each wrong one.
 */
export function AnswerBlanks({
	data,
	value,
	onChange,
	locked,
	right,
}: {
	data: BlanksData;
	value: Record<string, string>;
	onChange: (value: Record<string, string>) => void;
	locked?: boolean;
	right?: Record<string, string>;
}) {
	const [held, setHeld] = useState<string | null>(null);
	const [over, setOver] = useState<string | null>(null);
	const free = freeTiles(data.tiles, value);
	const place = (blank: string, word: string) => {
		onChange(fillBlank(value, blank, word));
		setHeld(null);
	};

	return (
		<div>
			{!locked && (
				<p className="m-0 mb-3 text-muted-foreground text-sm">
					Drag the words into the blanks, or pick a word and then its blank.
				</p>
			)}
			<p className="m-0 font-medium text-[17px] leading-[2.6]">
				{sentenceParts(data.text).map((part, i) => {
					if (!("blank" in part))
						// biome-ignore lint/suspicious/noArrayIndexKey: parts have no ids
						return <span key={i}>{part.text}</span>;
					const id = part.blank;
					const word = value[id];
					const should = right?.[id];
					const wrong =
						right &&
						word?.trim().toLowerCase() !== should?.trim().toLowerCase();
					return (
						<span
							key={`b${id}`}
							className="inline-flex flex-col align-middle leading-none"
						>
							<button
								type="button"
								disabled={locked}
								aria-label={
									word
										? `Blank ${id}: ${word}. Take it out`
										: `Blank ${id}, empty`
								}
								onClick={() => {
									if (held) place(id, held);
									else if (word) place(id, "");
								}}
								onDragOver={(e) => {
									if (locked) return;
									e.preventDefault();
									setOver(id);
								}}
								onDragLeave={() => setOver(null)}
								onDrop={(e) => {
									e.preventDefault();
									setOver(null);
									const w = e.dataTransfer.getData("text/plain");
									if (w) place(id, w);
								}}
								className={cn(
									"mx-1 inline-flex h-8 min-w-[92px] items-center justify-center rounded-md border px-2.5 font-medium text-[15px] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
									word
										? "border-brand/60 bg-brand/10"
										: "border-input border-dashed bg-muted/60",
									(over === id || (held && !locked)) &&
										"border-brand border-solid",
									right && !wrong && "border-tint-green bg-tint-green/10",
									wrong &&
										"border-destructive/60 bg-destructive/8 line-through decoration-destructive/60",
								)}
								data-testid="blank-slot"
							>
								{word ?? ""}
							</button>
							{wrong && should && (
								<span className="mx-1 mt-1 text-center text-tint-green text-xs">
									{should}
								</span>
							)}
						</span>
					);
				})}
			</p>
			{!locked && (
				<fieldset
					className="m-0 mt-5 flex min-h-9 min-w-0 flex-wrap gap-2 border-0 p-0"
					aria-label="Words to place"
				>
					{free.map((t) => (
						<button
							key={t.index}
							type="button"
							draggable
							aria-pressed={held === t.word}
							onDragStart={(e) => {
								e.dataTransfer.effectAllowed = "move";
								e.dataTransfer.setData("text/plain", t.word);
							}}
							onClick={() => setHeld(held === t.word ? null : t.word)}
							className={cn(
								"inline-flex h-8 cursor-grab items-center gap-1.5 rounded-md border bg-card px-2.5 font-medium text-sm shadow-xs outline-none transition-[border-color,box-shadow,translate] focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing",
								held === t.word &&
									"-translate-y-0.5 border-brand shadow-[0_0_0_1px_var(--brand)]",
							)}
							data-testid="blank-tile"
						>
							<span
								className="icon-[solar--menu-dots-bold] size-3 rotate-90 text-muted-foreground"
								aria-hidden="true"
							/>
							{t.word}
						</button>
					))}
				</fieldset>
			)}
		</div>
	);
}
