import { gql } from "@apollo/client";
import { type ContentItem, ITEM } from "./library.ts";

export type PathStep = {
	id: string;
	position: number;
	content: ContentItem;
	/** your progress on the item, in percent */
	percent: number;
	/** in a path taken in order: the steps before it aren't all done (never for those who manage it) */
	locked: boolean;
};

export type PathStage = {
	id: string;
	title: string;
	position: number;
	steps: PathStep[];
};

export type LearningPath = {
	id: string;
	title: string;
	/** steps are taken in order: each opens when the ones before are done */
	sequential: boolean;
	stages: PathStage[];
	/** the path's progress for you, in percent */
	percent: number;
};

/** A path's stages and steps with your progress. */
export const PATH = gql`
	query Path($slug: String!, $id: ID!) {
		path(slug: $slug, id: $id) {
			id
			title
			sequential
			percent
			stages {
				id
				title
				position
				steps {
					id
					position
					percent
					locked
					content {
						...ContentItemFields
					}
				}
			}
		}
	}
	${ITEM}
`;
export type PathData = { path: LearningPath | null };

export const ADD_STAGE = gql`
	mutation AddStage($slug: String!, $pathId: ID!, $title: String!) {
		addStage(slug: $slug, pathId: $pathId, title: $title) {
			id
		}
	}
`;
export type AddStageData = { addStage: { id: string } };

export const RENAME_STAGE = gql`
	mutation RenameStage($slug: String!, $id: ID!, $title: String!) {
		renameStage(slug: $slug, id: $id, title: $title) {
			id
			title
		}
	}
`;

export const DELETE_STAGE = gql`
	mutation DeleteStage($slug: String!, $id: ID!) {
		deleteStage(slug: $slug, id: $id)
	}
`;

export const ADD_STEP = gql`
	mutation AddStep($slug: String!, $stageId: ID!, $contentId: ID!) {
		addStep(slug: $slug, stageId: $stageId, contentId: $contentId) {
			id
		}
	}
`;

export const REMOVE_STEP = gql`
	mutation RemoveStep($slug: String!, $id: ID!) {
		removeStep(slug: $slug, id: $id)
	}
`;

export const MOVE_STEP = gql`
	mutation MoveStep($slug: String!, $id: ID!, $stageId: ID!, $position: Int!) {
		moveStep(slug: $slug, id: $id, stageId: $stageId, position: $position)
	}
`;
