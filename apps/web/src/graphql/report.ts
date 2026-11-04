import { gql } from "@apollo/client";
import type { ContentKind } from "@/graphql/library";

export type ReportPerson = {
	id: string;
	name: string;
	image: string | null;
	role: string;
};
export type ReportContent = { id: string; title: string; kind: ContentKind };
export type DayCount = { day: string; count: number };
export type ActivityEvent = {
	at: string;
	person: ReportPerson;
	kind: "started" | "completed" | "passed" | "failed";
	content: ReportContent;
};
export type LearnerRow = {
	person: ReportPerson;
	assigned: number;
	completed: number;
	overdue: number;
	inProgress: number;
	assignedIds: string[];
	percent: number;
	lastOpened: ReportContent | null;
	lastOpenedAt: string | null;
};
export type LearnerReport = {
	totalLearners: number;
	weeklyActive: DayCount[];
	mostActive: { person: ReportPerson; count: number }[];
	recent: ActivityEvent[];
	learners: LearnerRow[];
	assignedContent: ReportContent[];
};
export type LearnerAssignment = {
	content: ReportContent;
	status: "not_started" | "in_progress" | "completed" | "overdue";
	percent: number;
	startAt: string;
	dueAt: string | null;
};
export type LearnerDetail = {
	person: ReportPerson;
	email: string;
	assignments: LearnerAssignment[];
	recent: ActivityEvent[];
};
export type ContentReportRow = {
	content: ReportContent;
	status: string;
	learners: number;
	completed: number;
	percent: number;
	accuracy: number | null;
};
export type ChoiceStat = { label: string; picked: number; right: boolean };
export type QuestionStat = {
	id: string;
	position: number;
	kind: string;
	prompt: string;
	points: number;
	answered: number;
	correct: number;
	choices: ChoiceStat[];
};
export type LearnerResult = {
	person: ReportPerson;
	score: number | null;
	maxScore: number | null;
	passed: boolean | null;
	attempts: number;
	answers: (boolean | null)[];
};
export type QuizReport = {
	content: ReportContent;
	questionCount: number;
	accuracy: number | null;
	completedPercent: number;
	submissions: number;
	averageSeconds: number | null;
	questions: QuestionStat[];
	learners: LearnerResult[];
};

const PERSON = gql`
	fragment ReportPersonFields on ReportPerson {
		id
		name
		image
		role
	}
`;
const CONTENT = gql`
	fragment ReportContentFields on ReportContent {
		id
		title
		kind
	}
`;

/** Learners at a glance: who is active, what they did lately, and how far each one got. */
export const LEARNER_REPORT = gql`
	query LearnerReport($slug: String!) {
		learnerReport(slug: $slug) {
			totalLearners
			weeklyActive {
				day
				count
			}
			mostActive {
				person {
					...ReportPersonFields
				}
				count
			}
			recent {
				at
				kind
				person {
					...ReportPersonFields
				}
				content {
					...ReportContentFields
				}
			}
			learners {
				person {
					...ReportPersonFields
				}
				assigned
				completed
				overdue
				inProgress
				assignedIds
				percent
				lastOpened {
					...ReportContentFields
				}
				lastOpenedAt
			}
			assignedContent {
				...ReportContentFields
			}
		}
	}
	${PERSON}
	${CONTENT}
`;
export type LearnerReportData = { learnerReport: LearnerReport };

/** One person: who they are, what they've been given and what they did lately. */
export const LEARNER_DETAIL = gql`
	query LearnerDetail($slug: String!, $userId: ID!) {
		learnerDetail(slug: $slug, userId: $userId) {
			person {
				...ReportPersonFields
			}
			email
			assignments {
				content {
					...ReportContentFields
				}
				status
				percent
				startAt
				dueAt
			}
			recent {
				at
				kind
				person {
					...ReportPersonFields
				}
				content {
					...ReportContentFields
				}
			}
		}
	}
	${PERSON}
	${CONTENT}
`;
export type LearnerDetailData = { learnerDetail: LearnerDetail | null };

/** Every item of one kind, with how its learners are doing. */
export const CONTENT_REPORT = gql`
	query ContentReport($slug: String!, $kind: ContentKind!) {
		contentReport(slug: $slug, kind: $kind) {
			content {
				...ReportContentFields
			}
			status
			learners
			completed
			percent
			accuracy
		}
	}
	${CONTENT}
`;
export type ContentReportData = { contentReport: ContentReportRow[] };

/** One quiz: how each question went, and each learner's answers. */
export const QUIZ_REPORT = gql`
	query QuizReport($slug: String!, $id: ID!) {
		quizReport(slug: $slug, id: $id) {
			content {
				...ReportContentFields
			}
			questionCount
			accuracy
			completedPercent
			submissions
			averageSeconds
			questions {
				id
				position
				kind
				prompt
				points
				answered
				correct
				choices {
					label
					picked
					right
				}
			}
			learners {
				person {
					...ReportPersonFields
				}
				score
				maxScore
				passed
				attempts
				answers
			}
		}
	}
	${PERSON}
	${CONTENT}
`;
export type QuizReportData = { quizReport: QuizReport | null };
