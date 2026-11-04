import { gql } from "@apollo/client";
import type { QuestionKind } from "@/lib/quiz-builder";

export type ShowAnswers = "never" | "after_each" | "at_end";

export type QuizSettings = {
	passPercent: number | null;
	timeLimitSeconds: number | null;
	maxAttempts: number | null;
	poolSize: number | null;
	shuffleQuestions: boolean;
	shuffleOptions: boolean;
	showAnswers: ShowAnswers;
	passMessage: string | null;
	failMessage: string | null;
};

export type QuizQuestion = {
	id: string;
	position: number;
	kind: QuestionKind;
	prompt: string;
	image: string | null;
	/** JSON: the choices, blanks or areas with their right answers */
	payload: string;
	points: number;
	required: boolean;
	explanation: string | null;
};

const SETTINGS = gql`
	fragment QuizSettingsFields on QuizSettings {
		passPercent
		timeLimitSeconds
		maxAttempts
		poolSize
		shuffleQuestions
		shuffleOptions
		showAnswers
		passMessage
		failMessage
	}
`;

const QUESTION = gql`
	fragment QuizQuestionFields on QuizQuestion {
		id
		position
		kind
		prompt
		image
		payload
		points
		required
		explanation
	}
`;

export const QUIZ_EDITOR = gql`
	query QuizEditor($slug: String!, $id: ID!) {
		quizEditor(slug: $slug, id: $id) {
			id
			settings {
				...QuizSettingsFields
			}
			questions {
				...QuizQuestionFields
			}
		}
	}
	${SETTINGS}
	${QUESTION}
`;
export type QuizEditorData = {
	quizEditor: {
		id: string;
		settings: QuizSettings;
		questions: QuizQuestion[];
	} | null;
};

export const UPDATE_QUIZ_SETTINGS = gql`
	mutation UpdateQuizSettings(
		$slug: String!
		$id: ID!
		$input: QuizSettingsInput!
	) {
		updateQuizSettings(slug: $slug, id: $id, input: $input) {
			id
			settings {
				...QuizSettingsFields
			}
		}
	}
	${SETTINGS}
`;

export type QuestionInput = {
	kind: QuestionKind;
	prompt: string;
	image: string | null;
	payload: string;
	points: number;
	required: boolean;
	explanation: string | null;
};

export const ADD_QUESTION = gql`
	mutation AddQuestion($slug: String!, $quizId: ID!, $input: QuestionInput!) {
		addQuestion(slug: $slug, quizId: $quizId, input: $input) {
			...QuizQuestionFields
		}
	}
	${QUESTION}
`;

export const UPDATE_QUESTION = gql`
	mutation UpdateQuestion($slug: String!, $id: ID!, $input: QuestionInput!) {
		updateQuestion(slug: $slug, id: $id, input: $input) {
			...QuizQuestionFields
		}
	}
	${QUESTION}
`;

export const DELETE_QUESTION = gql`
	mutation DeleteQuestion($slug: String!, $id: ID!) {
		deleteQuestion(slug: $slug, id: $id)
	}
`;

export const MOVE_QUESTION = gql`
	mutation MoveQuestion($slug: String!, $id: ID!, $position: Int!) {
		moveQuestion(slug: $slug, id: $id, position: $position)
	}
`;

export type AttemptSummary = {
	id: string;
	startedAt: string;
	submittedAt: string | null;
	score: number | null;
	maxScore: number | null;
	passed: boolean | null;
};

export const QUIZ_OVERVIEW = gql`
	query QuizOverview($slug: String!, $id: ID!) {
		quizOverview(slug: $slug, id: $id) {
			id
			settings {
				...QuizSettingsFields
			}
			questionCount
			attempts {
				id
				startedAt
				submittedAt
				score
				maxScore
				passed
			}
			openAttemptId
			attemptsLeft
		}
	}
	${SETTINGS}
`;
export type QuizOverviewData = {
	quizOverview: {
		id: string;
		settings: QuizSettings;
		questionCount: number;
		attempts: AttemptSummary[];
		openAttemptId: string | null;
		attemptsLeft: number | null;
	} | null;
};

export type AttemptQuestion = {
	id: string;
	kind: QuestionKind;
	prompt: string;
	image: string | null;
	points: number;
	required: boolean;
	/** JSON: what's shown to answer it, without the right answers */
	data: string;
};

export type QuestionReview = {
	questionId: string;
	/** null when the quiz doesn't show answers */
	correct: boolean | null;
	/** JSON, or null when the quiz doesn't show answers */
	correctAnswer: string | null;
	explanation: string | null;
};

export type QuizAttempt = {
	id: string;
	quizId: string;
	startedAt: string;
	deadline: string | null;
	submittedAt: string | null;
	questions: AttemptQuestion[];
	/** JSON: question id → answer */
	answers: string;
	showAnswers: ShowAnswers;
	result: {
		score: number;
		maxScore: number;
		passed: boolean | null;
		message: string | null;
		review: QuestionReview[];
	} | null;
};

const ATTEMPT = gql`
	fragment QuizAttemptFields on QuizAttempt {
		id
		quizId
		startedAt
		deadline
		submittedAt
		questions {
			id
			kind
			prompt
			image
			points
			required
			data
		}
		answers
		showAnswers
		result {
			score
			maxScore
			passed
			message
			review {
				questionId
				correct
				correctAnswer
				explanation
			}
		}
	}
`;

export const QUIZ_ATTEMPT = gql`
	query QuizAttempt($slug: String!, $id: ID!) {
		quizAttempt(slug: $slug, id: $id) {
			...QuizAttemptFields
		}
	}
	${ATTEMPT}
`;

export const START_QUIZ_ATTEMPT = gql`
	mutation StartQuizAttempt($slug: String!, $quizId: ID!) {
		startQuizAttempt(slug: $slug, quizId: $quizId) {
			...QuizAttemptFields
		}
	}
	${ATTEMPT}
`;

export const SAVE_QUIZ_ANSWER = gql`
	mutation SaveQuizAnswer(
		$slug: String!
		$attemptId: ID!
		$questionId: ID!
		$answer: String!
	) {
		saveQuizAnswer(
			slug: $slug
			attemptId: $attemptId
			questionId: $questionId
			answer: $answer
		) {
			saved
			correct
			correctAnswer
			explanation
		}
	}
`;
export type AnswerCheck = {
	saved: boolean;
	correct: boolean | null;
	correctAnswer: string | null;
	explanation: string | null;
};

export const SUBMIT_QUIZ_ATTEMPT = gql`
	mutation SubmitQuizAttempt($slug: String!, $attemptId: ID!) {
		submitQuizAttempt(slug: $slug, attemptId: $attemptId) {
			...QuizAttemptFields
		}
	}
	${ATTEMPT}
`;
