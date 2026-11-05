import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { AUTH_ISSUER } from "../auth/index.ts";
import { env } from "../env.ts";

// Every model choice for the assistant goes through here. Keys are read on the server only.

/** OpenRouter's Free Models Router: picks a free model that supports what the request needs. */
export const FREE_ROUTER = "openrouter/free";

export const sharedKey = () => env.OPENROUTER_API_KEY ?? null;

/** A model pinned with AI_MODEL turns rotation off. */
export const pinnedModel = () => env.AI_MODEL ?? null;

type ModelId = Parameters<typeof createOpenRouterText>[0];

/**
 * A chat adapter for one model id. The adapter types its model against a fixed list that doesn't include every
 * free model (or openrouter/free), so the id is passed through as-is.
 */
export function adapterFor(model: string, fallbacks: string[], key: string) {
	return createOpenRouterText(model as ModelId, key, {
		httpReferer: AUTH_ISSUER,
		appTitle: "Ekra",
		// OpenRouter's own fallback list: it tries these when the first model fails
		...(fallbacks.length && {
			modelOptions: { models: fallbacks as ModelId[] },
		}),
	});
}
