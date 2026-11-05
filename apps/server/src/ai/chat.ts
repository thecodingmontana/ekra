import { AGENT_TOOLS, type AgentTool, type AgentToolName } from "@ekra/core";
import { organization } from "@ekra/db";
import {
	chat,
	chatParamsFromRequest,
	maxIterations,
	toolDefinition,
	toServerSentEventsResponse,
} from "@tanstack/ai";
import { reconstructChat, withPersistence } from "@tanstack/ai-persistence";
import { eq } from "drizzle-orm";
import { createError, createLogger } from "evlog";
import type { EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { z } from "zod";
import {
	AGENT_TOOL_NAMES,
	type Person,
	runAgentTool,
	type ToolLog,
} from "../agent-tools.ts";
import { auth } from "../auth/index.ts";
import { db } from "../db.ts";
import { env } from "../env.ts";
import { activeOrg, orgBySlug } from "../graphql/tenant.ts";
import { ownKey } from "./keys.ts";
import { lastUserText, refundMessage, takeMessage, today } from "./limits.ts";
import { adapterFor, sharedKey } from "./model.ts";
import { ASSISTANT, systemPrompt } from "./prompt.ts";
import { type Chunk, giveUp, rotate, runError } from "./rotation.ts";
import { candidates, recordFailure, recordSuccess } from "./rotation-store.ts";
import { awaitingApproval, chatId, chatStore } from "./store.ts";

// The assistant: streams the model's answer for the signed-in person, inside one organization, with the same
// tools outside agents get over MCP. Changes wait for the person's approval in the chat.

/** The longest message the assistant takes. */
export const MAX_MESSAGE = 2000;
// the most a chat's history may weigh (about 30 long messages with their tool results)
const MAX_HISTORY = 200_000;
// model turns (each can call tools) per message
const MAX_TURNS = 6;

type ToolContext = {
	person: Person;
	slug: string;
	log: ToolLog;
	/** the tools this answer ran, for its log event */
	used: string[];
};

/** The assistant's tools: every agent tool that works inside one organization; changes need approval. */
export const ASSISTANT_TOOLS = AGENT_TOOL_NAMES.filter(
	(name) => !(AGENT_TOOLS[name] as AgentTool).everyOrganization,
).map((name: AgentToolName) => {
	const tool: AgentTool = AGENT_TOOLS[name];
	return toolDefinition({
		name,
		description: tool.description,
		inputSchema: z.object(tool.input),
		needsApproval: tool.access !== "read",
	}).server<ToolContext>(async (args, { context: ctx }) => {
		ctx.used.push(name);
		const result = await runAgentTool(
			name,
			ctx.person,
			ctx.slug,
			args as Record<string, unknown>,
			ctx.log,
		);
		return "error" in result ? result : result.data;
	});
});

// errors as a stream, so the chat shows them in place with its retry button
const sseError = (message: string, code: string) =>
	toServerSentEventsResponse(
		(async function* () {
			yield runError(message, code);
		})() as Parameters<typeof toServerSentEventsResponse>[0],
	);

/** When it's the person's own key that failed, say so and where to fix it, never echoing the key. */
const ownKeyError = (chunk: Chunk): Chunk => {
	if (chunk.type !== "RUN_ERROR") return chunk;
	if (chunk.code === "auth" || chunk.code === "billing")
		return runError(
			"OpenRouter didn't accept your key, or the account has no credit. Check it in Settings → AI assistant.",
			String(chunk.code),
		);
	if (chunk.code === "account_limit" || chunk.code === "rate_limit")
		return runError(
			"Your OpenRouter key has hit its limit for now. Try again later.",
			String(chunk.code),
		);
	return runError(
		`${ASSISTANT} couldn't answer. Try again in a moment.`,
		String(chunk.code ?? "server"),
	);
};

const signIn = () =>
	createError({ message: `Sign in to use ${ASSISTANT}.`, status: 401 });

export const assistant = new Hono<EvlogVariables>();

// a saved conversation, for the person it belongs to, while they're still in that organization
assistant.get("/chat", async (c) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) throw signIn();
	const userId = session.user.id;
	return reconstructChat(
		{
			stores: {
				messages: {
					loadThread: async (threadId: string) => {
						const [orgId, owner] = threadId.split("-");
						if (owner !== userId || !(await activeOrg(userId, orgId)))
							return [];
						return chatStore(
							{ orgId: orgId ?? "", userId },
							() => null,
						).loadThread(threadId);
					},
					saveThread: async () => {},
				},
			},
		},
		c.req.raw,
	);
});

assistant.post("/chat", async (c) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) throw signIn();
	const person = session.user as unknown as Person;
	const requestLog = c.get("log");
	requestLog.set({ user: { id: person.id } });
	const own = await ownKey(person.id);
	const shared = sharedKey();
	if (!shared && !own)
		throw createError({
			message: `${ASSISTANT} isn't set up yet.`,
			status: 503,
			why: "The server has no OpenRouter key.",
			fix: "Add your own OpenRouter key in Settings → AI assistant, or ask whoever runs Ekra to set OPENROUTER_API_KEY.",
		});
	const params = await chatParamsFromRequest(c.req.raw);
	const slug = z
		.string()
		.max(64)
		.catch("")
		.parse(
			(params.forwardedProps as { slug?: unknown } | undefined)?.slug ?? "",
		);
	const org = await orgBySlug({ session }, slug).catch(() => {
		throw createError({
			message: "Choose an organization you belong to.",
			status: 403,
		});
	});
	const [orgRow] = await db
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, org.id));
	requestLog.set({ organization: { id: org.id } });
	const owner = { orgId: org.id, userId: person.id };
	const threadId = chatId(org.id, person.id);
	const text = lastUserText(params.messages);
	if (text && text.length > MAX_MESSAGE)
		return sseError(
			`Messages can be up to ${MAX_MESSAGE} characters. Try a shorter one.`,
			"too_long",
		);
	// the browser sends the whole chat: cap all of it, not just the newest message
	if (JSON.stringify(params.messages).length > MAX_HISTORY)
		return sseError(
			"This chat is too long to continue. Clear the history and start again.",
			"too_long",
		);
	// every request counts except an approval answer, which continues the last message; the browser only claims
	// that, so it's free only while the saved chat really waits on one (and adds no new question)
	const answering =
		!!params.resume?.length && text === null && (await awaitingApproval(owner));
	const day = today();
	const counted = !own && !answering;
	if (counted && !(await takeMessage(person.id, day)))
		return sseError(
			`You've used today's ${env.AI_DAILY_LIMIT} messages. Add your own OpenRouter key in Settings → AI assistant to keep going, or come back tomorrow.`,
			"daily_limit",
		);
	const key = (own?.key ?? shared) as string;
	const models = own?.model ? [own.model] : await candidates(!!own);

	// one log event per answer: which model, how long, which tools, what went wrong (never the messages or keys)
	const answerLog = createLogger({
		ai: { chat: threadId, ownKey: !!own, approval: answering },
		user: { id: person.id },
		organization: { id: org.id },
	});
	const used: string[] = [];
	const started = Date.now();
	// the model answering right now (the router reports the one it really used)
	let model: string | null = null;
	const persistence = {
		stores: { messages: chatStore(owner, () => model) },
	};
	const start = async function* (
		first: string,
		fallbacks: string[],
	): AsyncIterable<Chunk> {
		model = first;
		for await (const chunk of chat({
			adapter: adapterFor(first, fallbacks, key),
			messages: params.messages,
			threadId,
			runId: params.runId,
			// an approval answer resumes the paused run from the history the browser sends back
			parentRunId: params.parentRunId,
			...(params.resume ? { resume: params.resume } : {}),
			systemPrompts: [
				systemPrompt({
					name: person.name,
					organization: orgRow?.name ?? slug,
					role: org.role,
				}),
			],
			tools: ASSISTANT_TOOLS,
			// tools run as this person, in this organization
			context: { person, slug, log: answerLog, used } satisfies ToolContext,
			agentLoopStrategy: maxIterations(MAX_TURNS),
			middleware: [withPersistence(persistence)],
		})) {
			const meta = (chunk as { metadata?: { tanstack?: { model?: string } } })
				.metadata?.tanstack?.model;
			if (chunk.type === "RUN_FINISHED" && meta) model = meta;
			yield chunk as Chunk;
		}
	};

	// a failing model hands over to the next one before anything has streamed; with the shared account out of
	// free requests, nothing is tried
	let answered = false;
	let failed: string | null = null;
	let settled = false;
	// a message no model answered doesn't use up the day's allowance; runs once, before an error chunk goes out
	// (the response ends on that chunk without finishing this generator) or when the stream closes
	const settle = async () => {
		if (settled) return;
		settled = true;
		if (counted && !answered) await refundMessage(person.id, day);
		answerLog.set({
			ai: { model, answered, tools: used, ...(failed && { error: failed }) },
			duration: Date.now() - started,
		});
		answerLog.emit();
	};
	const stream = (async function* () {
		try {
			if (!models) {
				failed = "account_limit";
				await settle();
				yield giveUp("account_limit");
				return;
			}
			for await (const chunk of rotate(models, {
				start,
				onFailure: (m, f) => {
					failed = f.kind;
					answerLog.set({ ai: { failures: { [m]: f.kind } } });
					return recordFailure(m, f, !!own);
				},
				onSuccess: (m, info) => recordSuccess(m, info.ms),
			})) {
				// rotate passes nothing but its error chunk until a model has started answering
				if (chunk.type === "RUN_ERROR") await settle();
				else answered = true;
				yield own ? ownKeyError(chunk) : chunk;
			}
		} finally {
			await settle();
		}
	})();
	return toServerSentEventsResponse(
		stream as Parameters<typeof toServerSentEventsResponse>[0],
	);
});
