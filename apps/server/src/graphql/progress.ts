import {
	contentCompletion,
	contentItem,
	contentView,
	lesson,
	lessonProgress,
	pathStep,
	quizAttempt,
	type Tx,
} from "@ekra/db";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

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
	const out = new Map<string, Progress>(userIds.map((u) => [u, NONE]));
	if (!userIds.length) return out;

	if (item.kind === "course") {
		const [{ total = 0 } = {}] = await tx
			.select({ total: sql<number>`count(*)::int` })
			.from(lesson)
			.where(eq(lesson.courseId, item.id));
		const rows = await tx
			.select({
				userId: lessonProgress.userId,
				done: sql<number>`count(${lessonProgress.completedAt})::int`,
			})
			.from(lessonProgress)
			.where(
				and(
					eq(lessonProgress.courseId, item.id),
					inArray(lessonProgress.userId, userIds),
				),
			)
			.groupBy(lessonProgress.userId);
		for (const r of rows)
			out.set(r.userId, {
				percent: total
					? Math.round((Math.min(r.done, total) / total) * 100)
					: 0,
				started: true,
			});
		return out;
	}

	if (item.kind === "quiz") {
		const rows = await tx
			.select({
				userId: quizAttempt.userId,
				// passed, or finished a quiz that has no pass mark
				done: sql<boolean>`bool_or(${quizAttempt.passed} or (${quizAttempt.passed} is null and ${quizAttempt.submittedAt} is not null))`,
			})
			.from(quizAttempt)
			.where(
				and(
					eq(quizAttempt.quizId, item.id),
					inArray(quizAttempt.userId, userIds),
				),
			)
			.groupBy(quizAttempt.userId);
		for (const r of rows)
			out.set(r.userId, { percent: r.done ? 100 : 0, started: true });
		return out;
	}

	if (item.kind === "path") {
		const steps = await tx
			.select({ id: contentItem.id, kind: contentItem.kind })
			.from(pathStep)
			.innerJoin(contentItem, eq(contentItem.id, pathStep.contentId))
			// a path inside a path isn't followed (no loops)
			.where(
				and(eq(pathStep.pathId, item.id), sql`${contentItem.kind} <> 'path'`),
			);
		if (!steps.length) return out;
		const perStep = await Promise.all(
			steps.map((s) => progressOf(tx, s, userIds)),
		);
		for (const u of userIds) {
			const each = perStep.map((m) => m.get(u) ?? NONE);
			out.set(u, {
				percent: Math.round(
					each.reduce((sum, p) => sum + p.percent, 0) / each.length,
				),
				started: each.some((p) => p.started),
			});
		}
		return out;
	}

	// pages, wikis, assignments: done when marked done; started once opened
	const done = await tx
		.select({ userId: contentCompletion.userId })
		.from(contentCompletion)
		.where(
			and(
				eq(contentCompletion.contentId, item.id),
				inArray(contentCompletion.userId, userIds),
			),
		);
	const opened = await tx
		.select({ userId: contentView.userId })
		.from(contentView)
		.where(
			and(
				eq(contentView.contentId, item.id),
				inArray(contentView.userId, userIds),
				isNotNull(contentView.viewedAt),
			),
		);
	for (const r of opened) out.set(r.userId, { percent: 0, started: true });
	for (const r of done) out.set(r.userId, { percent: 100, started: true });
	return out;
}
