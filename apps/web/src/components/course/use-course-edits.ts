import { useMutation } from "@apollo/client/react";
import { toast } from "@ekra/ui/lib/toast";
import {
	ADD_LESSON,
	ADD_SECTION,
	type AddLessonData,
	COURSE,
	DELETE_LESSON,
	DELETE_SECTION,
	type LessonKind,
	MOVE_LESSON,
	MOVE_SECTION,
	RENAME_LESSON,
	RENAME_SECTION,
} from "@/graphql/course";
import { UPDATE_CONTENT } from "@/graphql/library";

/** The course builder's changes: each refreshes the outline, a failure says so in a toast. */
export function useCourseEdits(slug: string, courseId: string) {
	const options = {
		refetchQueries: [{ query: COURSE, variables: { slug, id: courseId } }],
		awaitRefetchQueries: true,
	};
	const [addSection] = useMutation<{ addSection: { id: string } }>(
		ADD_SECTION,
		options,
	);
	const [renameSection] = useMutation(RENAME_SECTION);
	const [deleteSection] = useMutation(DELETE_SECTION, options);
	const [moveSection] = useMutation(MOVE_SECTION, options);
	const [addLesson] = useMutation<AddLessonData>(ADD_LESSON, options);
	const [renameLesson] = useMutation(RENAME_LESSON);
	const [deleteLesson] = useMutation(DELETE_LESSON, options);
	const [moveLesson] = useMutation(MOVE_LESSON, options);
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
		addSection: async (title: string) =>
			(
				await run(
					"add the section",
					addSection({ variables: { slug, courseId, title } }),
				)
			)?.data?.addSection.id ?? null,
		renameSection: (id: string, title: string) =>
			run(
				"rename the section",
				renameSection({
					variables: { slug, id, title },
					optimisticResponse: {
						renameSection: { __typename: "CourseSection", id, title },
					},
				}),
			),
		deleteSection: (id: string) =>
			run("delete the section", deleteSection({ variables: { slug, id } })),
		moveSection: (id: string, position: number) =>
			run(
				"move the section",
				moveSection({ variables: { slug, id, position } }),
			),
		addLesson: async (
			sectionId: string,
			kind: LessonKind,
			title: string,
			quizId?: string,
		) =>
			(
				await run(
					"add the lesson",
					addLesson({ variables: { slug, sectionId, kind, title, quizId } }),
				)
			)?.data?.addLesson.id ?? null,
		setSequential: (sequential: boolean) =>
			run(
				"change the lesson order",
				updateContent({
					variables: { slug, id: courseId, input: { sequential } },
				}),
			),
		renameLesson: (id: string, title: string) =>
			run(
				"rename the lesson",
				renameLesson({
					variables: { slug, id, title },
					optimisticResponse: {
						renameLesson: { __typename: "Lesson", id, title },
					},
				}),
			),
		deleteLesson: (id: string) =>
			run("delete the lesson", deleteLesson({ variables: { slug, id } })),
		moveLesson: (id: string, sectionId: string, position: number) =>
			run(
				"move the lesson",
				moveLesson({ variables: { slug, id, sectionId, position } }),
			),
	};
}

export type CourseEdits = ReturnType<typeof useCourseEdits>;
