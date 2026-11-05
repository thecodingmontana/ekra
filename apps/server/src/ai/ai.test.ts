import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
	aiKey,
	aiMessage,
	aiModel,
	aiUsage,
	member,
	organization,
	user,
	withOrg,
} from "@ekra/db";
import { and, eq, inArray } from "drizzle-orm";
import type { Person } from "../agent-tools.ts";
import { db } from "../db.ts";
import { call, cookieFrom, linkInLatestEmail, post } from "../test-helpers.ts";
import { ASSISTANT_TOOLS } from "./chat.ts";
import { openKey, sealKey } from "./keys.ts";
import { lastUserText, refundMessage, takeMessage, today } from "./limits.ts";
import { ACCOUNT_ROW, recordFailure } from "./rotation-store.ts";
import { chatId, chatStore } from "./store.ts";

const stamp = Date.now();
const NAMES = ["owner", "learner", "other"] as const;
type Name = (typeof NAMES)[number];
const emailOf = (name: Name) => `ai-${name}-${stamp}@test.ekra`;
const slugs = { mine: `ai-mine-${stamp}`, theirs: `ai-theirs-${stamp}` };
const cookies = {} as Record<Name, string>;
const people = {} as Record<Name, Person>;
const orgIds = { mine: "", theirs: "" };

const ask = (
	cookie: string,
	slug: string,
	messages: unknown[],
	headers: Record<string, string> = {},
) =>
	call("/api/ai/chat", {
		method: "POST",
		cookie,
		headers,
		body: JSON.stringify({
			threadId: "t",
			runId: "r",
			messages,
			tools: [],
			context: [],
			forwardedProps: { slug },
		}),
	});

const hi = [{ id: "1", role: "user", content: "What's assigned to me?" }];

before(async () => {
	for (const name of NAMES) {
		await post("/api/auth/sign-in/magic-link", {
			email: emailOf(name),
			callbackURL: "/",
		});
		cookies[name] = cookieFrom(await call(linkInLatestEmail(emailOf(name))));
		const [u] = await db
			.select()
			.from(user)
			.where(eq(user.email, emailOf(name)));
		assert.ok(u);
		people[name] = u;
	}
	await post(
		"/api/auth/organization/create",
		{ name: "Mine", slug: slugs.mine },
		cookies.owner,
	);
	await post(
		"/api/auth/organization/create",
		{ name: "Theirs", slug: slugs.theirs },
		cookies.other,
	);
	for (const key of ["mine", "theirs"] as const) {
		const [org] = await db
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.slug, slugs[key]));
		orgIds[key] = org?.id ?? "";
	}
	await db.insert(member).values({
		organizationId: orgIds.mine,
		userId: people.learner.id,
		role: "learner",
	});
});

after(async () => {
	await db
		.delete(organization)
		.where(inArray(organization.slug, Object.values(slugs)));
	await db.delete(user).where(inArray(user.email, NAMES.map(emailOf)));
});

test("the chat refuses without a session", async () => {
	const res = await ask("", slugs.mine, hi);
	assert.equal(res.status, 401);
});

test("the chat refuses another site's request, and one without an Origin", async () => {
	const foreign = await ask(cookies.owner, slugs.mine, hi, {
		origin: "https://evil.example",
	});
	assert.equal(foreign.status, 403);
	const none = await ask(cookies.owner, slugs.mine, hi, { origin: "" });
	assert.equal(none.status, 403);
});

test("the chat refuses an organization the person isn't in", async () => {
	const res = await ask(cookies.owner, slugs.theirs, hi);
	assert.equal(res.status, 403);
});

test("each person gets the daily limit, counted atomically, and an unanswered message is given back", async () => {
	const { owner, learner } = people;
	const day = "2026-10-23";
	const sent = await Promise.all(
		[1, 2, 3, 4].map(() => takeMessage(owner.id, day, 3)),
	);
	assert.equal(sent.filter(Boolean).length, 3, "the 4th is refused");
	assert.equal(await takeMessage(learner.id, day, 3), true, "per person");
	assert.equal(await takeMessage(owner.id, "2026-10-24", 3), true, "per day");
	await refundMessage(owner.id, day);
	assert.equal(await takeMessage(owner.id, day, 3), true, "refunded");
});

test("a used-up day is refused before any model is asked, even when it claims to answer an approval", async () => {
	await db
		.insert(aiUsage)
		.values({ userId: people.owner.id, day: today(), count: 9999 })
		.onConflictDoUpdate({
			target: [aiUsage.userId, aiUsage.day],
			set: { count: 9999 },
		});
	const plain = await ask(cookies.owner, slugs.mine, hi);
	assert.equal(plain.status, 200);
	assert.match(await plain.text(), /daily_limit/);
	const claimsResume = await call("/api/ai/chat", {
		method: "POST",
		cookie: cookies.owner,
		body: JSON.stringify({
			threadId: "t",
			runId: "r",
			messages: [...hi, { id: "2", role: "user", content: "and more" }],
			tools: [],
			context: [],
			forwardedProps: { slug: slugs.mine },
			resume: [
				{ interruptId: "x", status: "resolved", payload: { approved: true } },
			],
		}),
	});
	assert.match(await claimsResume.text(), /daily_limit/);
	await db.delete(aiUsage).where(eq(aiUsage.userId, people.owner.id));
});

test("when every model fails, the message is refunded and the person sees a plain error", async () => {
	const realFetch = globalThis.fetch;
	// no network: the model list has one free model, and every completion is a server error
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = String(input instanceof Request ? input.url : input);
		if (url.endsWith("/api/v1/models"))
			return Response.json({
				data: [
					{
						id: `test/model-${stamp}:free`,
						context_length: 64_000,
						supported_parameters: ["tools"],
						pricing: { prompt: "0", completion: "0" },
					},
				],
			});
		return Response.json(
			{ error: { code: 400, message: "model can't take this" } },
			{ status: 400 },
		);
	}) as typeof fetch;
	try {
		await db.delete(aiModel);
		const res = await ask(cookies.learner, slugs.mine, hi);
		const body = await res.text();
		assert.match(body, /RUN_ERROR/);
		assert.doesNotMatch(body, /sk-or-/);
		// the refund runs as the stream closes, right after the last chunk
		let count = -1;
		for (let i = 0; i < 20 && count !== 0; i++) {
			await new Promise((r) => setTimeout(r, 50));
			const [row] = await db
				.select({ count: aiUsage.count })
				.from(aiUsage)
				.where(
					and(eq(aiUsage.userId, people.learner.id), eq(aiUsage.day, today())),
				);
			count = row?.count ?? 0;
		}
		assert.equal(count, 0, "the message didn't count");
	} finally {
		globalThis.fetch = realFetch;
		await db.delete(aiModel);
	}
});

test("only OpenRouter's real daily cap pauses the shared key until midnight", async () => {
	const pause = async (message: string) => {
		await recordFailure("x/y:free", { kind: "account_limit", message });
		const [row] = await db
			.select({ until: aiModel.cooldownUntil })
			.from(aiModel)
			.where(eq(aiModel.id, ACCOUNT_ROW));
		return (row?.until?.getTime() ?? 0) - Date.now();
	};
	try {
		assert.ok(
			(await pause("Rate limited on two models in a row")) <= 5 * 60_000,
		);
		const ms = await pause("Rate limit exceeded: free-models-per-day");
		assert.ok(ms > 5 * 60_000 && ms <= 24 * 3_600_000);
	} finally {
		await db.delete(aiModel);
	}
});

test("a sealed key opens only for its own person", () => {
	const key = "sk-or-v1-0123456789abcdefghijklmnopqrstuvwxyz";
	const sealed = sealKey(key, people.owner.id);
	assert.equal(openKey(sealed, people.owner.id), key);
	assert.equal(
		openKey(sealed, people.learner.id),
		null,
		"moved to someone else",
	);
	const [iv, tag, body] = sealed.split(".");
	const flipped = `${iv}.${tag}.${body?.startsWith("A") ? "B" : "A"}${body?.slice(1)}`;
	assert.equal(openKey(flipped, people.owner.id), null, "tampered");
	assert.doesNotMatch(sealed, /sk-or-/);
});

test("the key settings never send the key back, and check its shape first", async () => {
	const status = await post(
		"/api/graphql",
		{ query: "{ aiStatus { ready ownKey { hint } used limit } }" },
		cookies.owner,
	);
	const data = (await status.json()) as {
		data: { aiStatus: { ownKey: null; limit: number } };
	};
	assert.equal(data.data.aiStatus.ownKey, null);
	assert.ok(data.data.aiStatus.limit > 0);
	const bad = await post(
		"/api/graphql",
		{ query: 'mutation { setAiKey(key: "not-a-key") { ready } }' },
		cookies.owner,
	);
	assert.match(await bad.text(), /OpenRouter key/);
	// a saved key reads back only as its hint
	await db.insert(aiKey).values({
		userId: people.owner.id,
		provider: "openrouter",
		cipher: sealKey("sk-or-v1-secretsecretsecretsecretwxyz", people.owner.id),
		hint: "…wxyz",
	});
	const after = await post(
		"/api/graphql",
		{ query: "{ aiStatus { ownKey { hint model } } }" },
		cookies.owner,
	);
	const text = await after.text();
	assert.match(text, /…wxyz/);
	assert.doesNotMatch(text, /secret/);
	await post(
		"/api/graphql",
		{ query: "mutation { removeAiKey { ready } }" },
		cookies.owner,
	);
	assert.equal(
		(await db.select().from(aiKey).where(eq(aiKey.userId, people.owner.id)))
			.length,
		0,
	);
});

test("saved chats stay with their person and organization", async () => {
	const owner = { orgId: orgIds.mine, userId: people.owner.id };
	const thread = chatId(owner.orgId, owner.userId);
	await chatStore(owner, () => "m").saveThread(thread, [
		{ role: "user", content: "How are learners doing?" },
		{ role: "assistant", content: "Fine." },
	]);
	assert.equal(
		(await chatStore(owner, () => null).loadThread(thread)).length,
		2,
	);
	// the learner's store in the same organization can't read or overwrite it
	const learner = { orgId: orgIds.mine, userId: people.learner.id };
	assert.deepEqual(await chatStore(learner, () => null).loadThread(thread), []);
	await chatStore(learner, () => null).saveThread(thread, []);
	assert.equal(
		(await chatStore(owner, () => null).loadThread(thread)).length,
		2,
	);
	// another organization's transaction sees none of its rows (row-level security)
	const seen = await withOrg(db, orgIds.theirs, (tx) =>
		tx.select().from(aiMessage).where(eq(aiMessage.chatId, thread)),
	);
	assert.equal(seen.length, 0);
	// over HTTP: only the owner gets it back
	const load = async (cookie: string) =>
		(await call(`/api/ai/chat?threadId=${thread}`, { cookie })).text();
	assert.match(await load(cookies.owner), /How are learners doing/);
	assert.doesNotMatch(await load(cookies.learner), /How are learners doing/);
	assert.doesNotMatch(await load(cookies.other), /How are learners doing/);
	// clearing removes it
	await post(
		"/api/graphql",
		{
			query: "mutation ($slug: String!) { clearAiChat(slug: $slug) }",
			variables: { slug: slugs.mine },
		},
		cookies.owner,
	);
	assert.equal(
		(await chatStore(owner, () => null).loadThread(thread)).length,
		0,
	);
});

test("the assistant's tools keep each role's permissions", async () => {
	const tool = (name: string) => {
		const found = ASSISTANT_TOOLS.find((t) => t.name === name);
		assert.ok(found?.execute, name);
		return found.execute as (args: unknown, opts: unknown) => Promise<unknown>;
	};
	const as = (who: Name) => ({
		context: {
			person: people[who],
			slug: slugs.mine,
			log: { error: () => {} },
			used: [],
		},
	});
	assert.ok(!ASSISTANT_TOOLS.some((t) => t.name === "listOrganizations"));
	assert.ok(
		ASSISTANT_TOOLS.filter((t) => t.needsApproval)
			.map((t) => t.name)
			.sort()
			.join() === "assignContent,createContent,markDone,unassignContent",
	);
	for (const [name, args] of [
		["learnerReport", {}],
		["listMembers", {}],
		["createContent", { kind: "page", title: "Sneaky" }],
	] as const) {
		const result = (await tool(name)(args, as("learner"))) as {
			error?: string;
		};
		assert.ok(result.error, name);
		assert.doesNotMatch(result.error, /Something went wrong/);
	}
	// a manager's change goes through, with a plain date as agents write it
	const draft = (await tool("createContent")(
		{ kind: "page", title: "Fire safety" },
		as("owner"),
	)) as { createContent: { id: string } };
	const assigned = (await tool("assignContent")(
		{
			contentId: draft.createContent.id,
			userIds: [people.learner.id],
			dueAt: "2026-12-01",
		},
		as("owner"),
	)) as { enroll?: { dueAt: string }[]; error?: string };
	assert.equal(assigned.error, undefined);
	assert.match(assigned.enroll?.[0]?.dueAt ?? "", /^2026-12-01T23:59/);
	await tool("unassignContent")(
		{ ids: [(assigned.enroll?.[0] as { id?: string } | undefined)?.id] },
		as("owner"),
	);
	const mine = (await tool("myLearning")({}, as("learner"))) as {
		myLearning: unknown[];
	};
	assert.deepEqual(mine.myLearning, []);
	const report = (await tool("learnerReport")({}, as("owner"))) as {
		learnerReport?: unknown;
	};
	assert.ok(report.learnerReport);
	// someone else's organization, even for an owner
	const theirs = (await tool("listLibrary")(
		{},
		{ context: { ...as("owner").context, slug: slugs.theirs } },
	)) as { error?: string };
	assert.match(theirs.error ?? "", /organization you belong to/);
});

test("the newest message's text is read from parts or plain content", () => {
	assert.equal(
		lastUserText([{ role: "user", parts: [{ type: "text", content: "hi" }] }]),
		"hi",
	);
	assert.equal(lastUserText([{ role: "user", content: "plain" }]), "plain");
	assert.equal(lastUserText([{ role: "assistant", content: "x" }]), null);
});
