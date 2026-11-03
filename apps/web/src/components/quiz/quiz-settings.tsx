import { useMutation } from "@apollo/client/react";
import { Input } from "@ekra/ui/components/input";
import { Modal, ModalBody } from "@ekra/ui/components/modal";
import { toast } from "@ekra/ui/lib/toast";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type QuizSettings, UPDATE_QUIZ_SETTINGS } from "@/graphql/quiz";
import { Segmented, TEXTAREA, Toggle } from "./controls";

type NumberKey =
	| "passPercent"
	| "timeLimitSeconds"
	| "maxAttempts"
	| "poolSize";

/** The quiz's rules and result screen; each change saves right away. */
export function QuizSettingsModal({
	slug,
	id,
	settings,
	questionCount,
	open,
	onOpenChange,
}: {
	slug: string;
	id: string;
	settings: QuizSettings;
	questionCount: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [draft, setDraft] = useState(settings);
	// changes made in one go (a blur, then a click) build on each other
	const latest = useRef(settings);
	const [update] = useMutation(UPDATE_QUIZ_SETTINGS);
	// start from what's saved each time it opens
	// biome-ignore lint/correctness/useExhaustiveDependencies: only on opening
	useEffect(() => {
		if (!open) return;
		latest.current = settings;
		setDraft(settings);
	}, [open]);

	const save = async (patch: Partial<QuizSettings>) => {
		const next = { ...latest.current, ...patch };
		latest.current = next;
		setDraft(next);
		const { __typename: _t, ...input } = next as QuizSettings & {
			__typename?: string;
		};
		try {
			await update({
				variables: {
					slug,
					id,
					input: {
						...input,
						passMessage: input.passMessage?.trim() || null,
						failMessage: input.failMessage?.trim() || null,
					},
				},
			});
		} catch (e) {
			toast.error("Couldn't save the settings", { desc: (e as Error).message });
			latest.current = settings;
			setDraft(settings);
		}
	};

	const number = (
		key: NumberKey,
		label: string,
		unit: string,
		min: number,
		max: number,
		scale = 1,
	) => {
		const on = draft[key] != null;
		return (
			<span className="flex items-center gap-2">
				{on && (
					<span className="flex items-center gap-1.5 text-muted-foreground text-sm">
						<Input
							type="number"
							min={min}
							max={max}
							defaultValue={Math.round((draft[key] ?? 0) / scale)}
							key={`${key}-${draft[key]}`}
							onBlur={(e) => {
								const n = Math.round(Number(e.target.value));
								const v = Math.min(max, Math.max(min, n || min)) * scale;
								if (v !== draft[key]) void save({ [key]: v });
							}}
							aria-label={label}
							className="h-7 w-20"
							data-testid={`setting-${key}`}
						/>
						{unit}
					</span>
				)}
				<Toggle
					label={label}
					checked={on}
					onChange={(v) => void save({ [key]: v ? min * scale : null })}
					testId={`toggle-${key}`}
				/>
			</span>
		);
	};

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title="Quiz settings"
			sub="Changes save as you make them and apply to attempts started after."
			size="lg"
		>
			<ModalBody className="gap-0 pt-1">
				<Group title="Grading">
					<Row
						t="Pass mark"
						d="The score needed to pass. Passing completes the course lessons that use this quiz."
					>
						{number("passPercent", "Pass mark", "%", 1, 100)}
					</Row>
					<Row
						t="Time limit"
						d="When time runs out, the attempt is handed in as it is."
					>
						{number("timeLimitSeconds", "Time limit", "min", 1, 24 * 60, 60)}
					</Row>
					<Row t="Attempts" d="How many times each person can take it.">
						{number("maxAttempts", "Attempts", "tries", 1, 100)}
					</Row>
					<Row
						t="Random questions"
						d={`Each attempt asks this many questions picked at random from the ${questionCount}.`}
					>
						{number("poolSize", "Random questions", "questions", 1, 500)}
					</Row>
				</Group>
				<Group title="Order">
					<Row t="Shuffle questions" d="Every attempt gets its own order.">
						<Toggle
							label="Shuffle questions"
							checked={draft.shuffleQuestions}
							onChange={(shuffleQuestions) => void save({ shuffleQuestions })}
							testId="toggle-shuffleQuestions"
						/>
					</Row>
					<Row
						t="Shuffle choices"
						d="Multiple choice options appear in a different order."
					>
						<Toggle
							label="Shuffle choices"
							checked={draft.shuffleOptions}
							onChange={(shuffleOptions) => void save({ shuffleOptions })}
							testId="toggle-shuffleOptions"
						/>
					</Row>
				</Group>
				<Group title="Answers">
					<div className="flex flex-col gap-2 py-3.5">
						<div className="font-medium">Show the right answers</div>
						<Segmented
							label="Show the right answers"
							value={draft.showAnswers}
							onChange={(showAnswers) => void save({ showAnswers })}
							options={[
								["never", "Never"],
								["after_each", "After each question"],
								["at_end", "At the end"],
							]}
						/>
						<p className="m-0 text-muted-foreground text-sm">
							{draft.showAnswers === "after_each"
								? "Learners see if they're right as they answer; each answer then locks."
								: draft.showAnswers === "at_end"
									? "Learners see the right answers and explanations on the result screen."
									: "Learners only see their score and which questions they got right."}
						</p>
					</div>
				</Group>
				<Group title="Result screen">
					<Message
						label="When they pass"
						value={draft.passMessage}
						onSave={(passMessage) => void save({ passMessage })}
						placeholder="Well done! You've got the basics down."
						testId="pass-message"
					/>
					<Message
						label="When they don't"
						value={draft.failMessage}
						onSave={(failMessage) => void save({ failMessage })}
						placeholder="Not quite. Look back over the lessons and try again."
						testId="fail-message"
					/>
				</Group>
			</ModalBody>
		</Modal>
	);
}

function Group({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="mt-3 first:mt-0">
			<h3 className="m-0 pt-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
				{title}
			</h3>
			{children}
		</section>
	);
}

function Row({
	t,
	d,
	children,
}: {
	t: string;
	d: string;
	children: ReactNode;
}) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-border/70 border-b py-3 last:border-b-0">
			<div className="min-w-0">
				<div className="font-medium">{t}</div>
				<div className="mt-0.5 text-muted-foreground text-sm">{d}</div>
			</div>
			{children}
		</div>
	);
}

function Message({
	label,
	value,
	onSave,
	placeholder,
	testId,
}: {
	label: string;
	value: string | null;
	onSave: (value: string | null) => void;
	placeholder: string;
	testId: string;
}) {
	return (
		<label className="flex flex-col gap-1.5 py-2.5">
			<span className="font-medium text-sm">{label}</span>
			<textarea
				defaultValue={value ?? ""}
				onBlur={(e) => {
					const v = e.target.value.trim() || null;
					if (v !== value) onSave(v);
				}}
				rows={2}
				maxLength={500}
				placeholder={placeholder}
				className={TEXTAREA}
				data-testid={testId}
			/>
		</label>
	);
}
