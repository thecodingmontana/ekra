/**
 * A course's outline: sections in order, lessons in order inside them, and each person's progress through them.
 * Tenant tables like the library (org_id + the row-level policy, read and written inside withOrg).
 */
import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";
import { id, idRef, moment, timestamps } from "./columns.ts";
import { contentItem, mediaAsset, tenantPolicy } from "./content.ts";

export const lessonKind = pgEnum("lesson_kind", ["video", "page", "quiz"]);

export const courseSection = pgTable(
	"course_section",
	{
		id: id(),
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		courseId: idRef("course_id")
			.notNull()
			.references(() => contentItem.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		/** order in the course, from 0 */
		position: integer("position").notNull(),
		...timestamps,
	},
	(table) => [
		index("course_section_course_idx").on(table.courseId, table.position),
		tenantPolicy("course_section"),
	],
).enableRLS();

export const lesson = pgTable(
	"lesson",
	{
		id: id(),
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		courseId: idRef("course_id")
			.notNull()
			.references(() => contentItem.id, { onDelete: "cascade" }),
		sectionId: idRef("section_id")
			.notNull()
			.references(() => courseSection.id, { onDelete: "cascade" }),
		kind: lessonKind("kind").notNull(),
		title: text("title").notNull(),
		/** order in its section, from 0 */
		position: integer("position").notNull(),
		/** the lesson's text (Tiptap JSON checked by checkDoc): a reading lesson, or notes under a video */
		doc: jsonb("doc"),
		bodyText: text("body_text"),
		bodyUpdatedAt: moment("body_updated_at"),
		/** a quiz lesson's quiz (a library item of kind quiz); passing it completes the lesson */
		quizId: idRef("quiz_id").references(() => contentItem.id, {
			onDelete: "set null",
		}),
		/** a video lesson's video, once uploaded */
		mediaId: idRef("media_id").references(() => mediaAsset.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(table) => [
		index("lesson_section_idx").on(table.sectionId, table.position),
		index("lesson_course_idx").on(table.courseId),
		tenantPolicy("lesson"),
	],
).enableRLS();

/** One person's progress in one lesson: where they stopped watching, and when they finished it. */
export const lessonProgress = pgTable(
	"lesson_progress",
	{
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: idRef("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		lessonId: idRef("lesson_id")
			.notNull()
			.references(() => lesson.id, { onDelete: "cascade" }),
		courseId: idRef("course_id")
			.notNull()
			.references(() => contentItem.id, { onDelete: "cascade" }),
		/** seconds into the video where they left off */
		positionSeconds: integer("position_seconds").notNull().default(0),
		completedAt: moment("completed_at"),
		updatedAt: moment("updated_at").defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.lessonId] }),
		index("lesson_progress_course_idx").on(table.userId, table.courseId),
		tenantPolicy("lesson_progress"),
	],
).enableRLS();
