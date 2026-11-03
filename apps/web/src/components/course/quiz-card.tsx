import { useQuery } from "@apollo/client/react";
import { buttonVariants } from "@ekra/ui/components/button";
import { cn } from "@ekra/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { KindIcon } from "@/components/library/bits";
import { CONTENT, type ContentData } from "@/graphql/library";

/** A quiz lesson's quiz: its title, whether it's passed, and the way to it. */
export function QuizCard({
	slug,
	quizId,
	completed,
	forManager,
}: {
	slug: string;
	quizId: string | null;
	completed: boolean;
	/** trainers see "Open the quiz" instead of taking it */
	forManager?: boolean;
}) {
	const { data, loading } = useQuery<ContentData>(CONTENT, {
		variables: { slug, id: quizId ?? "" },
		skip: !quizId,
	});
	const quiz = data?.content;
	return (
		<div
			className="flex flex-wrap items-center gap-3.5 rounded-[10px] border bg-card px-4 py-4"
			data-testid="quiz-card"
		>
			<KindIcon kind="quiz" size={40} decorative />
			<div className="min-w-0 flex-1">
				<p className="m-0 font-semibold">
					{quiz?.title ??
						(loading ? "Loading quiz…" : "This quiz isn't available")}
				</p>
				<p
					className={cn(
						"m-0 text-sm",
						completed ? "text-brand" : "text-muted-foreground",
					)}
				>
					{forManager
						? "Learners finish this lesson by passing the quiz."
						: completed
							? "Passed: this lesson is done."
							: "Pass the quiz to finish this lesson."}
				</p>
			</div>
			{quiz && (
				<Link
					to="/o/$slug/library/$id"
					params={{ slug, id: quiz.id }}
					className={buttonVariants(
						completed || forManager ? { variant: "outline" } : undefined,
					)}
					data-testid="take-quiz"
				>
					{forManager
						? "Open the quiz"
						: completed
							? "Review the quiz"
							: "Take the quiz"}
					<span
						className="icon-[solar--arrow-right-linear] size-3.5"
						aria-hidden="true"
					/>
				</Link>
			)}
		</div>
	);
}
