import { gql } from "@apollo/client";

export type LessonKind = "video" | "page" | "quiz";

export type LessonVideo = {
	id: string;
	/** uploading, processing, ready or failed */
	status: "uploading" | "processing" | "ready" | "failed";
	durationSeconds: number | null;
	/** the HLS master playlist, once ready */
	playlist: string | null;
	poster: string | null;
	error: string | null;
};

export type Lesson = {
	id: string;
	courseId: string;
	sectionId: string;
	kind: LessonKind;
	title: string;
	position: number;
	completed: boolean;
	positionSeconds: number;
	video: LessonVideo | null;
	/** a quiz lesson's quiz (a library item); passing it completes the lesson */
	quizId: string | null;
	/** in a course taken in order: the lessons before it aren't all done yet */
	locked: boolean;
};

export type CourseSection = {
	id: string;
	title: string;
	position: number;
	lessons: Lesson[];
};

export type Course = {
	id: string;
	title: string;
	description: string | null;
	/** lessons are taken in order: each unlocks when the ones before are done */
	sequential: boolean;
	sections: CourseSection[];
	completedCount: number;
	lessonCount: number;
};

const LESSON = gql`
	fragment LessonFields on Lesson {
		id
		courseId
		sectionId
		kind
		title
		position
		completed
		positionSeconds
		quizId
		locked
		video {
			id
			status
			durationSeconds
			playlist
			poster
			error
		}
	}
`;

/** A course's outline with your progress. */
export const COURSE = gql`
	query Course($slug: String!, $id: ID!) {
		course(slug: $slug, id: $id) {
			id
			title
			description
			sequential
			completedCount
			lessonCount
			sections {
				id
				title
				position
				lessons {
					...LessonFields
				}
			}
		}
	}
	${LESSON}
`;
export type CourseData = { course: Course | null };

/** One lesson with its text. */
export const LESSON_QUERY = gql`
	query Lesson($slug: String!, $id: ID!) {
		lesson(slug: $slug, id: $id) {
			...LessonFields
			doc
			bodyUpdatedAt
		}
	}
	${LESSON}
`;
export type LessonDetail = Lesson & {
	doc: string | null;
	bodyUpdatedAt: string | null;
};
export type LessonData = { lesson: LessonDetail | null };

export const ADD_SECTION = gql`
	mutation AddSection($slug: String!, $courseId: ID!, $title: String!) {
		addSection(slug: $slug, courseId: $courseId, title: $title) {
			id
		}
	}
`;

export const RENAME_SECTION = gql`
	mutation RenameSection($slug: String!, $id: ID!, $title: String!) {
		renameSection(slug: $slug, id: $id, title: $title) {
			id
			title
		}
	}
`;

export const DELETE_SECTION = gql`
	mutation DeleteSection($slug: String!, $id: ID!) {
		deleteSection(slug: $slug, id: $id)
	}
`;

export const MOVE_SECTION = gql`
	mutation MoveSection($slug: String!, $id: ID!, $position: Int!) {
		moveSection(slug: $slug, id: $id, position: $position)
	}
`;

export const ADD_LESSON = gql`
	mutation AddLesson(
		$slug: String!
		$sectionId: ID!
		$kind: LessonKind!
		$title: String!
		$quizId: ID
	) {
		addLesson(
			slug: $slug
			sectionId: $sectionId
			kind: $kind
			title: $title
			quizId: $quizId
		) {
			id
		}
	}
`;
export type AddLessonData = { addLesson: { id: string } };

export const RENAME_LESSON = gql`
	mutation RenameLesson($slug: String!, $id: ID!, $title: String!) {
		renameLesson(slug: $slug, id: $id, title: $title) {
			id
			title
		}
	}
`;

export const DELETE_LESSON = gql`
	mutation DeleteLesson($slug: String!, $id: ID!) {
		deleteLesson(slug: $slug, id: $id)
	}
`;

export const MOVE_LESSON = gql`
	mutation MoveLesson(
		$slug: String!
		$id: ID!
		$sectionId: ID!
		$position: Int!
	) {
		moveLesson(slug: $slug, id: $id, sectionId: $sectionId, position: $position)
	}
`;

/** Same variables and answer as saveContentBody, so the body editor saves lessons the same way. */
export const SAVE_LESSON_BODY = gql`
	mutation SaveLessonBody(
		$slug: String!
		$id: ID!
		$doc: String!
		$baseBodyUpdatedAt: String
	) {
		saveLessonBody(
			slug: $slug
			id: $id
			doc: $doc
			baseBodyUpdatedAt: $baseBodyUpdatedAt
		) {
			id
			bodyUpdatedAt
		}
	}
`;

export const COMPLETE_LESSON = gql`
	mutation CompleteLesson($slug: String!, $id: ID!, $complete: Boolean!) {
		completeLesson(slug: $slug, id: $id, complete: $complete) {
			id
			completed
		}
	}
`;

export const SAVE_LESSON_POSITION = gql`
	mutation SaveLessonPosition($slug: String!, $id: ID!, $seconds: Int!) {
		saveLessonPosition(slug: $slug, id: $id, seconds: $seconds)
	}
`;
