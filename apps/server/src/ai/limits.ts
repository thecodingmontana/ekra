import { aiUsage } from "@ekra/db";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db.ts";
import { env } from "../env.ts";

// Per-person limits on the shared key, so one person can't use up the account's free requests for everyone.
// People who add their own OpenRouter key aren't limited here. Days are UTC days.

export const today = (now = new Date()) => now.toISOString().slice(0, 10);

/** Messages used on a day on the shared key. */
export async function usedOn(userId: string, day: string) {
	const [row] = await db
		.select({ count: aiUsage.count })
		.from(aiUsage)
		.where(and(eq(aiUsage.userId, userId), eq(aiUsage.day, day)));
	return row?.count ?? 0;
}

/** Counts one message for the day; false when the person has reached the daily limit. */
export async function takeMessage(
	userId: string,
	day: string,
	limit = env.AI_DAILY_LIMIT,
) {
	const rows = await db
		.insert(aiUsage)
		.values({ userId, day, count: 1 })
		.onConflictDoUpdate({
			target: [aiUsage.userId, aiUsage.day],
			set: { count: sql`${aiUsage.count} + 1` },
			// a full day is left as it is, so the check and the count are one atomic step
			setWhere: sql`${aiUsage.count} < ${limit}`,
		})
		.returning({ count: aiUsage.count });
	return rows.length > 0;
}

/** Gives back a message that got no answer (every model failed, or the account was out). */
export async function refundMessage(userId: string, day: string) {
	await db
		.update(aiUsage)
		.set({ count: sql`greatest(${aiUsage.count} - 1, 0)` })
		.where(and(eq(aiUsage.userId, userId), eq(aiUsage.day, day)));
}

/** The text of the newest message, whatever shape the browser sent it in; null unless it's the person's. */
export function lastUserText(messages: unknown[]) {
	const last = messages.at(-1) as
		| {
				role?: string;
				content?: unknown;
				parts?: { type?: string; content?: unknown; text?: unknown }[];
		  }
		| undefined;
	if (last?.role !== "user") return null;
	if (typeof last.content === "string") return last.content;
	const parts = last.parts ?? (Array.isArray(last.content) ? last.content : []);
	return parts
		.map((p: { content?: unknown; text?: unknown }) =>
			typeof p.content === "string"
				? p.content
				: typeof p.text === "string"
					? p.text
					: "",
		)
		.join("");
}
