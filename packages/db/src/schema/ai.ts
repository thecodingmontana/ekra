/**
 * The built-in assistant. Chats belong to one person in one organization (tenant tables: org_id + the row-level
 * policy, inside withOrg). The model rotation, each person's daily count and their own AI keys aren't tenant
 * data: a model is busy for everyone, the daily limit is the person's across organizations, and a key is the
 * person's own, used wherever they open the assistant.
 */
import {
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	unique,
	varchar,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";
import { id, idRef, moment, timestamps } from "./columns.ts";
import { tenantPolicy } from "./content.ts";

/** One chat per person per organization; its id is the thread id ("<orgId>-<userId>"). */
export const aiChat = pgTable(
	"ai_chat",
	{
		id: varchar("id", { length: 40 }).primaryKey(),
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: idRef("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		title: text("title").notNull().default("New chat"),
		...timestamps,
	},
	(table) => [
		unique("ai_chat_person").on(table.orgId, table.userId),
		tenantPolicy("ai_chat"),
	],
).enableRLS();

/** A chat's messages in the standard model message shape, so any model can continue them. */
export const aiMessage = pgTable(
	"ai_message",
	{
		id: id(),
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		chatId: varchar("chat_id", { length: 40 })
			.notNull()
			.references(() => aiChat.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		/** user | assistant | tool | system */
		role: varchar("role", { length: 16 }).notNull(),
		/** text, or content parts, as the model message has them */
		content: jsonb("content"),
		toolCalls: jsonb("tool_calls"),
		toolCallId: varchar("tool_call_id", { length: 120 }),
		/** which model wrote an assistant message */
		model: varchar("model", { length: 160 }),
		/** anything else the message carries (name, metadata), so it round-trips unchanged */
		extra: jsonb("extra"),
		createdAt: moment("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("ai_message_chat_idx").on(table.chatId, table.position),
		tenantPolicy("ai_message"),
	],
).enableRLS();

/**
 * Free models the assistant rotates between: their rank from the last discovery and, when one fails, how long
 * it's skipped. The row "*account*" is the shared key's account-wide free limit.
 */
export const aiModel = pgTable("ai_model", {
	id: varchar("id", { length: 160 }).primaryKey(),
	/** 0 is best; null once it's no longer in the discovered list */
	rank: integer("rank"),
	context: integer("context"),
	rankedAt: moment("ranked_at"),
	cooldownUntil: moment("cooldown_until"),
	lastError: text("last_error"),
	failures: integer("failures").notNull().default(0),
	successes: integer("successes").notNull().default(0),
	lastMs: integer("last_ms"),
	updatedAt: moment("updated_at").defaultNow().notNull(),
});

/** Messages each person sent on the shared key per day (UTC), for AI_DAILY_LIMIT. */
export const aiUsage = pgTable(
	"ai_usage",
	{
		userId: idRef("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		day: varchar("day", { length: 10 }).notNull(),
		count: integer("count").notNull().default(0),
	},
	(table) => [primaryKey({ columns: [table.userId, table.day] })],
);

/**
 * A person's own AI key (bring your own key), encrypted with AI_KEYS_SECRET and bound to the person and provider.
 * The browser only ever sees its last characters (hint).
 */
export const aiKey = pgTable(
	"ai_key",
	{
		userId: idRef("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** openrouter */
		provider: varchar("provider", { length: 24 }).notNull(),
		cipher: text("cipher").notNull(),
		hint: varchar("hint", { length: 8 }).notNull(),
		/** the model to use with this key ("" rotates free models) */
		model: varchar("model", { length: 160 }).notNull().default(""),
		...timestamps,
	},
	(table) => [primaryKey({ columns: [table.userId, table.provider] })],
);
