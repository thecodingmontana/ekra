import type { ContentItem, ContentKind } from "../graphql/library.ts";
import type { LearningPath, PathStep } from "../graphql/path.ts";

type Stages = Pick<LearningPath, "stages">;

/** The kinds of library item a path can hold, in the order the picker offers them. */
export const STEP_KINDS: ContentKind[] = [
	"course",
	"page",
	"quiz",
	"wiki",
	"assignment",
];

/** Every step of a path in the order learners take them. */
export const allSteps = (path: Stages): PathStep[] =>
	path.stages.flatMap((s) => s.steps);

/** Where to start or continue: the first open step not done yet; null when all are done or none are open. */
export const nextStep = (path: Stages): PathStep | null =>
	allSteps(path).find((s) => s.percent < 100 && !s.locked) ?? null;

/**
 * Library items that can still go in this path: courses, pages, quizzes, wikis and assignments that aren't in it
 * yet (each once per path) and aren't templates, matching the kind ("all" for any) and the search.
 */
export function pickable(
	items: ContentItem[],
	path: Stages,
	kind: ContentKind | "all",
	query: string,
): ContentItem[] {
	const inPath = new Set(allSteps(path).map((s) => s.content.id));
	const q = query.trim().toLowerCase();
	return items.filter(
		(i) =>
			STEP_KINDS.includes(i.kind) &&
			!i.isTemplate &&
			!i.archivedAt &&
			!inPath.has(i.id) &&
			(kind === "all" || i.kind === kind) &&
			(!q || i.title.toLowerCase().includes(q)),
	);
}

/**
 * Where "Move up" / "Move down" sends a step: one place within its stage, or across into the end of the previous
 * stage / the start of the next one. Null when it can't go further.
 */
export function stepTarget(
	path: Stages,
	stepId: string,
	dir: 1 | -1,
): { stageId: string; position: number } | null {
	const si = path.stages.findIndex((s) => s.steps.some((p) => p.id === stepId));
	const stage = path.stages[si];
	if (!stage) return null;
	const inside = stage.steps.findIndex((p) => p.id === stepId) + dir;
	if (inside >= 0 && inside < stage.steps.length)
		return { stageId: stage.id, position: inside };
	const other = path.stages[si + dir];
	if (!other) return null;
	return { stageId: other.id, position: dir === 1 ? 0 : other.steps.length };
}
