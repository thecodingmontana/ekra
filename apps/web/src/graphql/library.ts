import { gql } from "@apollo/client";

export type ContentKind =
	| "folder"
	| "page"
	| "course"
	| "quiz"
	| "assignment"
	| "path"
	| "wiki";

export type ContentItem = {
	id: string;
	kind: ContentKind;
	title: string;
	description: string | null;
	status: "draft" | "published";
	isTemplate: boolean;
	parentId: string | null;
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
	author: { id: string; name: string; image: string | null } | null;
	isFavorite: boolean;
	viewedAt: string | null;
	/** categories */
	tags: string[];
	/** a picture address (/api/media/…) for cards */
	cover: string | null;
};

export const ITEM = gql`
	fragment ContentItemFields on ContentItem {
		id
		kind
		title
		description
		status
		isTemplate
		parentId
		archivedAt
		createdAt
		updatedAt
		author {
			id
			name
			image
		}
		isFavorite
		viewedAt
		tags
		cover
	}
`;

/** The organization's library; archived content when `archived` is true. */
export const LIBRARY = gql`
	query Library($slug: String!, $archived: Boolean) {
		library(slug: $slug, archived: $archived) {
			canManage
			items {
				...ContentItemFields
			}
		}
	}
	${ITEM}
`;
export type LibraryData = {
	library: { canManage: boolean; items: ContentItem[] };
};

/** One item with its body; only this query loads bodies, never the library list. */
export const CONTENT = gql`
	query Content($slug: String!, $id: ID!) {
		content(slug: $slug, id: $id) {
			...ContentItemFields
			doc
			bodyUpdatedAt
		}
	}
	${ITEM}
`;
export type ContentDetail = ContentItem & {
	/** Tiptap JSON as text, null until something is written */
	doc: string | null;
	bodyUpdatedAt: string | null;
};
export type ContentData = { content: ContentDetail | null };

export const SAVE_CONTENT_BODY = gql`
	mutation SaveContentBody(
		$slug: String!
		$id: ID!
		$doc: String!
		$baseBodyUpdatedAt: String
	) {
		saveContentBody(
			slug: $slug
			id: $id
			doc: $doc
			baseBodyUpdatedAt: $baseBodyUpdatedAt
		) {
			...ContentItemFields
			bodyUpdatedAt
		}
	}
	${ITEM}
`;
export type SaveContentBodyData = {
	saveContentBody: ContentItem & { bodyUpdatedAt: string | null };
};

export type ContentVersion = {
	id: string;
	title: string;
	/** only from CONTENT_VERSION (one version); null in the list */
	bodyText: string | null;
	author: { id: string; name: string; image: string | null } | null;
	createdAt: string;
	updatedAt: string;
};

export const CONTENT_VERSIONS = gql`
	query ContentVersions($slug: String!, $id: ID!) {
		contentVersions(slug: $slug, id: $id) {
			id
			title
			author {
				id
				name
				image
			}
			createdAt
			updatedAt
		}
	}
`;

/** One version's text, for "what changed" (the list leaves it out: it can be long). */
export const CONTENT_VERSION = gql`
	query ContentVersion($slug: String!, $id: ID!, $versionId: ID!) {
		contentVersion(slug: $slug, id: $id, versionId: $versionId) {
			id
			bodyText
		}
	}
`;
export type ContentVersionData = {
	contentVersion: { id: string; bodyText: string | null } | null;
};
export type ContentVersionsData = { contentVersions: ContentVersion[] };

export const RESTORE_CONTENT_VERSION = gql`
	mutation RestoreContentVersion($slug: String!, $id: ID!, $versionId: ID!) {
		restoreContentVersion(slug: $slug, id: $id, versionId: $versionId) {
			...ContentItemFields
			doc
			bodyUpdatedAt
		}
	}
	${ITEM}
`;

export const CREATE_CONTENT = gql`
	mutation CreateContent($slug: String!, $input: CreateContentInput!) {
		createContent(slug: $slug, input: $input) {
			...ContentItemFields
		}
	}
	${ITEM}
`;

export const UPDATE_CONTENT = gql`
	mutation UpdateContent($slug: String!, $id: ID!, $input: UpdateContentInput!) {
		updateContent(slug: $slug, id: $id, input: $input) {
			...ContentItemFields
		}
	}
	${ITEM}
`;

export const ARCHIVE_CONTENT = gql`
	mutation ArchiveContent($slug: String!, $id: ID!, $archived: Boolean!) {
		archiveContent(slug: $slug, id: $id, archived: $archived) {
			...ContentItemFields
		}
	}
	${ITEM}
`;

export const DELETE_CONTENT = gql`
	mutation DeleteContent($slug: String!, $id: ID!) {
		deleteContent(slug: $slug, id: $id)
	}
`;

export const DUPLICATE_CONTENT = gql`
	mutation DuplicateContent($slug: String!, $id: ID!) {
		duplicateContent(slug: $slug, id: $id) {
			...ContentItemFields
		}
	}
	${ITEM}
`;

export const FAVORITE_CONTENT = gql`
	mutation FavoriteContent($slug: String!, $id: ID!, $favorite: Boolean!) {
		favoriteContent(slug: $slug, id: $id, favorite: $favorite) {
			id
			isFavorite
		}
	}
`;

export const VIEW_CONTENT = gql`
	mutation ViewContent($slug: String!, $id: ID!) {
		viewContent(slug: $slug, id: $id)
	}
`;
