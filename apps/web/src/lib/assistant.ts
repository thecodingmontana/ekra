import { AGENT_TOOLS, AGENT_WRITE_TOOLS, type AgentToolName } from "@ekra/core";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

/** The longest message the assistant takes (the server checks it too). */
export const MAX_MESSAGE = 2000;

/** One chat per person per organization; the server uses the same id. */
export const assistantThread = (orgId: string, userId: string) =>
	`${orgId}-${userId}`;

/**
 * The tools that wait for the person's approval, defined as the server defines them (same input schemas), so the
 * chat can show and answer their approval requests.
 */
export const APPROVAL_TOOLS = AGENT_WRITE_TOOLS.map((name) =>
	toolDefinition({
		name,
		description: AGENT_TOOLS[name].description,
		inputSchema: z.object(AGENT_TOOLS[name].input),
		needsApproval: true,
	}),
);

const STEPS: Record<AgentToolName, [string, string]> = {
	listOrganizations: ["Looking at organizations", "Looked at organizations"],
	listLibrary: ["Searching the library", "Searched the library"],
	getContent: ["Opening an item", "Opened an item"],
	getCourse: ["Reading a course", "Read a course"],
	getQuiz: ["Reading a quiz", "Read a quiz"],
	getPath: ["Reading a learning path", "Read a learning path"],
	myLearning: ["Looking at your learning", "Looked at your learning"],
	listMembers: ["Looking at people", "Looked at people"],
	listAssignments: ["Looking at assignments", "Looked at assignments"],
	assignContent: ["Assigning", "Assigned"],
	unassignContent: ["Removing assignments", "Removed assignments"],
	learnerReport: ["Reading the learners report", "Read the learners report"],
	contentReport: ["Reading the content report", "Read the content report"],
	quizReport: ["Reading quiz results", "Read quiz results"],
	createContent: ["Creating a draft", "Created a draft"],
	markDone: ["Marking it done", "Marked it done"],
};

/** What a tool step reads as, while it runs and once it's done. */
export function stepLabel(name: string, done: boolean) {
	const step = STEPS[name as AgentToolName];
	return step ? step[done ? 1 : 0] : name;
}

/**
 * Names for the ids the assistant has seen (library items, people, assignments), from its earlier tool results,
 * so an approval card can say what it's about instead of showing ids.
 */
export function namesFrom(outputs: unknown[]) {
	const names = new Map<string, string>();
	const walk = (value: unknown, depth: number) => {
		if (depth > 6 || !value || typeof value !== "object") return;
		if (Array.isArray(value)) {
			for (const v of value) walk(v, depth + 1);
			return;
		}
		const row = value as Record<string, unknown>;
		const label = row.title ?? row.name;
		if (typeof row.id === "string" && typeof label === "string")
			names.set(row.id, label);
		for (const v of Object.values(row)) walk(v, depth + 1);
	};
	for (const output of outputs)
		walk(typeof output === "string" ? safeJson(output) : output, 0);
	return names;
}

const safeJson = (text: string) => {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
};

const plural = (n: number, one: string, many: string) =>
	`${n} ${n === 1 ? one : many}`;

/** The approval card's title and lines for a change the assistant wants to make. */
export function describeChange(
	tool: string,
	args: Record<string, unknown>,
	names: Map<string, string>,
): { title: string; lines: string[] } {
	const name = (id: unknown) =>
		typeof id === "string" ? (names.get(id) ?? id) : "";
	const ids = (list: unknown) =>
		Array.isArray(list) ? list.map(name) : ([] as string[]);
	if (tool === "assignContent") {
		const people = ids(args.userIds);
		return {
			title: `Assign “${name(args.contentId)}” to ${plural(people.length, "person", "people")}?`,
			lines: [
				...people.slice(0, 8),
				...(people.length > 8 ? [`and ${people.length - 8} more`] : []),
				...(args.startAt
					? [`Starts ${String(args.startAt).slice(0, 10)}`]
					: []),
				...(args.dueAt ? [`Due ${String(args.dueAt).slice(0, 10)}`] : []),
				"They're told by email.",
			],
		};
	}
	if (tool === "unassignContent") {
		const list = ids(args.ids);
		return {
			title: `Remove ${plural(list.length, "assignment", "assignments")}?`,
			lines: ["Their progress on it is removed too."],
		};
	}
	if (tool === "createContent")
		return {
			title: `Create a draft ${String(args.kind ?? "item")}?`,
			lines: [
				`“${String(args.title ?? "")}”`,
				"It stays a draft until someone publishes it.",
			],
		};
	if (tool === "markDone")
		return {
			title:
				args.done === false
					? `Mark “${name(args.contentId)}” as not done?`
					: `Mark “${name(args.contentId)}” as done?`,
			lines: [],
		};
	return { title: `Run ${tool}?`, lines: [] };
}
