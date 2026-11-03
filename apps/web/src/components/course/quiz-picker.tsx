import { useQuery } from "@apollo/client/react";
import { Modal, ModalBody } from "@ekra/ui/components/modal";
import { KindIcon, StatusPill } from "@/components/library/bits";
import { type ContentItem, LIBRARY, type LibraryData } from "@/graphql/library";

/** Picks a quiz from the library for a quiz lesson. */
export function QuizPicker({
	slug,
	open,
	onOpenChange,
	onPick,
}: {
	slug: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onPick: (quiz: ContentItem) => void;
}) {
	const { data } = useQuery<LibraryData>(LIBRARY, {
		variables: { slug, archived: false },
		skip: !open,
	});
	const quizzes = (data?.library.items ?? []).filter(
		(i) => i.kind === "quiz" && !i.isTemplate,
	);
	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title="Add a quiz lesson"
			sub="Learners finish the lesson by passing the quiz."
		>
			<ModalBody className="pb-4">
				{data && quizzes.length === 0 && (
					<p className="m-0 py-6 text-center text-muted-foreground text-sm">
						There are no quizzes in the library yet. Create one with New → Quiz,
						then add it here.
					</p>
				)}
				<ul className="m-0 flex list-none flex-col gap-1 p-0">
					{quizzes.map((quiz) => (
						<li key={quiz.id}>
							<button
								type="button"
								className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
								onClick={() => onPick(quiz)}
								data-testid="pick-quiz"
							>
								<KindIcon kind="quiz" decorative />
								<span className="min-w-0 flex-1 truncate font-medium">
									{quiz.title}
								</span>
								<StatusPill item={quiz} />
							</button>
						</li>
					))}
				</ul>
			</ModalBody>
		</Modal>
	);
}
