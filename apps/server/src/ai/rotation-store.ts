import { aiModel } from "@ekra/db";
import { sql } from "drizzle-orm";
import { log } from "evlog";
import { db } from "../db.ts";
import { FREE_ROUTER, pinnedModel } from "./model.ts";
import {
	COOLDOWN_MS,
	DAILY_LIMIT,
	type Failure,
	type ModelInfo,
	rankModels,
} from "./rotation.ts";

// Which free models the assistant tries, and in what order. The ranking and every cooldown live in Postgres
// (ai_model), so every API process shares them and they survive a restart.

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const RANK_TTL_MS = 6 * 3_600_000;
const DISCOVERY_RETRY_MS = 5 * 60_000;
// the account-wide free limit is kept as a row of its own
export const ACCOUNT_ROW = "*account*";
// per process, which is enough: each one backs off on its own
let discoveryFailedAt = 0;

const nextUtcMidnight = (now = new Date()) =>
	new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
	);

async function discover() {
	const res = await fetch(MODELS_URL, { signal: AbortSignal.timeout(8000) });
	if (!res.ok) throw new Error(`models list answered ${res.status}`);
	const { data } = (await res.json()) as { data: ModelInfo[] };
	const all = new Map(data.map((m) => [m.id, m]));
	const ranked = rankModels(data);
	const now = new Date();
	await db.transaction(async (tx) => {
		await tx
			.update(aiModel)
			.set({ rank: null })
			.where(sql`${aiModel.id} <> ${ACCOUNT_ROW}`);
		for (const [rank, id] of ranked.entries()) {
			const row = {
				rank,
				context: all.get(id)?.context_length ?? null,
				rankedAt: now,
			};
			await tx
				.insert(aiModel)
				.values({ id, ...row })
				.onConflictDoUpdate({ target: aiModel.id, set: row });
		}
	});
	return ranked;
}

/**
 * The models to try for one message, best first, without those cooling down. Null when the shared account is out
 * of free requests (someone's own key isn't held back by that; a busy model is busy for everyone).
 */
export async function candidates(ownKey = false): Promise<string[] | null> {
	const pinned = pinnedModel();
	if (pinned && !ownKey) return [pinned];
	const rows = await db.select().from(aiModel);
	const now = Date.now();
	const cooling = new Set(
		rows
			.filter((r) => r.cooldownUntil && r.cooldownUntil.getTime() > now)
			.map((r) => r.id),
	);
	if (cooling.has(ACCOUNT_ROW) && !ownKey) return null;
	const ranked = rows
		.filter((r) => r.rank !== null && r.id !== ACCOUNT_ROW)
		.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
	const fresh = ranked.some(
		(r) => r.rankedAt && now - r.rankedAt.getTime() < RANK_TTL_MS,
	);
	let ids = ranked.map((r) => r.id);
	// after a failed discovery, wait a while before trying again so messages don't each wait
	if (!fresh && now - discoveryFailedAt > DISCOVERY_RETRY_MS) {
		try {
			ids = await discover();
		} catch (error) {
			discoveryFailedAt = now;
			log.warn({ ai: { discovery: "failed", error: String(error) } });
		}
	}
	// OpenRouter's own free router is always the last resort, even while it's cooling down
	const ready = ids.filter((id) => id !== FREE_ROUTER && !cooling.has(id));
	return [...ready, FREE_ROUTER];
}

export async function recordFailure(
	model: string,
	failure: Failure,
	ownKey = false,
) {
	// a person's own key running out says nothing about the shared account
	if (ownKey && failure.kind === "account_limit") return;
	// a key or credit problem is never retried; it's in the chat's log event
	if (failure.kind === "auth" || failure.kind === "billing") return;
	const account = failure.kind === "account_limit";
	const id = account ? ACCOUNT_ROW : model;
	// the real daily cap lasts until midnight UTC; busy models on every try only pause briefly
	const until =
		account && DAILY_LIMIT.test(failure.message)
			? nextUtcMidnight()
			: new Date(
					Date.now() +
						(account
							? (COOLDOWN_MS.rate_limit ?? 0)
							: (COOLDOWN_MS[failure.kind] ?? COOLDOWN_MS.server ?? 0)),
				);
	const set = {
		cooldownUntil: until,
		lastError: `${failure.kind}: ${failure.message}`.slice(0, 500),
		updatedAt: new Date(),
	};
	await db
		.insert(aiModel)
		.values({ id, ...set, failures: 1 })
		.onConflictDoUpdate({
			target: aiModel.id,
			set: { ...set, failures: sql`${aiModel.failures} + 1` },
		});
}

export async function recordSuccess(model: string, ms: number) {
	await db
		.insert(aiModel)
		.values({ id: model, successes: 1, lastMs: ms })
		.onConflictDoUpdate({
			target: aiModel.id,
			set: {
				successes: sql`${aiModel.successes} + 1`,
				lastMs: ms,
				updatedAt: new Date(),
			},
		});
}
