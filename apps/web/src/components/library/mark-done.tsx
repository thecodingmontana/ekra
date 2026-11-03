import { useMutation, useQuery } from "@apollo/client/react";
import { Button } from "@ekra/ui/components/button";
import { toast } from "@ekra/ui/lib/toast";
import { MARK_DONE, MY_LEARNING, type MyEnrollment } from "@/graphql/learning";

/** "Mark as done" under a page, wiki or assignment a learner reads; done is what their learning says. */
export function MarkDone({
	slug,
	contentId,
}: {
	slug: string;
	contentId: string;
}) {
	const { data } = useQuery<{ myLearning: MyEnrollment[] }>(MY_LEARNING, {
		variables: { slug },
	});
	const [mark, { loading }] = useMutation(MARK_DONE, {
		refetchQueries: [MY_LEARNING],
		awaitRefetchQueries: true,
	});
	const done =
		data?.myLearning.find((e) => e.content.id === contentId)?.status ===
		"completed";

	async function toggle() {
		try {
			await mark({ variables: { slug, contentId, done: !done } });
		} catch (error) {
			toast.error(done ? "Couldn't undo that" : "Couldn't mark it done", {
				desc: error instanceof Error ? error.message : undefined,
			});
		}
	}

	return (
		<div className="mt-8 flex flex-wrap items-center gap-3 border-t pt-5">
			{done ? (
				<>
					<span className="inline-flex items-center gap-1.5 font-medium text-sm">
						<span
							className="icon-[solar--check-circle-bold] size-4 text-tint-green"
							aria-hidden="true"
						/>
						You've finished this
					</span>
					<Button
						variant="ghost"
						size="sm"
						disabled={loading}
						onClick={() => void toggle()}
						data-testid="mark-not-done"
					>
						Mark as not done
					</Button>
				</>
			) : (
				<Button
					disabled={loading || !data}
					onClick={() => void toggle()}
					data-testid="mark-done"
				>
					<span
						className="icon-[solar--check-circle-linear] size-4"
						aria-hidden="true"
					/>
					{loading ? "Saving…" : "Mark as done"}
				</Button>
			)}
		</div>
	);
}
