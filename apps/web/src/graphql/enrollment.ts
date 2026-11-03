import { gql } from "@apollo/client";

export type Member = {
	id: string;
	name: string;
	email: string;
	image: string | null;
	role: string;
};

export type Enrollment = {
	id: string;
	contentId: string;
	user: { id: string; name: string; image: string | null };
	startAt: string;
	dueAt: string | null;
	status: "completed" | "overdue" | "not_started" | "in_progress";
	percent: number;
	remindedAt: string | null;
	remindAgainAt: string | null;
};

const FIELDS = gql`
	fragment EnrollmentFields on Enrollment {
		id
		contentId
		user {
			id
			name
			image
		}
		startAt
		dueAt
		status
		percent
		remindedAt
		remindAgainAt
	}
`;

/** Who has this content, and everyone it could be given to (owners, admins and trainers). */
export const ASSIGNEES = gql`
	query Assignees($slug: String!, $contentId: ID!) {
		enrollments(slug: $slug, contentId: $contentId) {
			...EnrollmentFields
		}
		members(slug: $slug) {
			id
			name
			email
			image
			role
		}
	}
	${FIELDS}
`;
export type AssigneesData = { enrollments: Enrollment[]; members: Member[] };

export const ENROLL = gql`
	mutation Enroll(
		$slug: String!
		$contentId: ID!
		$userIds: [ID!]!
		$startAt: String
		$dueAt: String
	) {
		enroll(
			slug: $slug
			contentId: $contentId
			userIds: $userIds
			startAt: $startAt
			dueAt: $dueAt
		) {
			...EnrollmentFields
		}
	}
	${FIELDS}
`;

export const UPDATE_ENROLLMENTS = gql`
	mutation UpdateEnrollments($slug: String!, $ids: [ID!]!, $dueAt: String) {
		updateEnrollments(slug: $slug, ids: $ids, dueAt: $dueAt) {
			...EnrollmentFields
		}
	}
	${FIELDS}
`;

export const REMOVE_ENROLLMENTS = gql`
	mutation RemoveEnrollments($slug: String!, $ids: [ID!]!) {
		removeEnrollments(slug: $slug, ids: $ids)
	}
`;

export const REMIND_ENROLLMENTS = gql`
	mutation RemindEnrollments(
		$slug: String!
		$ids: [ID!]!
		$kind: ReminderKind!
	) {
		remindEnrollments(slug: $slug, ids: $ids, kind: $kind) {
			sent
			waiting
		}
	}
`;
export type RemindData = {
	remindEnrollments: { sent: number; waiting: number };
};
