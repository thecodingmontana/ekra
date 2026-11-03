import { Button } from "@ekra/ui/components/button";
import { Input } from "@ekra/ui/components/input";
import { toast } from "@ekra/ui/lib/toast";
import { useRef, useState } from "react";
import {
	type FillBlank,
	makeBlank,
	removeBlank,
	sentenceParts,
	withText,
} from "@/lib/quiz-builder";
import { FieldLabel, TEXTAREA } from "./controls";

/** Fill in the blank: the sentence with its blanks, the accepted answers per blank, and extra wrong words. */
export function BlankEditor({
	value,
	onChange,
}: {
	value: FillBlank;
	onChange: (value: FillBlank) => void;
}) {
	const area = useRef<HTMLTextAreaElement>(null);
	const blank = () => {
		const el = area.current;
		const start = el?.selectionStart ?? value.text.length;
		const end = el?.selectionEnd ?? start;
		const next = makeBlank(value, start, end);
		if (!next)
			return toast.error("Can't make a blank there", {
				desc: "Select words outside the blanks you already have.",
			});
		onChange(next);
		el?.focus();
	};
	const setAnswers = (id: string, answers: string[]) =>
		onChange({
			...value,
			blanks: value.blanks.map((b) => (b.id === id ? { ...b, answers } : b)),
		});

	return (
		<div className="flex flex-col gap-4">
			<div>
				<FieldLabel hint="Select words and make them a blank, or put the cursor where one goes">
					Sentence
				</FieldLabel>
				<textarea
					ref={area}
					value={value.text}
					onChange={(e) => onChange(withText(value, e.target.value))}
					rows={3}
					maxLength={2000}
					className={TEXTAREA}
					aria-label="Sentence"
					data-testid="blank-sentence"
				/>
				<div className="mt-2 flex flex-wrap items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						// keep the selection in the sentence
						onMouseDown={(e) => e.preventDefault()}
						onClick={blank}
						data-testid="make-blank"
					>
						<span
							className="icon-[solar--add-square-linear] size-3.5"
							aria-hidden="true"
						/>
						Make a blank
					</Button>
					<span className="text-muted-foreground text-xs">
						Blanks show as {"{{1}}"}, {"{{2}}"}… in the sentence.
					</span>
				</div>
				<p className="m-0 mt-3 rounded-lg bg-muted/60 px-3 py-2.5 text-sm leading-8">
					{sentenceParts(value.text).map((part, i) =>
						"blank" in part ? (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: parts have no ids
								key={i}
								className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-brand/50 bg-brand/10 px-1.5 py-0.5 align-middle font-medium text-[13px] leading-5"
							>
								<span className="text-[10px] text-muted-foreground">
									{part.blank}
								</span>
								{value.blanks.find((b) => b.id === part.blank)?.answers[0] ||
									"…"}
							</span>
						) : (
							// biome-ignore lint/suspicious/noArrayIndexKey: parts have no ids
							<span key={i}>{part.text}</span>
						),
					)}
				</p>
			</div>

			{value.blanks.length > 0 && (
				<div>
					<FieldLabel hint="Every answer listed counts as right; case doesn't matter">
						Right answers
					</FieldLabel>
					<ul className="m-0 flex list-none flex-col gap-2 p-0">
						{value.blanks.map((b) => (
							<li
								key={b.id}
								className="flex items-start gap-2"
								data-testid="blank-row"
							>
								<span className="mt-1 grid size-6 shrink-0 place-items-center rounded-md bg-brand/12 font-semibold text-xs">
									{b.id}
								</span>
								<WordList
									words={b.answers}
									onChange={(answers) => setAnswers(b.id, answers)}
									placeholder={
										b.answers.length ? "Also right…" : "Right answer"
									}
									label={`Right answers for blank ${b.id}`}
								/>
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={`Remove blank ${b.id}`}
									onClick={() => onChange(removeBlank(value, b.id))}
									className="text-muted-foreground hover:text-destructive"
								>
									<span
										className="icon-[solar--trash-bin-minimalistic-linear] size-4"
										aria-hidden="true"
									/>
								</Button>
							</li>
						))}
					</ul>
				</div>
			)}

			<div>
				<FieldLabel hint="Wrong words shown with the right ones">
					Extra wrong options
				</FieldLabel>
				<WordList
					words={value.distractors}
					onChange={(distractors) => onChange({ ...value, distractors })}
					placeholder="Add a wrong option"
					label="Extra wrong options"
					wrong
				/>
			</div>
		</div>
	);
}

/** Words as removable chips, with a field to add one (Enter). */
function WordList({
	words,
	onChange,
	placeholder,
	label,
	wrong,
}: {
	words: string[];
	onChange: (words: string[]) => void;
	placeholder: string;
	label: string;
	wrong?: boolean;
}) {
	const [text, setText] = useState("");
	const add = () => {
		const w = text.trim();
		if (!w || words.length >= 20) return;
		if (!words.some((x) => x.toLowerCase() === w.toLowerCase()))
			onChange([...words, w]);
		setText("");
	};
	return (
		<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
			{words.map((w) => (
				<span
					key={w}
					className={
						wrong
							? "inline-flex h-7 items-center gap-1 rounded-md border bg-card pr-1 pl-2 text-sm"
							: "inline-flex h-7 items-center gap-1 rounded-md border border-brand/50 bg-brand/10 pr-1 pl-2 text-sm"
					}
				>
					{w}
					<button
						type="button"
						aria-label={`Remove ${w}`}
						onClick={() => onChange(words.filter((x) => x !== w))}
						className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground"
					>
						<span
							className="icon-[solar--close-linear] size-3"
							aria-hidden="true"
						/>
					</button>
				</span>
			))}
			<Input
				value={text}
				onChange={(e) => setText(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						add();
					}
				}}
				onBlur={add}
				placeholder={placeholder}
				aria-label={label}
				maxLength={500}
				className="h-7 w-40 min-w-0 flex-1"
				data-testid="word-input"
			/>
		</div>
	);
}
