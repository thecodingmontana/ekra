import { useState } from "react";
import { Segmented } from "./controls";
import { QuizBuilder } from "./quiz-builder";
import { QuizPlayer } from "./quiz-player";

/** A quiz's content page body: the builder for its trainers (with a preview to take it), the quiz for learners. */
export function QuizPage({
	slug,
	id,
	title,
	canManage,
}: {
	slug: string;
	id: string;
	title: string;
	canManage: boolean;
}) {
	const [preview, setPreview] = useState(false);
	if (!canManage) return <QuizPlayer slug={slug} id={id} title={title} />;
	return (
		<div className="flex flex-col gap-4">
			<Segmented
				label="Mode"
				value={preview}
				onChange={setPreview}
				options={[
					[false, "Build", "icon-[solar--pen-linear]"],
					[true, "Preview", "icon-[solar--play-linear]"],
				]}
			/>
			{preview ? (
				<QuizPlayer slug={slug} id={id} title={title} preview />
			) : (
				<QuizBuilder slug={slug} id={id} />
			)}
		</div>
	);
}
