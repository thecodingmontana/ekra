import { aiChat, aiMessage, withOrg } from "@ekra/db";
import type { ModelMessage } from "@tanstack/ai";
import { defineMessageStore } from "@tanstack/ai-persistence";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db.ts";

// Where the assistant's chats are saved: TanStack AI's persistence middleware hands over the whole transcript of a
// thread, kept in ai_chat / ai_message (tenant tables, so every read and write is inside withOrg).

/** One chat per person per organization, so the panel always opens the same conversation. */
export const chatId = (orgId: string, userId: string) => `${orgId}-${userId}`;

type Owner = { orgId: string; userId: string };

/** Whether the person's chat is paused on tool calls waiting for their approval. */
export async function awaitingApproval({ orgId, userId }: Owner) {
	const [last] = await withOrg(db, orgId, (tx) =>
		tx
			.select({ role: aiMessage.role, toolCalls: aiMessage.toolCalls })
			.from(aiMessage)
			.where(eq(aiMessage.chatId, chatId(orgId, userId)))
			.orderBy(desc(aiMessage.position))
			.limit(1),
	);
	return (
		last?.role === "assistant" &&
		Array.isArray(last.toolCalls) &&
		last.toolCalls.length > 0
	);
}

/** Deletes the person's chat in that organization (its messages go with it). */
export const clearChat = ({ orgId, userId }: Owner) =>
	withOrg(db, orgId, (tx) =>
		tx
			.delete(aiChat)
			.where(
				and(eq(aiChat.id, chatId(orgId, userId)), eq(aiChat.userId, userId)),
			),
	);

const TITLE_MAX = 60;

const titleOf = (messages: ModelMessage[]) => {
	const first = messages.find((m) => m.role === "user");
	const text =
		typeof first?.content === "string"
			? first.content
			: Array.isArray(first?.content)
				? first.content
						.map((p) =>
							"content" in p && typeof p.content === "string" ? p.content : "",
						)
						.join(" ")
				: "";
	const line = text.replace(/\s+/g, " ").trim();
	if (!line) return "New chat";
	return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX)}…` : line;
};

/**
 * The message store for one person in one organization: any other thread id reads as empty and is never written.
 * `model` says which model is answering now; it's recorded on assistant messages that don't have one yet.
 */
export function chatStore(owner: Owner, model: () => string | null) {
	const own = chatId(owner.orgId, owner.userId);
	return defineMessageStore({
		async loadThread(threadId: string) {
			if (threadId !== own) return [];
			const rows = await withOrg(db, owner.orgId, (tx) =>
				tx
					.select()
					.from(aiMessage)
					.where(eq(aiMessage.chatId, own))
					.orderBy(asc(aiMessage.position)),
			);
			return rows.map(
				(r) =>
					({
						...((r.extra as object | null) ?? {}),
						role: r.role,
						content: r.content,
						...(r.toolCalls ? { toolCalls: r.toolCalls } : {}),
						...(r.toolCallId ? { toolCallId: r.toolCallId } : {}),
					}) as ModelMessage,
			);
		},

		async saveThread(threadId: string, messages: ModelMessage[]) {
			if (threadId !== own) return;
			await withOrg(db, owner.orgId, async (tx) => {
				await tx
					.insert(aiChat)
					.values({
						id: own,
						orgId: owner.orgId,
						userId: owner.userId,
						title: titleOf(messages),
					})
					.onConflictDoUpdate({
						target: aiChat.id,
						set: { updatedAt: new Date() },
					});
				const before = await tx
					.select({ position: aiMessage.position, model: aiMessage.model })
					.from(aiMessage)
					.where(
						and(eq(aiMessage.chatId, own), eq(aiMessage.role, "assistant")),
					);
				const modelAt = new Map(before.map((b) => [b.position, b.model]));
				await tx.delete(aiMessage).where(eq(aiMessage.chatId, own));
				if (!messages.length) return;
				await tx.insert(aiMessage).values(
					messages.map((m, position) => {
						const { role, content, toolCalls, toolCallId, ...extra } =
							m as ModelMessage & {
								toolCalls?: unknown;
								toolCallId?: string;
							};
						return {
							orgId: owner.orgId,
							chatId: own,
							position,
							role,
							content: content ?? null,
							toolCalls: toolCalls ?? null,
							toolCallId: toolCallId ?? null,
							model:
								role === "assistant"
									? (modelAt.get(position) ??
										(
											extra.metadata as
												| { tanstack?: { model?: string } }
												| undefined
										)?.tanstack?.model ??
										model())
									: null,
							extra: Object.keys(extra).length ? extra : null,
						};
					}),
				);
			});
		},
	});
}
