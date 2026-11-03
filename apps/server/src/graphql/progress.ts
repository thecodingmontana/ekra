import {
	contentCompletion,
	contentItem,
	contentView,
	enrollment,
	lesson,
	lessonProgress,
	pathStep,
	quizAttempt,
	type Tx,
} from "@ekra/db";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { learnerVisible } from "./library.ts";

/**
 * Taking something counts as starting it: it then shows in the person's learning. An assignment they already have
 * stays as it is. A quiz that's a lesson in a course isn't added on its own (the course shows instead).
 */
export async function markStarted(
	tx: Tx,
	orgId: string,
	userId: string,
	contentId: string,
) {
	const [inCourse] = await tx
		.select({ id: lesson.id })
		.from(lesson)
		.where(eq(lesson.quizId, contentId))
		.limit(1);
	if (inCourse) return;
	await tx
		.insert(enrollment)
		.values({ orgId, contentId, userId, source: "self" })
		.onConflictDoNothing();
}

/** How far one person is with one piece of content. */
export type Progress = { percent: number; started: boolean };

const NONE: Progress = { percent: 0, started: false };

/**
 * Each person's progress with one piece of content, worked out from what they did: a course from its lessons, a
 * quiz from its attempts, a path from its steps, anything else from "Mark as done". Runs inside withOrg.
 */
export async function progressOf(
	tx: Tx,
	item: { id: string; kind: string },
	userIds: string[],
): Promise<Map<string, Progress>> {
	return (
		(await progressOfAll(tx, [item], userIds)).get(item.id) ??
		new Map(userIds.map((u) => [u, NONE]))
	);
}

/** The same for many pieces of content at once, a few queries per kind: item id → person → progress. */
export async function progressOfAll(
	tx: Tx,
	items: { id: string; kind: string }[],
	userIds: string[],
): Promise<Map<string, Map<string, Progress>>> {
	const out = new Map(
		items.map((i) => [
			i.id,
			new Map<string, Progress>(userIds.map((u) => [u, NONE])),
		]),
	);
	if (!userIds.length || !items.length) return out;
	const set = (itemId: string, userId: string, p: Progress) =>
		out.get(itemId)?.set(userId, p);
	const ofKind = (...kinds: string[]) => [
		...new Set(items.filter((i) => kinds.includes(i.kind)).map((i) => i.id)),
	];

	const courses = ofKind("course");
	if (courses.length) {
		const totals = new Map(
			(
				await tx
					.select({
						courseId: lesson.courseId,
						total: sql<number>`count(*)::int`,
					})
					.from(lesson)
					.where(inArray(lesson.courseId, courses))
					.groupBy(lesson.courseId)
			).map((r) => [r.courseId, r.total]),
		);
		const rows = await tx
			.select({
				courseId: lessonProgress.courseId,
				userId: lessonProgress.userId,
				done: sql<number>`count(${lessonProgress.completedAt})::int`,
			})
			.from(lessonProgress)
			.where(
				and(
					inArray(lessonProgress.courseId, courses),
					inArray(lessonProgress.userId, userIds),
				),
			)
			.groupBy(lessonProgress.courseId, lessonProgress.userId);
		for (const r of rows) {
			const total = totals.get(r.courseId) ?? 0;
			set(r.courseId, r.userId, {
				percent: total
					? Math.round((Math.min(r.done, total) / total) * 100)
					: 0,
				started: true,
			});
		}
	}

	const quizzes = ofKind("quiz");
	if (quizzes.length) {
		const rows = await tx
			.select({
				quizId: quizAttempt.quizId,
				userId: quizAttempt.userId,
				// passed, or finished a quiz that has no pass mark
				done: sql<boolean>`bool_or(${quizAttempt.passed} or (${quizAttempt.passed} is null and ${quizAttempt.submittedAt} is not null))`,
			})
			.from(quizAttempt)
			.where(
				and(
					inArray(quizAttempt.quizId, quizzes),
					inArray(quizAttempt.userId, userIds),
				),
			)
			.groupBy(quizAttempt.quizId, quizAttempt.userId);
		for (const r of rows)
			set(r.quizId, r.userId, { percent: r.done ? 100 : 0, started: true });
	}

	const paths = ofKind("path");
	if (paths.length) {
		const steps = await tx
			.select({
				pathId: pathStep.pathId,
				id: contentItem.id,
				kind: contentItem.kind,
			})
			.from(pathStep)
			.innerJoin(contentItem, eq(contentItem.id, pathStep.contentId))
			.where(
				and(
					inArray(pathStep.pathId, paths),
					// a path inside a path isn't followed (no loops)
					sql`${contentItem.kind} <> 'path'`,
					// only steps learners can see count
					learnerVisible(),
				),
			);
		const perStep = await progressOfAll(tx, steps, userIds);
		for (const pathId of paths) {
			const mine = steps.filter((s) => s.pathId === pathId);
			if (!mine.length) continue;
			for (const u of userIds) {
				const each = mine.map((s) => perStep.get(s.id)?.get(u) ?? NONE);
				set(pathId, u, {
					percent: Math.round(
						each.reduce((sum, p) => sum + p.percent, 0) / each.length,
					),
					started: each.some((p) => p.started),
				});
			}
		}
	}

	// pages, wikis, assignments: done when marked done; started once opened
	const marked = [
		...new Set(
			items
				.filter((i) => !["course", "quiz", "path"].includes(i.kind))
				.map((i) => i.id),
		),
	];
	if (!marked.length) return out;
	const done = await tx
		.select({
			contentId: contentCompletion.contentId,
			userId: contentCompletion.userId,
		})
		.from(contentCompletion)
		.where(
			and(
				inArray(contentCompletion.contentId, marked),
				inArray(contentCompletion.userId, userIds),
			),
		);
	const opened = await tx
		.select({ contentId: contentView.contentId, userId: contentView.userId })
		.from(contentView)
		.where(
			and(
				inArray(contentView.contentId, marked),
				inArray(contentView.userId, userIds),
				isNotNull(contentView.viewedAt),
			),
		);
	for (const r of opened)
		set(r.contentId, r.userId, { percent: 0, started: true });
	for (const r of done)
		set(r.contentId, r.userId, { percent: 100, started: true });
	return out;
}
