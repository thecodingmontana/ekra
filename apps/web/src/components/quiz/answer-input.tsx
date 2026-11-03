import type { AttemptQuestion } from "@/graphql/quiz";
import type { Area, Point } from "@/lib/quiz-builder";
import type { Answer } from "@/lib/quiz-player";
import { AnswerBlanks, type BlanksData } from "./answer-blanks";
import { AnswerChoice, type ChoiceData } from "./answer-choice";
import { AnswerHotspot, type HotspotData } from "./answer-hotspot";

/** Parses a JSON field from the API, or null. */
export function json<T>(text: string | null | undefined): T | null {
	if (!text) return null;
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}

/** A question's prompt and picture, then the way to answer it (per kind). */
export function AnswerInput({
	question,
	value,
	onChange,
	locked,
	right,
}: {
	question: AttemptQuestion;
	value: Answer | undefined;
	onChange: (value: Answer) => void;
	locked?: boolean;
	/** the right answer (JSON from the API) once it may be shown */
	right?: string | null;
}) {
	const data = json<object>(question.data);
	if (!data) return null;
	if (question.kind === "multiple_choice")
		return (
			<AnswerChoice
				data={data as ChoiceData}
				value={Array.isArray(value) ? (value as string[]) : []}
				onChange={onChange}
				locked={locked}
				right={json<string[]>(right) ?? undefined}
			/>
		);
	if (question.kind === "fill_blank")
		return (
			<AnswerBlanks
				data={data as BlanksData}
				value={value && !Array.isArray(value) ? value : {}}
				onChange={onChange}
				locked={locked}
				right={json<Record<string, string>>(right) ?? undefined}
			/>
		);
	return (
		<AnswerHotspot
			data={data as HotspotData}
			value={Array.isArray(value) ? (value as Point[]) : []}
			onChange={onChange}
			locked={locked}
			right={json<Area[]>(right) ?? undefined}
		/>
	);
}
