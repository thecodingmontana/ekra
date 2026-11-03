import { gql } from "@apollo/client";
import type { EnrollmentStatus } from "@ekra/core";
import { type ContentItem, ITEM } from "./library.ts";

export type MyEnrollment = {
	id: string;
	content: ContentItem;
	startAt: string;
	dueAt: string | null;
	status: EnrollmentStatus;
	percent: number;
};

export type Certificate = {
	id: string;
	contentId: string;
	title: string;
	issuedAt: string;
};

/** What you were given or started, with progress, and the certificates you have. */
export const MY_LEARNING = gql`
	query MyLearning($slug: String!) {
		myLearning(slug: $slug) {
			id
			startAt
			dueAt
			status
			percent
			content {
				...ContentItemFields
			}
		}
		myCertificates(slug: $slug) {
			id
			contentId
			title
			issuedAt
		}
	}
	${ITEM}
`;

/** Start something from the catalog yourself (an assignment you already have stays as it is). */
export const START_LEARNING = gql`
	mutation StartLearning($slug: String!, $contentId: ID!) {
		startLearning(slug: $slug, contentId: $contentId)
	}
`;

/** Mark a page, wiki or assignment done (or not) for yourself. */
export const MARK_DONE = gql`
	mutation MarkDone($slug: String!, $contentId: ID!, $done: Boolean!) {
		markDone(slug: $slug, contentId: $contentId, done: $done)
	}
`;

export const CLAIM_CERTIFICATE = gql`
	mutation ClaimCertificate($slug: String!, $contentId: ID!) {
		claimCertificate(slug: $slug, contentId: $contentId) {
			id
		}
	}
`;
