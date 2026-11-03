import { useMutation } from "@apollo/client/react";
import { toast } from "@ekra/ui/lib/toast";
import { UPDATE_CONTENT } from "@/graphql/library";
import {
	ADD_STAGE,
	ADD_STEP,
	type AddStageData,
	DELETE_STAGE,
	MOVE_STEP,
	PATH,
	REMOVE_STEP,
	RENAME_STAGE,
} from "@/graphql/path";

/** The path builder's changes: each refreshes the path, a failure says so in a toast. */
export function usePathEdits(slug: string, pathId: string) {
	const options = {
		refetchQueries: [{ query: PATH, variables: { slug, id: pathId } }],
		awaitRefetchQueries: true,
	};
	const [addStage] = useMutation<AddStageData>(ADD_STAGE, options);
	const [renameStage] = useMutation(RENAME_STAGE);
	const [deleteStage] = useMutation(DELETE_STAGE, options);
	const [addStep] = useMutation(ADD_STEP, options);
	const [removeStep] = useMutation(REMOVE_STEP, options);
	const [moveStep] = useMutation(MOVE_STEP, options);
	const [updateContent] = useMutation(UPDATE_CONTENT, options);

	const run = async <T>(what: string, p: Promise<T>) => {
		try {
			return await p;
		} catch (error) {
			toast.error(`Couldn't ${what}`, { desc: (error as Error).message });
			return null;
		}
	};

	return {
		addStage: async (title: string) =>
			(
				await run(
					"add the stage",
					addStage({ variables: { slug, pathId, title } }),
				)
			)?.data?.addStage.id ?? null,
		renameStage: (id: string, title: string) =>
			run(
				"rename the stage",
				renameStage({
					variables: { slug, id, title },
					optimisticResponse: {
						renameStage: { __typename: "PathStage", id, title },
					},
				}),
			),
		deleteStage: (id: string) =>
			run("delete the stage", deleteStage({ variables: { slug, id } })),
		addStep: (stageId: string, contentId: string) =>
			run("add it", addStep({ variables: { slug, stageId, contentId } })),
		removeStep: (id: string) =>
			run("remove it", removeStep({ variables: { slug, id } })),
		moveStep: (id: string, stageId: string, position: number) =>
			run("move it", moveStep({ variables: { slug, id, stageId, position } })),
		setSequential: (sequential: boolean) =>
			run(
				"change the order",
				updateContent({
					variables: { slug, id: pathId, input: { sequential } },
				}),
			),
	};
}

export type PathEdits = ReturnType<typeof usePathEdits>;
