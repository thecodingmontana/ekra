import { pathStage, pathStep, type Tx } from "@ekra/db";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { canManageContent } from "../auth/permissions.ts";
import {
	asMember,
	type Ctx,
	findMany,
	findOne,
	manage,
	parse,
	place,
	refuse,
	renumber,
	type SlugId,
	toGraphQL,
} from "./library.ts";
import { progressOfAll } from "./progress.ts";
import type { ActiveOrg } from "./tenant.ts";

/**
 * Learning paths (content of kind path): stages in order, each with library items to take. A path taken in order
 * (content_item.sequential) opens each step when the ones before are done. Inside withOrg (RLS).
 */
export const pathTypeDefs = /* GraphQL */ `
	extend type Query {
		"A path's stages and steps with your progress, or null when you can't see it."
		path(slug: String!, id: ID!): LearningPath
	}

	extend type Mutation {
		addStage(slug: String!, pathId: ID!, title: String!): PathStage!
		renameStage(slug: String!, id: ID!, title: String!): PathStage!
		"Deletes the stage and its steps (the content itself stays in the library)."
		deleteStage(slug: String!, id: ID!): Boolean!
		"Adds a library item to a stage (a course, page, quiz, wiki or assignment; each once per path)."
		addStep(slug: String!, stageId: ID!, contentId: ID!): PathStep!
		removeStep(slug: String!, id: ID!): Boolean!
		"Puts a step at this place in a stage (it may be another stage of the same path)."
		moveStep(slug: String!, id: ID!, stageId: ID!, position: Int!): Boolean!
	}

	type LearningPath {
		id: ID!
		title: String!
		sequential: Boolean!
		stages: [PathStage!]!
		"The path's progress for you, in percent."
		percent: Int!
	}

	type PathStage {
		id: ID!
		title: String!
		position: Int!
		steps: [PathStep!]!
	}

	type PathStep {
		id: ID!
		position: Int!
		content: ContentItem!
		percent: Int!
		"In a path taken in order: the steps before it aren't all done (never for those who manage it)."
		locked: Boolean!
	}
`;

const title = z.string().trim().min(1, "Give it a title.").max(200);
const STEP_KINDS = new Set(["course", "page", "quiz", "wiki", "assignment"]);

async function visiblePath(tx: Tx, org: ActiveOrg, userId: string, id: string) {
	const found = await findOne(tx, org, userId, id);
	if (found?.item.kind !== "path")
		return refuse("That path doesn't exist or was deleted.", "NOT_FOUND");
	return found.item;
}

type Args<T> = { slug: string } & T;

export const pathResolvers = {
	Query: {
		path: (_p: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				const found = await findOne(tx, org, userId, id);
				if (found?.item.kind !== "path") return null;
				const stages = await tx
					.select()
					.from(pathStage)
					.where(eq(pathStage.pathId, id))
					.orderBy(asc(pathStage.position));
				const steps = await tx
					.select()
					.from(pathStep)
					.where(eq(pathStep.pathId, id))
					.orderBy(asc(pathStep.position));
				const manager = canManageContent(org.role);
				// a step a learner can't see (a draft, archived) isn't listed to them
				const items = await findMany(
					tx,
					org,
					userId,
					steps.map((s) => s.contentId),
				);
				const progress = await progressOfAll(
					tx,
					[...items.values()].map((i) => i.item),
					[userId],
				);
				let open = true;
				let total = 0;
				const outStages = [];
				for (const stage of stages) {
					const outSteps = [];
					for (const step of steps.filter((s) => s.stageId === stage.id)) {
						const item = items.get(step.contentId);
						if (!item) continue;
						const percent =
							progress.get(step.contentId)?.get(userId)?.percent ?? 0;
						const locked = found.item.sequential && !manager && !open;
						if (percent < 100) open = false;
						total += percent;
						outSteps.push({
							...step,
							content: toGraphQL(item),
							percent,
							locked,
						});
					}
					outStages.push({ ...stage, steps: outSteps });
				}
				const count = outStages.reduce((n, s) => n + s.steps.length, 0);
				return {
					...found.item,
					stages: outStages,
					percent: count ? Math.round(total / count) : 0,
				};
			}),
	},
	Mutation: {
		addStage: (
			_p: unknown,
			args: Args<{ pathId: string; title: string }>,
			ctx: Ctx,
		) =>
			manage(ctx, args.slug, async (tx, org, userId) => {
				await visiblePath(tx, org, userId, args.pathId);
				const count = (
					await tx
						.select({ id: pathStage.id })
						.from(pathStage)
						.where(eq(pathStage.pathId, args.pathId))
				).length;
				const [stage] = await tx
					.insert(pathStage)
					.values({
						orgId: org.id,
						pathId: args.pathId,
						title: parse(title, args.title),
						position: count,
					})
					.returning();
				return { ...stage, steps: [] };
			}),
		renameStage: (
			_p: unknown,
			args: Args<{ id: string; title: string }>,
			ctx: Ctx,
		) =>
			manage(ctx, args.slug, async (tx) => {
				const [stage] = await tx
					.update(pathStage)
					.set({ title: parse(title, args.title) })
					.where(eq(pathStage.id, args.id))
					.returning();
				if (!stage) return refuse("That stage doesn't exist.", "NOT_FOUND");
				return { ...stage, steps: [] };
			}),
		deleteStage: (_p: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			manage(ctx, slug, async (tx) => {
				const [gone] = await tx
					.delete(pathStage)
					.where(eq(pathStage.id, id))
					.returning({ pathId: pathStage.pathId });
				if (!gone) return refuse("That stage doesn't exist.", "NOT_FOUND");
				const rest = await tx
					.select({ id: pathStage.id })
					.from(pathStage)
					.where(eq(pathStage.pathId, gone.pathId))
					.orderBy(asc(pathStage.position));
				await renumber(
					tx,
					pathStage,
					rest.map((s) => s.id),
				);
				return true;
			}),
		addStep: (
			_p: unknown,
			args: Args<{ stageId: string; contentId: string }>,
			ctx: Ctx,
		) =>
			manage(ctx, args.slug, async (tx, org, userId) => {
				const [stage] = await tx
					.select({ pathId: pathStage.pathId })
					.from(pathStage)
					.where(eq(pathStage.id, args.stageId));
				if (!stage) return refuse("That stage doesn't exist.", "NOT_FOUND");
				const item = await findOne(tx, org, userId, args.contentId);
				if (!item || !STEP_KINDS.has(item.item.kind))
					return refuse(
						"Add a course, page, quiz, wiki or assignment from the library.",
						"BAD_USER_INPUT",
					);
				const [already] = await tx
					.select({ id: pathStep.id })
					.from(pathStep)
					.where(
						and(
							eq(pathStep.pathId, stage.pathId),
							eq(pathStep.contentId, args.contentId),
						),
					);
				if (already)
					return refuse("That's in this path already.", "BAD_USER_INPUT");
				const count = (
					await tx
						.select({ id: pathStep.id })
						.from(pathStep)
						.where(eq(pathStep.stageId, args.stageId))
				).length;
				const [step] = await tx
					.insert(pathStep)
					.values({
						orgId: org.id,
						pathId: stage.pathId,
						stageId: args.stageId,
						contentId: args.contentId,
						position: count,
					})
					.returning();
				if (!step) return refuse("Couldn't add it.", "INTERNAL");
				return {
					...step,
					content: toGraphQL(item),
					percent: 0,
					locked: false,
				};
			}),
		removeStep: (_p: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			manage(ctx, slug, async (tx) => {
				const [gone] = await tx
					.delete(pathStep)
					.where(eq(pathStep.id, id))
					.returning({ stageId: pathStep.stageId });
				if (!gone) return refuse("That step doesn't exist.", "NOT_FOUND");
				const rest = await tx
					.select({ id: pathStep.id })
					.from(pathStep)
					.where(eq(pathStep.stageId, gone.stageId))
					.orderBy(asc(pathStep.position));
				await renumber(
					tx,
					pathStep,
					rest.map((s) => s.id),
				);
				return true;
			}),
		moveStep: (
			_p: unknown,
			args: Args<{ id: string; stageId: string; position: number }>,
			ctx: Ctx,
		) =>
			manage(ctx, args.slug, async (tx) => {
				const [moving] = await tx
					.select({ pathId: pathStep.pathId, from: pathStep.stageId })
					.from(pathStep)
					.where(eq(pathStep.id, args.id));
				const [target] = await tx
					.select({ pathId: pathStage.pathId })
					.from(pathStage)
					.where(eq(pathStage.id, args.stageId));
				if (!moving || !target)
					return refuse("That step or stage doesn't exist.", "NOT_FOUND");
				if (moving.pathId !== target.pathId)
					return refuse("Steps move within their path.", "BAD_USER_INPUT");
				await tx
					.update(pathStep)
					.set({ stageId: args.stageId })
					.where(eq(pathStep.id, args.id));
				for (const stage of new Set([moving.from, args.stageId])) {
					const others = (
						await tx
							.select({ id: pathStep.id })
							.from(pathStep)
							.where(and(eq(pathStep.stageId, stage), ne(pathStep.id, args.id)))
							.orderBy(asc(pathStep.position))
					).map((s) => s.id);
					await renumber(
						tx,
						pathStep,
						stage === args.stageId
							? place(others, args.id, args.position)
							: others,
					);
				}
				return true;
			}),
	},
};
