import {
	courseSection,
	lesson,
	lessonProgress,
	mediaAsset,
	type Tx,
} from "@ekra/db";
import { and, asc, eq, getColumns, ne, type SQL, sql } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { z } from "zod";
import { canManageContent } from "../auth/permissions.ts";
import {
	asMember,
	type Ctx,
	cleanBody,
	findOne,
	manage,
	parse,
	place,
	refuse,
	renumber,
	type SlugId,
} from "./library.ts";
import { markStarted } from "./progress.ts";
import type { ActiveOrg } from "./tenant.ts";

/**
 * A course's outline (sections and lessons in order) and each person's progress. Whoever can see the course in
 * the library can see its lessons; owners, admins and trainers build it. Every query runs inside withOrg (RLS).
 */
export const courseTypeDefs = /* GraphQL */ `
	extend type Query {
		"A course's outline with your progress, or null when you can't see it."
		course(slug: String!, id: ID!): Course
		"One lesson with its text and video, or null when you can't see its course."
		lesson(slug: String!, id: ID!): Lesson
	}

	extend type Mutation {
		addSection(slug: String!, courseId: ID!, title: String!): CourseSection!
		renameSection(slug: String!, id: ID!, title: String!): CourseSection!
		"Deletes the section and its lessons."
		deleteSection(slug: String!, id: ID!): Boolean!
		"Puts a section at this place in the course (0 is first)."
		moveSection(slug: String!, id: ID!, position: Int!): Boolean!
		"A quiz lesson needs quizId: a quiz from the library; passing it completes the lesson."
		addLesson(
			slug: String!
			sectionId: ID!
			kind: LessonKind!
			title: String!
			quizId: ID
		): Lesson!
		renameLesson(slug: String!, id: ID!, title: String!): Lesson!
		deleteLesson(slug: String!, id: ID!): Boolean!
		"Puts a lesson at this place in a section (it may be another section of the same course)."
		moveLesson(slug: String!, id: ID!, sectionId: ID!, position: Int!): Boolean!
		"Save a lesson's text; refused (CONFLICT) on top of a newer one, like saveContentBody."
		saveLessonBody(
			slug: String!
			id: ID!
			doc: String!
			baseBodyUpdatedAt: String
		): Lesson!
		"Mark a lesson done (or not done) for yourself."
		completeLesson(slug: String!, id: ID!, complete: Boolean!): Lesson!
		"Where you stopped in a video, so it resumes there."
		saveLessonPosition(slug: String!, id: ID!, seconds: Int!): Boolean!
	}

	enum LessonKind {
		video
		page
		quiz
	}

	type Course {
		id: ID!
		title: String!
		description: String
		sequential: Boolean!
		sections: [CourseSection!]!
		"Lessons you've completed, out of all of them."
		completedCount: Int!
		lessonCount: Int!
	}

	type CourseSection {
		id: ID!
		title: String!
		position: Int!
		lessons: [Lesson!]!
	}

	type Lesson {
		id: ID!
		courseId: ID!
		sectionId: ID!
		kind: LessonKind!
		title: String!
		position: Int!
		"Tiptap JSON text."
		doc: String
		bodyUpdatedAt: String
		video: LessonVideo
		"A quiz lesson's quiz."
		quizId: ID
		"In a course taken in order: the lessons before it aren't all done yet (never for those who manage it)."
		locked: Boolean!
		completed: Boolean!
		positionSeconds: Int!
	}

	type LessonVideo {
		id: ID!
		"uploading, processing, ready or failed"
		status: String!
		durationSeconds: Int
		"The HLS playlist, once ready."
		playlist: String
		poster: String
		error: String
	}
`;

const title = z.string().trim().min(1, "Give it a title.").max(200);
const MAX_POSITION_SECONDS = 24 * 60 * 60;

type LessonRow = typeof lesson.$inferSelect;
type VideoRow = typeof mediaAsset.$inferSelect;

const videoOf = (v: VideoRow | null) =>
	v && {
		id: v.id,
		status: v.status,
		durationSeconds: v.durationSeconds,
		error: v.error,
		playlist:
			v.status === "ready" ? `/api/media/${v.orgId}/${v.id}/master-m3u8` : null,
		poster:
			v.status === "ready" ? `/api/media/${v.orgId}/${v.id}/poster-webp` : null,
	};

const toLesson = (
	l: Omit<LessonRow, "doc" | "bodyText">,
	video: VideoRow | null,
	progress: { completedAt: Date | null; positionSeconds: number | null },
) => ({
	...l,
	bodyUpdatedAt: l.bodyUpdatedAt?.toISOString() ?? null,
	doc: null as string | null,
	video: videoOf(video),
	locked: false,
	completed: !!progress.completedAt,
	positionSeconds: progress.positionSeconds ?? 0,
});

/** The course when this person may see it, else NOT_FOUND (another organization's, a learner's draft). */
async function visibleCourse(
	tx: Tx,
	org: ActiveOrg,
	userId: string,
	courseId: string,
) {
	const found = await findOne(tx, org, userId, courseId);
	if (found?.item.kind !== "course")
		return refuse("That course doesn't exist or was deleted.", "NOT_FOUND");
	return found.item;
}

/** A lesson's columns without its body: outlines never carry the text (only lesson(id) does). */
const { doc: _doc, bodyText: _bodyText, ...lessonHead } = getColumns(lesson);

/** Lessons with their video and this person's progress, in outline order, without their bodies. */
async function lessonsWhere(tx: Tx, userId: string, where: SQL | undefined) {
	const rows = await tx
		.select({
			lesson: lessonHead,
			video: mediaAsset,
			completedAt: lessonProgress.completedAt,
			positionSeconds: lessonProgress.positionSeconds,
		})
		.from(lesson)
		.leftJoin(mediaAsset, eq(mediaAsset.id, lesson.mediaId))
		.leftJoin(
			lessonProgress,
			and(
				eq(lessonProgress.lessonId, lesson.id),
				eq(lessonProgress.userId, userId),
			),
		)
		.where(where)
		.orderBy(asc(lesson.position));
	return rows.map((r) => toLesson(r.lesson, r.video, r));
}

type OutlineLesson = Awaited<ReturnType<typeof lessonsWhere>>[number];

/**
 * In a course taken in order, a learner's lesson is locked until every lesson before it (sections in order, then
 * lessons) is complete. Those who manage content are never locked.
 */
export function lockedLessons(
	sections: { id: string }[],
	lessons: OutlineLesson[],
	sequential: boolean,
	manager: boolean,
) {
	const locked = new Set<string>();
	if (!sequential || manager) return locked;
	let open = true;
	for (const s of sections)
		for (const l of lessons.filter((x) => x.sectionId === s.id)) {
			if (!open) locked.add(l.id);
			if (!l.completed) open = false;
		}
	return locked;
}

/** The course's sections and lessons in order, with this person's progress and locks. */
async function outline(
	tx: Tx,
	org: ActiveOrg,
	userId: string,
	course: { id: string; sequential: boolean },
) {
	const sections = await tx
		.select()
		.from(courseSection)
		.where(eq(courseSection.courseId, course.id))
		.orderBy(asc(courseSection.position));
	const lessons = await lessonsWhere(
		tx,
		userId,
		eq(lesson.courseId, course.id),
	);
	const locked = lockedLessons(
		sections,
		lessons,
		course.sequential,
		canManageContent(org.role),
	);
	return {
		sections,
		// a locked lesson's video isn't sent to the learner yet
		lessons: lessons.map((l) =>
			locked.has(l.id) ? { ...l, locked: true, video: null } : l,
		),
	};
}

/** A lesson this person may see (its course is visible to them), without its body, else NOT_FOUND. */
async function outlineLesson(
	tx: Tx,
	org: ActiveOrg,
	userId: string,
	id: string,
) {
	const [row] = await tx
		.select({ courseId: lesson.courseId })
		.from(lesson)
		.where(eq(lesson.id, id));
	if (!row) return refuse("That lesson doesn't exist.", "NOT_FOUND");
	const course = await visibleCourse(tx, org, userId, row.courseId);
	const found = (await outline(tx, org, userId, course)).lessons.find(
		(l) => l.id === id,
	);
	return found ?? refuse("That lesson doesn't exist.", "NOT_FOUND");
}

/** The lesson with its body (Tiptap JSON text). */
async function withBody<T extends { id: string }>(tx: Tx, l: T) {
	const [row] = await tx
		.select({ doc: lesson.doc })
		.from(lesson)
		.where(eq(lesson.id, l.id));
	return { ...l, doc: row?.doc ? JSON.stringify(row.doc) : null };
}

/** A lesson this person may see (its course is visible to them), with its body, else NOT_FOUND. */
export async function visibleLesson(
	tx: Tx,
	org: ActiveOrg,
	userId: string,
	id: string,
) {
	return withBody(tx, await outlineLesson(tx, org, userId, id));
}

/** A lesson this person may take now: visible and not locked (no body). */
async function openLesson(tx: Tx, org: ActiveOrg, userId: string, id: string) {
	const found = await outlineLesson(tx, org, userId, id);
	if (found.locked)
		return refuse("Finish the lessons before this one first.", "FORBIDDEN");
	return found;
}

const countWhere = async (
	tx: Tx,
	table: typeof lesson | typeof courseSection,
	where: SQL,
) => {
	const [row] = await tx
		.select({ n: sql<number>`count(*)::int` })
		.from(table)
		.where(where);
	return row?.n ?? 0;
};

type Args<T> = SlugId & T;

export const courseResolvers = {
	Query: {
		course: (_p: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				const found = await findOne(tx, org, userId, id);
				if (found?.item.kind !== "course") return null;
				const { sections, lessons } = await outline(
					tx,
					org,
					userId,
					found.item,
				);
				return {
					...found.item,
					sections: sections.map((s) => ({
						...s,
						lessons: lessons.filter((l) => l.sectionId === s.id),
					})),
					lessonCount: lessons.length,
					completedCount: lessons.filter((l) => l.completed).length,
				};
			}),
		lesson: (_p: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			asMember(ctx, slug, (tx, org, userId) =>
				openLesson(tx, org, userId, id)
					.then((l) => withBody(tx, l))
					.catch((error: unknown) => {
						// "not found" is an answer (null); anything else is a real failure
						if (
							error instanceof GraphQLError &&
							error.extensions.code === "NOT_FOUND"
						)
							return null;
						throw error;
					}),
			),
	},
	Mutation: {
		addSection: (
			_p: unknown,
			args: { slug: string; courseId: string; title: string },
			ctx: Ctx,
		) =>
			manage(ctx, args.slug, async (tx, org, userId) => {
				await visibleCourse(tx, org, userId, args.courseId);
				const position = await countWhere(
					tx,
					courseSection,
					eq(courseSection.courseId, args.courseId),
				);
				const [section] = await tx
					.insert(courseSection)
					.values({
						orgId: org.id,
						courseId: args.courseId,
						title: parse(title, args.title),
						position,
					})
					.returning();
				return { ...section, lessons: [] };
			}),
		renameSection: (_p: unknown, args: Args<{ title: string }>, ctx: Ctx) =>
			manage(ctx, args.slug, async (tx) => {
				const [section] = await tx
					.update(courseSection)
					.set({ title: parse(title, args.title) })
					.where(eq(courseSection.id, args.id))
					.returning();
				if (!section) return refuse("That section doesn't exist.", "NOT_FOUND");
				return { ...section, lessons: [] };
			}),
		deleteSection: (_p: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			manage(ctx, slug, async (tx) => {
				const [gone] = await tx
					.delete(courseSection)
					.where(eq(courseSection.id, id))
					.returning({ courseId: courseSection.courseId });
				if (!gone) return refuse("That section doesn't exist.", "NOT_FOUND");
				const rest = await tx
					.select({ id: courseSection.id })
					.from(courseSection)
					.where(eq(courseSection.courseId, gone.courseId))
					.orderBy(asc(courseSection.position));
				await renumber(
					tx,
					courseSection,
					rest.map((s) => s.id),
				);
				return true;
			}),
		moveSection: (
			_p: unknown,
			{ slug, id, position }: Args<{ position: number }>,
			ctx: Ctx,
		) =>
			manage(ctx, slug, async (tx) => {
				const [section] = await tx
					.select({ courseId: courseSection.courseId })
					.from(courseSection)
					.where(eq(courseSection.id, id));
				if (!section) return refuse("That section doesn't exist.", "NOT_FOUND");
				const others = await tx
					.select({ id: courseSection.id })
					.from(courseSection)
					.where(
						and(
							eq(courseSection.courseId, section.courseId),
							ne(courseSection.id, id),
						),
					)
					.orderBy(asc(courseSection.position));
				await renumber(
					tx,
					courseSection,
					place(
						others.map((s) => s.id),
						id,
						position,
					),
				);
				return true;
			}),
		addLesson: (
			_p: unknown,
			args: {
				slug: string;
				sectionId: string;
				kind: "video" | "page" | "quiz";
				title: string;
				quizId?: string | null;
			},
			ctx: Ctx,
		) =>
			manage(ctx, args.slug, async (tx, org, userId) => {
				const [section] = await tx
					.select({ courseId: courseSection.courseId })
					.from(courseSection)
					.where(eq(courseSection.id, args.sectionId));
				if (!section) return refuse("That section doesn't exist.", "NOT_FOUND");
				const kind = parse(z.enum(["video", "page", "quiz"]), args.kind);
				if (kind === "quiz") {
					const quiz = args.quizId
						? await findOne(tx, org, userId, args.quizId)
						: null;
					if (quiz?.item.kind !== "quiz")
						return refuse("Pick a quiz from the library.", "BAD_USER_INPUT");
				}
				const [created] = await tx
					.insert(lesson)
					.values({
						orgId: org.id,
						courseId: section.courseId,
						sectionId: args.sectionId,
						kind,
						quizId: kind === "quiz" ? args.quizId : null,
						title: parse(title, args.title),
						position: await countWhere(
							tx,
							lesson,
							eq(lesson.sectionId, args.sectionId),
						),
					})
					.returning({ id: lesson.id });
				return visibleLesson(tx, org, userId, created?.id ?? "");
			}),
		renameLesson: (_p: unknown, args: Args<{ title: string }>, ctx: Ctx) =>
			manage(ctx, args.slug, async (tx, org, userId) => {
				const [found] = await tx
					.update(lesson)
					.set({ title: parse(title, args.title) })
					.where(eq(lesson.id, args.id))
					.returning({ id: lesson.id });
				if (!found) return refuse("That lesson doesn't exist.", "NOT_FOUND");
				return visibleLesson(tx, org, userId, args.id);
			}),
		deleteLesson: (_p: unknown, { slug, id }: SlugId, ctx: Ctx) =>
			manage(ctx, slug, async (tx) => {
				const [gone] = await tx
					.delete(lesson)
					.where(eq(lesson.id, id))
					.returning({ sectionId: lesson.sectionId });
				if (!gone) return refuse("That lesson doesn't exist.", "NOT_FOUND");
				const rest = await tx
					.select({ id: lesson.id })
					.from(lesson)
					.where(eq(lesson.sectionId, gone.sectionId))
					.orderBy(asc(lesson.position));
				await renumber(
					tx,
					lesson,
					rest.map((l) => l.id),
				);
				return true;
			}),
		moveLesson: (
			_p: unknown,
			args: Args<{ sectionId: string; position: number }>,
			ctx: Ctx,
		) =>
			manage(ctx, args.slug, async (tx) => {
				const [moving] = await tx
					.select({ courseId: lesson.courseId, from: lesson.sectionId })
					.from(lesson)
					.where(eq(lesson.id, args.id));
				const [target] = await tx
					.select({ courseId: courseSection.courseId })
					.from(courseSection)
					.where(eq(courseSection.id, args.sectionId));
				if (!moving || !target)
					return refuse("That lesson or section doesn't exist.", "NOT_FOUND");
				if (moving.courseId !== target.courseId)
					return refuse("Lessons move within their course.", "BAD_USER_INPUT");
				await tx
					.update(lesson)
					.set({ sectionId: args.sectionId })
					.where(eq(lesson.id, args.id));
				for (const section of new Set([moving.from, args.sectionId])) {
					const others = await tx
						.select({ id: lesson.id })
						.from(lesson)
						.where(and(eq(lesson.sectionId, section), ne(lesson.id, args.id)))
						.orderBy(asc(lesson.position));
					const ids = others.map((l) => l.id);
					await renumber(
						tx,
						lesson,
						section === args.sectionId
							? place(ids, args.id, args.position)
							: ids,
					);
				}
				return true;
			}),
		saveLessonBody: (
			_p: unknown,
			args: Args<{ doc: string; baseBodyUpdatedAt?: string | null }>,
			ctx: Ctx,
		) =>
			manage(ctx, args.slug, async (tx, org, userId) => {
				const body = cleanBody(args.doc);
				// locked until this save commits, so two saves can't both pass the check
				const [current] = await tx
					.select({ bodyUpdatedAt: lesson.bodyUpdatedAt })
					.from(lesson)
					.where(eq(lesson.id, args.id))
					.for("update");
				if (!current) return refuse("That lesson doesn't exist.", "NOT_FOUND");
				if (
					(current.bodyUpdatedAt?.toISOString() ?? null) !==
					(args.baseBodyUpdatedAt ?? null)
				)
					return refuse(
						"Someone else changed this lesson since you opened it.",
						"CONFLICT",
					);
				// shortcut: lessons keep no version history yet (pages do); add it when trainers ask to restore one
				await tx
					.update(lesson)
					.set({
						doc: body.doc,
						bodyText: body.text,
						bodyUpdatedAt: new Date(),
					})
					.where(eq(lesson.id, args.id));
				return visibleLesson(tx, org, userId, args.id);
			}),
		completeLesson: (
			_p: unknown,
			{ slug, id, complete }: Args<{ complete: boolean }>,
			ctx: Ctx,
		) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				const found = await openLesson(tx, org, userId, id);
				// a quiz that's gone, a draft or archived can't be passed: then the lesson can be ticked off
				if (
					found.kind === "quiz" &&
					!canManageContent(org.role) &&
					found.quizId &&
					(await findOne(tx, org, userId, found.quizId))
				)
					return refuse("Pass the quiz to finish this lesson.", "FORBIDDEN");
				const completedAt = complete ? new Date() : null;
				await tx
					.insert(lessonProgress)
					.values({
						orgId: org.id,
						userId,
						lessonId: id,
						courseId: found.courseId,
						completedAt,
					})
					.onConflictDoUpdate({
						target: [lessonProgress.userId, lessonProgress.lessonId],
						set: { completedAt, updatedAt: new Date() },
					});
				if (complete) await markStarted(tx, org.id, userId, found.courseId);
				return visibleLesson(tx, org, userId, id);
			}),
		saveLessonPosition: (
			_p: unknown,
			{ slug, id, seconds }: Args<{ seconds: number }>,
			ctx: Ctx,
		) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				const found = await openLesson(tx, org, userId, id);
				const positionSeconds = Math.max(
					0,
					Math.min(Math.floor(seconds), MAX_POSITION_SECONDS),
				);
				await tx
					.insert(lessonProgress)
					.values({
						orgId: org.id,
						userId,
						lessonId: id,
						courseId: found.courseId,
						positionSeconds,
					})
					.onConflictDoUpdate({
						target: [lessonProgress.userId, lessonProgress.lessonId],
						set: { positionSeconds, updatedAt: new Date() },
					});
				return true;
			}),
	},
};
