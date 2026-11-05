import {
	AGENT_LIST_CAP,
	AGENT_TOOLS,
	type AgentToolArgs,
	type AgentToolName,
} from "@ekra/core";
import type { user } from "@ekra/db";
import { execute, parse } from "graphql";
import { type GraphQLContext, isUnexpected, schema } from "./graphql/yoga.ts";
import { announceChange, mutationSlugs } from "./realtime.ts";

// What the tools in @ekra/core's AGENT_TOOLS do: each runs one operation of Ekra's own GraphQL schema as the
// person, so every permission and tenant check applies exactly as it does in the app. Shared by the MCP server
// (outside agents) and the built-in assistant.

export type Person = typeof user.$inferSelect;
export type ToolResult = { data: unknown } | { error: string };
/** Where a bug inside a tool is logged (the request's or the chat's log event). */
export type ToolLog = { error: (error: Error | string) => unknown };

/**
 * Runs one GraphQL operation as `person` in the organization `slug` (passed as $slug; resolvers check the
 * membership themselves). The session has no active organization, so nothing but the slug picks one.
 */
export async function run(
	person: Person,
	slug: string,
	log: ToolLog,
	query: string,
	variables: Record<string, unknown> = {},
): Promise<{ data: Record<string, unknown> } | { error: string }> {
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
					log.error(e.originalError ?? e);
					return "Something went wrong. Try again in a moment.";
				})
				.join("; "),
		};
	announceChange(mutationSlugs(document, variableValues), null);
	return { data: (result.data ?? {}) as Record<string, unknown> };
}

/** A plain date (2026-12-01), as agents write them, at a time on that day (UTC); anything else as given. */
export const onDay = (date: string | undefined, time: string) =>
	date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T${time}Z` : date;

const CONTENT_FIELDS =
	"id kind title description status parentId archivedAt updatedAt tags";
const PERSON = "person { id name role }";

type Runner<K extends AgentToolName> = (
	person: Person,
	slug: string,
	args: AgentToolArgs<K>,
	log: ToolLog,
) => Promise<ToolResult>;

/** One GraphQL operation per tool, its variables straight from the tool's input. */
const op =
	<K extends AgentToolName>(
		query: string,
		vars: (args: AgentToolArgs<K>) => Record<string, unknown> = (args) => args,
	): Runner<K> =>
	(person, slug, args, log) =>
		run(person, slug, log, query, vars(args));

export const AGENT_RUNNERS: { [K in AgentToolName]: Runner<K> } = {
	listOrganizations: async (person, _slug, _args, log) => {
		const r = await run(
			person,
			"",
			log,
			"query { viewer { memberships { role organization { slug name kind } } } }",
		);
		if ("error" in r) return r;
		const viewer = r.data.viewer as {
			memberships: { role: string; organization: object }[];
		} | null;
		return {
			data: (viewer?.memberships ?? []).map((m) => ({
				...m.organization,
				role: m.role,
			})),
		};
	},
	listLibrary: async (person, slug, { search, kind, archived }, log) => {
		const r = await run(
			person,
			slug,
			log,
			`query ($slug: String!, $archived: Boolean) { library(slug: $slug, archived: $archived) { canManage items { ${CONTENT_FIELDS} } } }`,
			{ archived: archived ?? false },
		);
		if ("error" in r) return r;
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
		return {
			data: {
				canManage: library.canManage,
				total: items.length,
				items: items.slice(0, AGENT_LIST_CAP),
			},
		};
	},
	getContent: op(
		`query ($slug: String!, $id: ID!) { content(slug: $slug, id: $id) { ${CONTENT_FIELDS} createdAt author { id name } } }`,
	),
	getCourse: op(
		"query ($slug: String!, $id: ID!) { course(slug: $slug, id: $id) { id title description sequential completedCount lessonCount sections { id title position lessons { id kind title position quizId locked completed } } } }",
	),
	getQuiz: op(
		"query ($slug: String!, $id: ID!) { quizOverview(slug: $slug, id: $id) { id questionCount attemptsLeft settings { passPercent timeLimitSeconds maxAttempts poolSize shuffleQuestions shuffleOptions showAnswers } attempts { id startedAt submittedAt score maxScore passed } } }",
	),
	getPath: op(
		"query ($slug: String!, $id: ID!) { path(slug: $slug, id: $id) { id title sequential percent stages { id title position steps { id position percent locked content { id kind title } } } } }",
	),
	myLearning: op(
		"query ($slug: String!) { myLearning(slug: $slug) { id status percent startAt dueAt content { id kind title } } myCertificates(slug: $slug) { id contentId title issuedAt } }",
	),
	listMembers: op(
		"query ($slug: String!) { members(slug: $slug) { id name email role } }",
	),
	listAssignments: op(
		"query ($slug: String!, $contentId: ID!) { enrollments(slug: $slug, contentId: $contentId) { id status percent startAt dueAt user { id name } } }",
	),
	assignContent: op(
		"mutation ($slug: String!, $contentId: ID!, $userIds: [ID!]!, $startAt: String, $dueAt: String) { enroll(slug: $slug, contentId: $contentId, userIds: $userIds, startAt: $startAt, dueAt: $dueAt) { id status startAt dueAt user { id name } } }",
		(args) => ({
			...args,
			startAt: onDay(args.startAt, "00:00:00.000"),
			dueAt: onDay(args.dueAt, "23:59:59.999"),
		}),
	),
	unassignContent: op(
		"mutation ($slug: String!, $ids: [ID!]!) { removed: removeEnrollments(slug: $slug, ids: $ids) }",
	),
	learnerReport: op(
		`query ($slug: String!) { learnerReport(slug: $slug) { totalLearners weeklyActive { day count } learners { ${PERSON} assigned completed inProgress overdue percent lastOpenedAt } } }`,
	),
	contentReport: op(
		"query ($slug: String!, $kind: ContentKind!) { contentReport(slug: $slug, kind: $kind) { content { id title kind } status learners completed percent accuracy } }",
	),
	quizReport: op(
		`query ($slug: String!, $id: ID!) { quizReport(slug: $slug, id: $id) { content { id title } questionCount accuracy completedPercent submissions averageSeconds questions { id position kind prompt points answered correct } learners { ${PERSON} score maxScore passed attempts } } }`,
	),
	createContent: op(
		`mutation ($slug: String!, $input: CreateContentInput!) { createContent(slug: $slug, input: $input) { ${CONTENT_FIELDS} } }`,
		(input) => ({ input }),
	),
	markDone: op(
		"mutation ($slug: String!, $contentId: ID!, $done: Boolean!) { done: markDone(slug: $slug, contentId: $contentId, done: $done) }",
	),
};

/** Runs a tool by name (the name and args are checked against AGENT_TOOLS by the caller's tool layer). */
export const runAgentTool = (
	name: AgentToolName,
	person: Person,
	slug: string,
	args: Record<string, unknown>,
	log: ToolLog,
) =>
	(AGENT_RUNNERS[name] as Runner<AgentToolName>)(
		person,
		slug,
		args as AgentToolArgs<AgentToolName>,
		log,
	);

export const AGENT_TOOL_NAMES = Object.keys(AGENT_TOOLS) as AgentToolName[];
