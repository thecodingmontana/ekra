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
};

const ITEM = gql`
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

export const CONTENT = gql`
	query Content($slug: String!, $id: ID!) {
		content(slug: $slug, id: $id) {
			...ContentItemFields
		}
	}
	${ITEM}
`;
export type ContentData = { content: ContentItem | null };

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
