import { aiKey } from "@ekra/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	checkKey,
	KEY_PATTERN,
	keyHint,
	MODEL_PATTERN,
	PROVIDER,
	sealKey,
} from "../ai/keys.ts";
import { today, usedOn } from "../ai/limits.ts";
import { sharedKey } from "../ai/model.ts";
import { clearChat } from "../ai/store.ts";
import { db } from "../db.ts";
import { env } from "../env.ts";
import { fixedWindow } from "../rate-limit.ts";
import { type Ctx, parse, refuse } from "./library.ts";
import { orgBySlug } from "./tenant.ts";

// The assistant's settings for the signed-in person: their own OpenRouter key (never sent back, only its last
// characters) and model, the messages left today, and clearing their chat in an organization.

export const aiTypeDefs = /* GraphQL */ `
	type AiStatus {
		"the assistant can answer: the server has a shared key, or you added your own"
		ready: Boolean!
		"your own OpenRouter key, or null when you use the shared one"
		ownKey: AiKey
		"messages used today on the shared key"
		used: Int!
		"messages a day on the shared key"
		limit: Int!
	}

	type AiKey {
		"the key's last characters, e.g. …a1b2 (the key itself is never sent)"
		hint: String!
		"an OpenRouter model id, or empty to rotate free models"
		model: String!
	}

	extend type Query {
		aiStatus: AiStatus!
	}

	extend type Mutation {
		"Checks the key with OpenRouter, then saves it encrypted (replacing one you had)."
		setAiKey(key: String!, model: String): AiStatus!
		"The model your own key uses (empty rotates free models)."
		setAiModel(model: String!): AiStatus!
		removeAiKey: AiStatus!
		"Deletes your chat with the assistant in this organization."
		clearAiChat(slug: String!): Boolean!
	}
`;

// each check calls OpenRouter: a cap keeps the server from being a free tester for leaked keys
const KEY_CHECKS_PER_HOUR = 10;
const keyChecks = fixedWindow(KEY_CHECKS_PER_HOUR, 60 * 60_000);

const model = z
	.string()
	.trim()
	.max(160)
	.refine((m) => m === "" || MODEL_PATTERN.test(m), {
		message: "Use an OpenRouter model id like vendor/model, or leave it empty.",
	});

const me = (ctx: Ctx) =>
	ctx.session?.user.id ?? refuse("Sign in first.", "UNAUTHENTICATED");

async function status(userId: string) {
	const [own] = await db
		.select({ hint: aiKey.hint, model: aiKey.model })
		.from(aiKey)
		.where(and(eq(aiKey.userId, userId), eq(aiKey.provider, PROVIDER)));
	return {
		ready: !!own || !!sharedKey(),
		ownKey: own ?? null,
		used: await usedOn(userId, today()),
		limit: env.AI_DAILY_LIMIT,
	};
}

const mine = (userId: string) =>
	and(eq(aiKey.userId, userId), eq(aiKey.provider, PROVIDER));

export const aiResolvers = {
	Query: {
		aiStatus: (_p: unknown, _a: unknown, ctx: Ctx) => status(me(ctx)),
	},
	Mutation: {
		setAiKey: async (
			_p: unknown,
			args: { key: string; model?: string | null },
			ctx: Ctx,
		) => {
			const userId = me(ctx);
			const key = parse(
				z.string().trim().regex(KEY_PATTERN, {
					message:
						"That doesn't look like an OpenRouter key (it starts with sk-or-).",
				}),
				args.key,
			);
			const chosen = parse(model, args.model ?? "");
			if (keyChecks.hit(userId))
				refuse("Too many key checks. Try again in an hour.", "BAD_USER_INPUT");
			const check = await checkKey(key);
			if (!check.ok) refuse(check.error, "BAD_USER_INPUT");
			const row = {
				cipher: sealKey(key, userId),
				hint: keyHint(key),
				model: chosen,
			};
			await db
				.insert(aiKey)
				.values({ userId, provider: PROVIDER, ...row })
				.onConflictDoUpdate({
					target: [aiKey.userId, aiKey.provider],
					set: row,
				});
			return status(userId);
		},
		setAiModel: async (_p: unknown, args: { model: string }, ctx: Ctx) => {
			const userId = me(ctx);
			await db
				.update(aiKey)
				.set({ model: parse(model, args.model) })
				.where(mine(userId));
			return status(userId);
		},
		removeAiKey: async (_p: unknown, _a: unknown, ctx: Ctx) => {
			const userId = me(ctx);
			await db.delete(aiKey).where(mine(userId));
			return status(userId);
		},
		clearAiChat: async (_p: unknown, { slug }: { slug: string }, ctx: Ctx) => {
			const userId = me(ctx);
			const org = await orgBySlug(ctx, slug);
			await clearChat({ orgId: org.id, userId });
			return true;
		},
	},
};
