import { Button } from "@ekra/ui/components/button";
import { Input } from "@ekra/ui/components/input";
import { cn } from "@ekra/ui/lib/utils";
import { useState } from "react";
import { choiceId } from "@/lib/quiz-builder";
import { FieldLabel, PictureButton, Toggle } from "./controls";

type Option = { id: string; text?: string; image?: string };
export type ChoicePayload = { options: Option[]; correct: string[] };

/** Multiple choice: the choices (text and/or a picture), which are right, and whether several are. */
export function ChoiceEditor({
	slug,
	value,
	onChange,
}: {
	slug: string;
	value: ChoicePayload;
	onChange: (value: ChoicePayload) => void;
}) {
	const [several, setSeveral] = useState(value.correct.length > 1);
	const setOption = (id: string, patch: Partial<Option>) =>
		onChange({
			...value,
			options: value.options.map((o) => {
				if (o.id !== id) return o;
				const next = { ...o, ...patch };
				// empty fields are left out, so "no text" isn't sent as ""
				if (!next.text) delete next.text;
				if (!next.image) delete next.image;
				return next;
			}),
		});
	const mark = (id: string) => {
		const on = value.correct.includes(id);
		const correct = on
			? value.correct.filter((c) => c !== id)
			: several
				? [...value.correct, id]
				: [id];
		onChange({ ...value, correct });
	};

	return (
		<div>
			<div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
				<FieldLabel hint="Mark the right ones">Choices</FieldLabel>
				<span className="ml-auto flex items-center gap-2 text-muted-foreground text-xs">
					More than one right answer
					<Toggle
						label="More than one right answer"
						checked={several}
						onChange={(on) => {
							setSeveral(on);
							if (!on && value.correct.length > 1)
								onChange({ ...value, correct: value.correct.slice(0, 1) });
						}}
						testId="several-right"
					/>
				</span>
			</div>
			<ul className="m-0 flex list-none flex-col gap-1.5 p-0">
				{value.options.map((o, i) => {
					const right = value.correct.includes(o.id);
					return (
						<li
							key={o.id}
							className={cn(
								"flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors",
								right ? "border-brand/50 bg-brand/6" : "bg-card",
							)}
							data-testid="choice-row"
						>
							<button
								type="button"
								aria-pressed={right}
								aria-label={`Choice ${i + 1} is right`}
								onClick={() => mark(o.id)}
								className={cn(
									"grid size-[18px] shrink-0 place-items-center border-2 transition-colors",
									several ? "rounded-[5px]" : "rounded-full",
									right
										? "border-brand bg-brand text-brand-foreground"
										: "border-input hover:border-muted-foreground",
								)}
								data-testid="mark-right"
							>
								{right && (
									<span
										className="icon-[hugeicons--tick-02] size-3"
										aria-hidden="true"
									/>
								)}
							</button>
							{o.image && (
								<span className="relative shrink-0">
									<img
										src={o.image}
										alt=""
										className="size-12 rounded-md border object-cover"
									/>
									<button
										type="button"
										aria-label={`Remove choice ${i + 1}'s picture`}
										onClick={() => setOption(o.id, { image: undefined })}
										className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-foreground text-background"
									>
										<span
											className="icon-[solar--close-linear] size-2.5"
											aria-hidden="true"
										/>
									</button>
								</span>
							)}
							<Input
								value={o.text ?? ""}
								onChange={(e) => setOption(o.id, { text: e.target.value })}
								placeholder={o.image ? "Caption (optional)" : `Choice ${i + 1}`}
								aria-label={`Choice ${i + 1}`}
								maxLength={500}
								className="h-7 border-transparent bg-transparent px-1.5 shadow-none focus-visible:border-ring"
								data-testid="choice-text"
							/>
							{!o.image && (
								<PictureButton
									slug={slug}
									variant="ghost"
									size="icon-sm"
									className="text-muted-foreground"
									onPicked={(src) => setOption(o.id, { image: src })}
								>
									<span
										className="icon-[solar--gallery-add-linear] size-4"
										aria-hidden="true"
									/>
									<span className="sr-only">
										Add a picture to choice {i + 1}
									</span>
								</PictureButton>
							)}
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Delete choice ${i + 1}`}
								disabled={value.options.length <= 2}
								onClick={() =>
									onChange({
										options: value.options.filter((x) => x.id !== o.id),
										correct: value.correct.filter((c) => c !== o.id),
									})
								}
								className="text-muted-foreground hover:text-destructive"
							>
								<span
									className="icon-[solar--trash-bin-minimalistic-linear] size-4"
									aria-hidden="true"
								/>
							</Button>
						</li>
					);
				})}
			</ul>
			<Button
				variant="outline"
				size="sm"
				className="mt-2"
				disabled={value.options.length >= 12}
				onClick={() =>
					onChange({
						...value,
						options: [...value.options, { id: choiceId(), text: "" }],
					})
				}
				data-testid="add-choice"
			>
				<span
					className="icon-[solar--add-circle-linear] size-3.5"
					aria-hidden="true"
				/>
				Add choice
			</Button>
		</div>
	);
}
