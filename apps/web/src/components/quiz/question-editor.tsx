import { Button } from "@ekra/ui/components/button";
import { Input } from "@ekra/ui/components/input";
import { Spinner } from "@ekra/ui/components/spinner";
import { cn } from "@ekra/ui/lib/utils";
import type { QuizQuestion } from "@/graphql/quiz";
import type { FillBlank } from "@/lib/quiz-builder";
import { BlankEditor } from "./blank-editor";
import { ChoiceEditor, type ChoicePayload } from "./choice-editor";
import {
	FieldLabel,
	KIND_ICON,
	KIND_LABEL,
	PictureButton,
	TEXTAREA,
	Toggle,
} from "./controls";
import { HotspotEditor, type HotspotPayload } from "./hotspot-editor";
import { type SaveState, useQuestionDraft } from "./use-question-draft";

/** The selected question's editor: its prompt, picture, answers (per kind), points, required and explanation. */
export function QuestionEditor({
	slug,
	question,
	number,
	onDelete,
}: {
	slug: string;
	question: QuizQuestion;
	number: number;
	onDelete: () => void;
}) {
	const { draft, change, setPayload, state } = useQuestionDraft(slug, question);
	const kind = question.kind;

	return (
		<article
			className="flex min-w-0 flex-col gap-5 rounded-[10px] border bg-card p-4 sm:p-5"
			data-testid="question-editor"
		>
			<header className="flex flex-wrap items-center gap-2">
				<span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 font-medium text-sm">
					<span
						className={cn(KIND_ICON[kind], "size-3.5")}
						aria-hidden="true"
					/>
					{KIND_LABEL[kind]}
				</span>
				<SaveBadge state={state} />
				<span className="flex-1" />
				<span className="flex items-center gap-2 text-sm">
					Required
					<Toggle
						label="Required"
						checked={draft.required}
						onChange={(required) => change({ required })}
						testId="question-required"
					/>
				</span>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Delete question"
					onClick={onDelete}
					className="text-muted-foreground hover:text-destructive"
					data-testid="delete-question"
				>
					<span
						className="icon-[solar--trash-bin-minimalistic-linear] size-4"
						aria-hidden="true"
					/>
				</Button>
			</header>

			<div>
				<FieldLabel>Question {number}</FieldLabel>
				<textarea
					value={draft.prompt}
					onChange={(e) => change({ prompt: e.target.value })}
					rows={2}
					maxLength={1000}
					placeholder="What do you want to ask?"
					className={cn(TEXTAREA, "font-medium text-[15px] md:text-[15px]")}
					aria-label={`Question ${number}`}
					data-testid="question-prompt"
				/>
				{kind !== "hotspot" && (
					<div className="mt-2 flex items-center gap-2">
						{draft.image ? (
							<span className="relative">
								<img
									src={draft.image}
									alt=""
									className="h-24 max-w-full rounded-md border object-cover"
								/>
								<button
									type="button"
									aria-label="Remove the question's picture"
									onClick={() => change({ image: null })}
									className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background"
								>
									<span
										className="icon-[solar--close-linear] size-3"
										aria-hidden="true"
									/>
								</button>
							</span>
						) : (
							<PictureButton
								slug={slug}
								variant="ghost"
								size="xs"
								className="text-muted-foreground"
								onPicked={(image) => change({ image })}
							>
								<span
									className="icon-[solar--gallery-add-linear] size-3.5"
									aria-hidden="true"
								/>
								Add a picture
							</PictureButton>
						)}
					</div>
				)}
			</div>

			{kind === "multiple_choice" && (
				<ChoiceEditor
					slug={slug}
					value={draft.payload as ChoicePayload}
					onChange={setPayload}
				/>
			)}
			{kind === "fill_blank" && (
				<BlankEditor
					value={draft.payload as FillBlank}
					onChange={(v) => setPayload(v)}
				/>
			)}
			{kind === "hotspot" && (
				<HotspotEditor
					slug={slug}
					value={draft.payload as HotspotPayload}
					onChange={setPayload}
				/>
			)}

			<div className="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
				<div>
					<FieldLabel>Points</FieldLabel>
					<Input
						type="number"
						min={0}
						max={100}
						value={draft.points}
						onChange={(e) =>
							change({
								points: Math.min(
									100,
									Math.max(0, Math.round(Number(e.target.value) || 0)),
								),
							})
						}
						aria-label="Points"
						data-testid="question-points"
					/>
				</div>
				<div>
					<FieldLabel hint="Shown with the right answer, when the quiz shows answers">
						Explanation
					</FieldLabel>
					<textarea
						value={draft.explanation}
						onChange={(e) => change({ explanation: e.target.value })}
						rows={2}
						maxLength={2000}
						placeholder="Why the right answer is right (optional)"
						className={TEXTAREA}
						aria-label="Explanation"
						data-testid="question-explanation"
					/>
				</div>
			</div>
		</article>
	);
}

function SaveBadge({ state }: { state: SaveState }) {
	if (state.at === "invalid" || state.at === "failed")
		return (
			<span
				role="alert"
				className="inline-flex min-w-0 items-center gap-1.5 text-destructive text-xs"
				data-testid="save-problem"
			>
				<span
					className="icon-[solar--danger-circle-linear] size-3.5 shrink-0"
					aria-hidden="true"
				/>
				Not saved: {state.why}
			</span>
		);
	return (
		<span
			className="inline-flex items-center gap-1.5 text-muted-foreground text-xs"
			aria-live="polite"
			data-testid="save-state"
		>
			{state.at === "saved" ? (
				<>
					<span
						className="icon-[solar--check-circle-linear] size-3.5"
						aria-hidden="true"
					/>
					Saved
				</>
			) : (
				<>
					<Spinner className="size-3" />
					Saving…
				</>
			)}
		</span>
	);
}
