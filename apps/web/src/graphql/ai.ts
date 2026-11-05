import { gql } from "@apollo/client";

export type AiStatus = {
	ready: boolean;
	ownKey: { hint: string; model: string } | null;
	used: number;
	limit: number;
};

const STATUS_FIELDS = "ready ownKey { hint model } used limit";

/** The assistant's state for you: whether it can answer, your own key's hint and model, messages left today. */
export const AI_STATUS = gql`
	query AiStatus { aiStatus { ${STATUS_FIELDS} } }
`;

export const SET_AI_KEY = gql`
	mutation SetAiKey($key: String!, $model: String) {
		aiStatus: setAiKey(key: $key, model: $model) { ${STATUS_FIELDS} }
	}
`;

export const SET_AI_MODEL = gql`
	mutation SetAiModel($model: String!) {
		aiStatus: setAiModel(model: $model) { ${STATUS_FIELDS} }
	}
`;

export const REMOVE_AI_KEY = gql`
	mutation RemoveAiKey { aiStatus: removeAiKey { ${STATUS_FIELDS} } }
`;

export const CLEAR_AI_CHAT = gql`
	mutation ClearAiChat($slug: String!) { clearAiChat(slug: $slug) }
`;
