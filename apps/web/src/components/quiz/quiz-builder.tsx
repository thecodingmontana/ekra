import { useMutation, useQuery } from "@apollo/client/react";
import { Button } from "@ekra/ui/components/button";
import { ConfirmModal } from "@ekra/ui/components/modal";
import { toast } from "@ekra/ui/lib/toast";
import { useState } from "react";
import {
	ADD_QUESTION,
	DELETE_QUESTION,
	MOVE_QUESTION,
	QUIZ_EDITOR,
	type QuizEditorData,
	type QuizQuestion,
} from "@/graphql/quiz";
import { type QuestionKind, starterPayload } from "@/lib/quiz-builder";
import { QuestionEditor } from "./question-editor";
import { QuestionList } from "./question-list";
import { QuizSettingsModal } from "./quiz-settings";

/** The trainer's quiz builder: the questions on the side, the selected one's editor, and the quiz's settings. */
export function QuizBuilder({ slug, id }: { slug: string; id: string }) {
	const { data, error } = useQuery<QuizEditorData>(QUIZ_EDITOR, {
		variables: { slug, id },
	});
	const refetch = {
		refetchQueries: [{ query: QUIZ_EDITOR, variables: { slug, id } }],
		awaitRefetchQueries: true,
	};
	const [add] = useMutation<{ addQuestion: QuizQuestion }>(
		ADD_QUESTION,
		refetch,
	);
	const [remove] = useMutation(DELETE_QUESTION, refetch);
	const [move] = useMutation(MOVE_QUESTION, refetch);
	const [picked, setPicked] = useState<string | null>(null);
	const [doomed, setDoomed] = useState<QuizQuestion | null>(null);
	const [settings, setSettings] = useState(false);

	const editor = data?.quizEditor;
	if (error)
		return (
			<p role="alert" className="m-0 text-destructive text-sm">
				Couldn't load the quiz: {error.message}
			</p>
		);
	if (!editor) return null;
	const questions = editor.questions;
	const total = questions.reduce((s, q) => s + q.points, 0);
	const selected = questions.find((q) => q.id === picked) ?? questions[0];

	const addQuestion = async (kind: QuestionKind, image?: string) => {
		try {
			const res = await add({
				variables: {
					slug,
					quizId: id,
					input: {
						kind,
						prompt:
							kind === "hotspot"
								? "Click the right place on the picture."
								: "Untitled question",
						image: null,
						payload: JSON.stringify(starterPayload(kind, image)),
						points: 1,
						required: false,
						explanation: null,
					},
				},
			});
			if (res.data) setPicked(res.data.addQuestion.id);
		} catch (e) {
			toast.error("Couldn't add the question", { desc: (e as Error).message });
		}
	};
	const moveQuestion = async (q: QuizQuestion, position: number) => {
		try {
			await move({ variables: { slug, id: q.id, position } });
		} catch (e) {
			toast.error("Couldn't move the question", { desc: (e as Error).message });
		}
	};

	return (
		<div className="flex flex-col gap-4" data-testid="quiz-builder">
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-muted-foreground text-sm">
					{questions.length} {questions.length === 1 ? "question" : "questions"}
					{" · "}
					{total} {total === 1 ? "point" : "points"}
				</span>
				<Button
					variant="outline"
					className="ml-auto"
					onClick={() => setSettings(true)}
					data-testid="quiz-settings"
				>
					<span
						className="icon-[solar--settings-linear] size-3.5"
						aria-hidden="true"
					/>
					Settings
				</Button>
			</div>
			<div className="grid items-start gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
				<QuestionList
					slug={slug}
					questions={questions}
					selectedId={selected?.id ?? null}
					onSelect={setPicked}
					onAdd={addQuestion}
					onMove={moveQuestion}
					onDelete={setDoomed}
					onSettings={() => setSettings(true)}
				/>
				{selected ? (
					<QuestionEditor
						key={selected.id}
						slug={slug}
						question={selected}
						number={questions.indexOf(selected) + 1}
						onDelete={() => setDoomed(selected)}
					/>
				) : (
					<div className="flex flex-col items-center gap-1.5 rounded-[10px] border border-dashed px-6 py-14 text-center">
						<span
							className="icon-[solar--checklist-minimalistic-linear] mb-1 size-[22px] text-muted-foreground/70"
							aria-hidden="true"
						/>
						<h3 className="m-0 font-semibold text-md">
							Add the first question
						</h3>
						<p className="m-0 max-w-[380px] text-muted-foreground text-sm">
							Multiple choice, fill in the blank, or a hotspot on a picture.
							Each change saves as you go.
						</p>
					</div>
				)}
			</div>
			<ConfirmModal
				open={!!doomed}
				onOpenChange={(o) => !o && setDoomed(null)}
				danger
				title="Delete this question?"
				body="It's taken out of the quiz. Attempts already handed in keep their scores."
				ok="Delete question"
				onConfirm={async () => {
					if (!doomed) return;
					try {
						await remove({ variables: { slug, id: doomed.id } });
					} catch (e) {
						toast.error("Couldn't delete the question", {
							desc: (e as Error).message,
						});
						throw e;
					}
				}}
			/>
			<QuizSettingsModal
				slug={slug}
				id={id}
				settings={editor.settings}
				questionCount={questions.length}
				open={settings}
				onOpenChange={setSettings}
			/>
		</div>
	);
}
