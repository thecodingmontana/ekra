import { z } from "zod";

/**
 * The tools an AI uses Ekra with: outside agents over MCP, and the built-in assistant. Only what each takes and
 * says (plain zod, no code that runs them), so the server and the assistant's approval cards share one definition.
 * The server runs each as one operation of Ekra's own GraphQL schema, as the signed-in person.
 */

const id = z.string().min(1).max(64);
const contentKind = z.enum([
	"folder",
	"page",
	"course",
	"quiz",
	"assignment",
	"path",
	"wiki",
]);

/** The most items a list tool returns. */
export const AGENT_LIST_CAP = 100;

/** read: only looks; write: changes something; destructive: removes something. */
export type AgentToolAccess = "read" | "write" | "destructive";

export type AgentTool = {
	description: string;
	input: z.ZodRawShape;
	access: AgentToolAccess;
	/** works across organizations, so it takes none (the assistant, inside one organization, doesn't get it) */
	everyOrganization?: boolean;
};

export const AGENT_TOOLS = {
	listOrganizations: {
		description:
			"List the Ekra organizations you belong to, with their slugs and your role (owner, admin, trainer, learner or guest). Every other tool needs an organization slug.",
		input: {},
		access: "read",
		everyOrganization: true,
	},
	listLibrary: {
		description: `Find learning content in an organization's library: everything you can see, optionally narrowed by words in the title or description and by kind. At most ${AGENT_LIST_CAP} items; canManage says whether you can change content here.`,
		input: {
			search: z.string().max(200).optional(),
			kind: contentKind.optional(),
			archived: z
				.boolean()
				.optional()
				.describe("true lists archived content instead"),
		},
		access: "read",
	},
	getContent: {
		description:
			"One library item's details (kind, title, description, status, tags). For a course's lessons use getCourse, a quiz's settings getQuiz, a path's steps getPath.",
		input: { id },
		access: "read",
	},
	getCourse: {
		description:
			"A course's outline: its sections and lessons (video, page or quiz), and which you've completed or are still locked.",
		input: { id: id.describe("the course's id") },
		access: "read",
	},
	getQuiz: {
		description:
			"A quiz's settings (pass mark, time limit, attempts allowed), how many questions it has, and your own attempts.",
		input: { id: id.describe("the quiz's id") },
		access: "read",
	},
	getPath: {
		description:
			"A learning path's stages and steps (each a library item), with your progress on each.",
		input: { id: id.describe("the path's id") },
		access: "read",
	},
	myLearning: {
		description:
			"What you've been assigned in an organization, with status, progress and due dates, plus the certificates you've earned there.",
		input: {},
		access: "read",
	},
	listMembers: {
		description:
			"The organization's members with their ids, names, emails and roles (for people who run it). Use the ids with assignContent.",
		input: {},
		access: "read",
	},
	listAssignments: {
		description:
			"Who a library item is assigned to, with each assignment's id, status, progress and dates (for people who run the organization). Use the ids with unassignContent.",
		input: { contentId: id },
		access: "read",
	},
	assignContent: {
		description:
			"Assign a library item to people (member ids from listMembers), optionally with a start and due date. They're told by email.",
		input: {
			contentId: id,
			userIds: z.array(id).min(1).max(AGENT_LIST_CAP),
			startAt: z
				.string()
				.max(40)
				.optional()
				.describe("when it starts (ISO date), default now"),
			dueAt: z.string().max(40).optional().describe("due date (ISO date)"),
		},
		access: "write",
	},
	unassignContent: {
		description:
			"Remove assignments (ids from listAssignments). The people lose that item from their learning, with its progress.",
		input: { ids: z.array(id).min(1).max(AGENT_LIST_CAP) },
		access: "destructive",
	},
	learnerReport: {
		description:
			"How learners are doing (for people who run the organization): total learners, weekly active learners over 8 weeks, and per learner what's assigned, completed, in progress and overdue.",
		input: {},
		access: "read",
	},
	contentReport: {
		description:
			"Completion per library item of one kind (for people who run the organization): learners assigned, completed and percent, and quiz accuracy.",
		input: { kind: contentKind },
		access: "read",
	},
	quizReport: {
		description:
			"A quiz's results (for people who run the organization): submissions, accuracy, how each question went, and each learner's score.",
		input: { id: id.describe("the quiz's id") },
		access: "read",
	},
	createContent: {
		description:
			"Create a draft in the library (for people who run the organization): a page, course, quiz or learning path. Returns its id; it stays a draft until published in Ekra.",
		input: {
			kind: z.enum(["page", "course", "quiz", "path"]),
			title: z.string().trim().min(1).max(200),
			description: z.string().max(2000).optional(),
			parentId: id.optional().describe("a folder's id to put it in"),
		},
		access: "write",
	},
	markDone: {
		description:
			"Mark a page (or other item without lessons) you're learning as done, or not done.",
		input: { contentId: id, done: z.boolean().default(true) },
		access: "write",
	},
} as const satisfies Record<string, AgentTool>;

export type AgentToolName = keyof typeof AGENT_TOOLS;

/** What a tool takes, parsed. */
export type AgentToolArgs<K extends AgentToolName> = z.output<
	z.ZodObject<(typeof AGENT_TOOLS)[K]["input"]>
>;

/** The tools that change something: the assistant asks the person before running them. */
export const AGENT_WRITE_TOOLS = (
	Object.keys(AGENT_TOOLS) as AgentToolName[]
).filter((name) => AGENT_TOOLS[name].access !== "read");
