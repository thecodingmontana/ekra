import { createPublicKey, verify } from "node:crypto";
import { jwks, oauthConsent, user } from "@ekra/db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { and, eq } from "drizzle-orm";
import { useLogger } from "evlog/hono";
import { execute, parse } from "graphql";
import type { Context } from "hono";
import { z } from "zod";
import { AUTH_ISSUER, MCP_RESOURCE } from "./auth/index.ts";
import { db } from "./db.ts";
import { type GraphQLContext, isUnexpected, schema } from "./graphql/yoga.ts";
import { fixedWindow } from "./rate-limit.ts";
import { announceChange, mutationSlugs } from "./realtime.ts";

// Ekra as an MCP server: an AI agent (Claude Code, Cursor, Codex…) that signed in as a person over OAuth uses
// Ekra as that person, with their role in each organization. Every tool runs one operation of Ekra's own GraphQL
// schema, so every permission and tenant check applies exactly as it does in the app.

// What an agent knows about Ekra the moment it connects. Only facts from the README and PLAN.md.
const ABOUT = `Ekra is a self-hosted, multi-tenant learning platform for companies training their teams and creators publishing courses.

What it has:
- Organizations, each with its own members and roles: owner, admin and trainer run it (create content, assign it, see reports); learners and guests learn what they're given.
- A library of learning content: pages, courses (sections of video, page and quiz lessons), quizzes, learning paths (stages of steps) and folders, as drafts or published.
- Assignments: managers assign content to people with optional start and due dates, and track status and progress.
- My learning: what you've been assigned, your progress and your certificates.
- Reports: learners (activity, completion, overdue), content (completion per item) and quiz results per question.

How to work here: you act as the signed-in person, with exactly their role in each organization (you can't do anything they can't). Start with listOrganizations to get an organization slug; every other tool takes it as "organization". Use listLibrary to find content ids, and listMembers for people's ids, before changing anything. Your changes are the person's own and show up live for everyone in that organization.`;

const CALLS_PER_MINUTE = 120;
const calls = fixedWindow(CALLS_PER_MINUTE, 60_000);
const b64 = (s: string) => Buffer.from(s, "base64url");

/** The person and app behind an agent's access token, or null unless it's a live, valid token for /api/mcp. */
export async function verifyAgentToken(token: string) {
	const [h, p, sig] = token.split(".");
	if (!h || !p || !sig) return null;
	let header: { alg?: string; kid?: string };
	let claims: {
		sub?: string;
		azp?: string;
		iss?: string;
		aud?: string | string[];
		exp?: number;
	};
	try {
		header = JSON.parse(b64(h).toString());
		claims = JSON.parse(b64(p).toString());
	} catch {
		return null;
	}
	if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
	const [key] = await db
		.select({ publicKey: jwks.publicKey })
		.from(jwks)
		.where(eq(jwks.id, header.kid));
	if (!key) return null;
	let signed = false;
	try {
		signed = verify(
			"RSA-SHA256",
			Buffer.from(`${h}.${p}`),
			createPublicKey({ key: JSON.parse(key.publicKey), format: "jwk" }),
			b64(sig),
		);
	} catch {
		return null;
	}
	if (!signed) return null;
	if (claims.iss !== AUTH_ISSUER || ![claims.aud].flat().includes(MCP_RESOURCE))
		return null;
	if (!claims.exp || claims.exp * 1000 <= Date.now()) return null;
	if (typeof claims.sub !== "string" || typeof claims.azp !== "string")
		return null;
	// still approved: disconnecting the app deletes the consent, so this stops it at once
	const [consent] = await db
		.select({ id: oauthConsent.id })
		.from(oauthConsent)
		.where(
			and(
				eq(oauthConsent.userId, claims.sub),
				eq(oauthConsent.clientId, claims.azp),
			),
		);
	return consent ? { userId: claims.sub, clientId: claims.azp } : null;
}

type Person = typeof user.$inferSelect;
type Result = { data: Record<string, unknown> } | { error: string };

/**
 * Runs one GraphQL operation as `person` in the organization `slug` (passed as $slug; resolvers check the
 * membership themselves). The session has no active organization, so nothing but the slug picks one.
 */
export async function run(
	person: Person,
	slug: string,
	query: string,
	variables: Record<string, unknown> = {},
): Promise<Result> {
	const document = parse(query);
	const variableValues = { slug, ...variables };
	const session = {
		user: person,
		session: { userId: person.id, activeOrganizationId: null },
	} as unknown as GraphQLContext["session"];
	const result = await execute({
		schema,
		document,
		variableValues,
		contextValue: { session },
	});
	if (result.errors?.length)
		return {
			// refusals as written; a bug is logged and reads as a plain line, with no database details
			error: result.errors
				.map((e) => {
					if (!isUnexpected(e)) return e.message;
					useLogger().error(e.originalError ?? e);
					return "Something went wrong. Try again in a moment.";
				})
				.join("; "),
		};
	announceChange(mutationSlugs(document, variableValues), null);
	return { data: (result.data ?? {}) as Record<string, unknown> };
}

const id = z.string().min(1).max(64);
const organization = z
	.string()
	.min(1)
	.max(64)
	.describe("the organization's slug, from listOrganizations");
const contentKind = z.enum([
	"folder",
	"page",
	"course",
	"quiz",
	"assignment",
	"path",
	"wiki",
]);
const LIST_CAP = 100;

const CONTENT_FIELDS =
	"id kind title description status parentId archivedAt updatedAt tags";
const PERSON = "person { id name role }";

/** One MCP server for this person's request (stateless: nothing is kept between requests). */
function serverFor(person: Person) {
	const server = new McpServer(
		{ name: "ekra", title: "Ekra", version: "1.0.0", websiteUrl: AUTH_ISSUER },
		{ instructions: ABOUT },
	);
	const reply = (result: Result | { data: unknown }) => {
		const error = "error" in result;
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify(error ? result : result.data),
				},
			],
			isError: error,
		};
	};
	const read = { readOnlyHint: true };
	const write = { readOnlyHint: false, destructiveHint: false };

	server.registerTool(
		"listOrganizations",
		{
			description:
				"List the Ekra organizations you belong to, with their slugs and your role (owner, admin, trainer, learner or guest). Every other tool needs an organization slug.",
			annotations: read,
		},
		async () => {
			const r = await run(
				person,
				"",
				"query { viewer { memberships { role organization { slug name kind } } } }",
			);
			if ("error" in r) return reply(r);
			const viewer = r.data.viewer as {
				memberships: { role: string; organization: object }[];
			} | null;
			return reply({
				data: (viewer?.memberships ?? []).map((m) => ({
					...m.organization,
					role: m.role,
				})),
			});
		},
	);

	server.registerTool(
		"listLibrary",
		{
			description: `Find learning content in an organization's library: everything you can see, optionally narrowed by words in the title or description and by kind. At most ${LIST_CAP} items; canManage says whether you can change content here.`,
			inputSchema: {
				organization,
				search: z.string().max(200).optional(),
				kind: contentKind.optional(),
				archived: z
					.boolean()
					.optional()
					.describe("true lists archived content instead"),
			},
			annotations: read,
		},
		async ({ organization: slug, search, kind, archived }) => {
			const r = await run(
				person,
				slug,
				`query ($slug: String!, $archived: Boolean) { library(slug: $slug, archived: $archived) { canManage items { ${CONTENT_FIELDS} } } }`,
				{ archived: archived ?? false },
			);
			if ("error" in r) return reply(r);
			const library = r.data.library as {
				canManage: boolean;
				items: { kind: string; title: string; description: string | null }[];
			};
			const words = search?.toLowerCase().trim();
			const items = library.items.filter(
				(item) =>
					(!kind || item.kind === kind) &&
					(!words ||
						`${item.title} ${item.description ?? ""}`
							.toLowerCase()
							.includes(words)),
			);
			return reply({
				data: {
					canManage: library.canManage,
					total: items.length,
					items: items.slice(0, LIST_CAP),
				},
			});
		},
	);

	server.registerTool(
		"getContent",
		{
			description:
				"One library item's details (kind, title, description, status, tags). For a course's lessons use getCourse, a quiz's settings getQuiz, a path's steps getPath.",
			inputSchema: { organization, id },
			annotations: read,
		},
		async ({ organization: slug, id }) =>
			reply(
				await run(
					person,
					slug,
					`query ($slug: String!, $id: ID!) { content(slug: $slug, id: $id) { ${CONTENT_FIELDS} createdAt author { id name } } }`,
					{ id },
				),
			),
	);

	server.registerTool(
		"getCourse",
		{
			description:
				"A course's outline: its sections and lessons (video, page or quiz), and which you've completed or are still locked.",
			inputSchema: { organization, id: id.describe("the course's id") },
			annotations: read,
		},
		async ({ organization: slug, id }) =>
			reply(
				await run(
					person,
					slug,
					`query ($slug: String!, $id: ID!) { course(slug: $slug, id: $id) { id title description sequential completedCount lessonCount sections { id title position lessons { id kind title position quizId locked completed } } } }`,
					{ id },
				),
			),
	);

	server.registerTool(
		"getQuiz",
		{
			description:
				"A quiz's settings (pass mark, time limit, attempts allowed), how many questions it has, and your own attempts.",
			inputSchema: { organization, id: id.describe("the quiz's id") },
			annotations: read,
		},
		async ({ organization: slug, id }) =>
			reply(
				await run(
					person,
					slug,
					`query ($slug: String!, $id: ID!) { quizOverview(slug: $slug, id: $id) { id questionCount attemptsLeft settings { passPercent timeLimitSeconds maxAttempts poolSize shuffleQuestions shuffleOptions showAnswers } attempts { id startedAt submittedAt score maxScore passed } } }`,
					{ id },
				),
			),
	);

	server.registerTool(
		"getPath",
		{
			description:
				"A learning path's stages and steps (each a library item), with your progress on each.",
			inputSchema: { organization, id: id.describe("the path's id") },
			annotations: read,
		},
		async ({ organization: slug, id }) =>
			reply(
				await run(
					person,
					slug,
					`query ($slug: String!, $id: ID!) { path(slug: $slug, id: $id) { id title sequential percent stages { id title position steps { id position percent locked content { id kind title } } } } }`,
					{ id },
				),
			),
	);

	server.registerTool(
		"myLearning",
		{
			description:
				"What you've been assigned in an organization, with status, progress and due dates, plus the certificates you've earned there.",
			inputSchema: { organization },
			annotations: read,
		},
		async ({ organization: slug }) =>
			reply(
				await run(
					person,
					slug,
					`query ($slug: String!) { myLearning(slug: $slug) { id status percent startAt dueAt content { id kind title } } myCertificates(slug: $slug) { id contentId title issuedAt } }`,
				),
			),
	);

	server.registerTool(
		"listMembers",
		{
			description:
				"The organization's members with their ids, names, emails and roles (for people who run it). Use the ids with assignContent.",
			inputSchema: { organization },
			annotations: read,
		},
		async ({ organization: slug }) =>
			reply(
				await run(
					person,
					slug,
					"query ($slug: String!) { members(slug: $slug) { id name email role } }",
				),
			),
	);

	server.registerTool(
		"listAssignments",
		{
			description:
				"Who a library item is assigned to, with each assignment's id, status, progress and dates (for people who run the organization). Use the ids with unassignContent.",
			inputSchema: { organization, contentId: id },
			annotations: read,
		},
		async ({ organization: slug, contentId }) =>
			reply(
				await run(
					person,
					slug,
					`query ($slug: String!, $contentId: ID!) { enrollments(slug: $slug, contentId: $contentId) { id status percent startAt dueAt user { id name } } }`,
					{ contentId },
				),
			),
	);

	server.registerTool(
		"assignContent",
		{
			description:
				"Assign a library item to people (member ids from listMembers), optionally with a start and due date. They're told by email.",
			inputSchema: {
				organization,
				contentId: id,
				userIds: z.array(id).min(1).max(LIST_CAP),
				startAt: z
					.string()
					.max(40)
					.optional()
					.describe("when it starts (ISO date), default now"),
				dueAt: z.string().max(40).optional().describe("due date (ISO date)"),
			},
			annotations: write,
		},
		async ({ organization: slug, ...args }) =>
			reply(
				await run(
					person,
					slug,
					`mutation ($slug: String!, $contentId: ID!, $userIds: [ID!]!, $startAt: String, $dueAt: String) { enroll(slug: $slug, contentId: $contentId, userIds: $userIds, startAt: $startAt, dueAt: $dueAt) { id status startAt dueAt user { id name } } }`,
					args,
				),
			),
	);

	server.registerTool(
		"unassignContent",
		{
			description:
				"Remove assignments (ids from listAssignments). The people lose that item from their learning, with its progress.",
			inputSchema: {
				organization,
				ids: z.array(id).min(1).max(LIST_CAP),
			},
			annotations: { readOnlyHint: false, destructiveHint: true },
		},
		async ({ organization: slug, ids }) =>
			reply(
				await run(
					person,
					slug,
					"mutation ($slug: String!, $ids: [ID!]!) { removed: removeEnrollments(slug: $slug, ids: $ids) }",
					{ ids },
				),
			),
	);

	server.registerTool(
		"learnerReport",
		{
			description:
				"How learners are doing (for people who run the organization): total learners, weekly active learners over 8 weeks, and per learner what's assigned, completed, in progress and overdue.",
			inputSchema: { organization },
			annotations: read,
		},
		async ({ organization: slug }) =>
			reply(
				await run(
					person,
					slug,
					`query ($slug: String!) { learnerReport(slug: $slug) { totalLearners weeklyActive { day count } learners { ${PERSON} assigned completed inProgress overdue percent lastOpenedAt } } }`,
				),
			),
	);

	server.registerTool(
		"contentReport",
		{
			description:
				"Completion per library item of one kind (for people who run the organization): learners assigned, completed and percent, and quiz accuracy.",
			inputSchema: { organization, kind: contentKind },
			annotations: read,
		},
		async ({ organization: slug, kind }) =>
			reply(
				await run(
					person,
					slug,
					"query ($slug: String!, $kind: ContentKind!) { contentReport(slug: $slug, kind: $kind) { content { id title kind } status learners completed percent accuracy } }",
					{ kind },
				),
			),
	);

	server.registerTool(
		"quizReport",
		{
			description:
				"A quiz's results (for people who run the organization): submissions, accuracy, how each question went, and each learner's score.",
			inputSchema: { organization, id: id.describe("the quiz's id") },
			annotations: read,
		},
		async ({ organization: slug, id }) =>
			reply(
				await run(
					person,
					slug,
					`query ($slug: String!, $id: ID!) { quizReport(slug: $slug, id: $id) { content { id title } questionCount accuracy completedPercent submissions averageSeconds questions { id position kind prompt points answered correct } learners { ${PERSON} score maxScore passed attempts } } }`,
					{ id },
				),
			),
	);

	server.registerTool(
		"createContent",
		{
			description:
				"Create a draft in the library (for people who run the organization): a page, course, quiz or learning path. Returns its id; it stays a draft until published in Ekra.",
			inputSchema: {
				organization,
				kind: z.enum(["page", "course", "quiz", "path"]),
				title: z.string().trim().min(1).max(200),
				description: z.string().max(2000).optional(),
				parentId: id.optional().describe("a folder's id to put it in"),
			},
			annotations: write,
		},
		async ({ organization: slug, ...input }) =>
			reply(
				await run(
					person,
					slug,
					`mutation ($slug: String!, $input: CreateContentInput!) { createContent(slug: $slug, input: $input) { ${CONTENT_FIELDS} } }`,
					{ input },
				),
			),
	);

	server.registerTool(
		"markDone",
		{
			description:
				"Mark a page (or other item without lessons) you're learning as done, or not done.",
			inputSchema: {
				organization,
				contentId: id,
				done: z.boolean().default(true),
			},
			annotations: write,
		},
		async ({ organization: slug, contentId, done }) =>
			reply(
				await run(
					person,
					slug,
					"mutation ($slug: String!, $contentId: ID!, $done: Boolean!) { done: markDone(slug: $slug, contentId: $contentId, done: $done) }",
					{ contentId, done },
				),
			),
	);

	return server;
}

/** 401 and 429 say where to sign in (RFC 9728), so the agent can start the OAuth flow. */
const challenge = (status: 401 | 429, error: string) =>
	new Response(JSON.stringify({ error }), {
		status,
		headers: {
			"content-type": "application/json",
			"www-authenticate": `Bearer resource_metadata="${AUTH_ISSUER}/.well-known/oauth-protected-resource"${status === 401 ? `, error="invalid_token"` : ""}`,
			...(status === 429 ? { "retry-after": "60" } : {}),
		},
	});

/** POST /api/mcp: one MCP request from a signed-in agent. Bearer token only, never a cookie. */
export async function mcpResponse(c: Context) {
	const token = c.req.header("authorization")?.match(/^Bearer (.+)$/i)?.[1];
	const who = token ? await verifyAgentToken(token) : null;
	if (!who) return challenge(401, "Sign in to Ekra first.");
	const log = useLogger();
	log.set({ user: { id: who.userId }, mcp: { client: who.clientId } });
	if (calls.hit(who.userId))
		return challenge(429, "Too many requests. Slow down for a minute.");
	const [person] = await db.select().from(user).where(eq(user.id, who.userId));
	if (!person) return challenge(401, "That account is gone.");
	const server = serverFor(person);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	await server.connect(transport);
	return transport.handleRequest(c.req.raw);
}
