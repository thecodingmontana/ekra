/**
 * Who is taking what: enrollments (a learner assigned to a course, path, quiz or page, with dates) and completion
 * of content that has no lessons or attempts of its own (pages, wikis: "Mark as done"). Tenant tables (org_id +
 * the row-level policy, inside withOrg).
 */
import {
	index,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	unique,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";
import { id, idRef, moment } from "./columns.ts";
import { contentItem, tenantPolicy } from "./content.ts";

export const enrollmentSource = pgEnum("enrollment_source", [
	"assigned",
	"self",
]);

export const enrollment = pgTable(
	"enrollment",
	{
		id: id(),
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		contentId: idRef("content_id")
			.notNull()
			.references(() => contentItem.id, { onDelete: "cascade" }),
		userId: idRef("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		source: enrollmentSource("source").notNull().default("assigned"),
		/** who assigned it (null when the learner enrolled themselves, or that person left) */
		assignedBy: idRef("assigned_by").references(() => user.id, {
			onDelete: "set null",
		}),
		startAt: moment("start_at").defaultNow().notNull(),
		/** null: no due date */
		dueAt: moment("due_at"),
		/** the last reminder sent, so reminders can't be sent too often */
		remindedAt: moment("reminded_at"),
		createdAt: moment("created_at").defaultNow().notNull(),
	},
	(table) => [
		unique("enrollment_person_content").on(table.contentId, table.userId),
		index("enrollment_user_idx").on(table.userId),
		tenantPolicy("enrollment"),
	],
).enableRLS();

/** A page or wiki someone finished ("Mark as done"); courses, quizzes and paths work theirs out from their parts. */
export const contentCompletion = pgTable(
	"content_completion",
	{
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: idRef("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		contentId: idRef("content_id")
			.notNull()
			.references(() => contentItem.id, { onDelete: "cascade" }),
		completedAt: moment("completed_at").defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.contentId] }),
		tenantPolicy("content_completion"),
	],
).enableRLS();

/**
 * A certificate for finishing a course, path or quiz. Its id (16 random characters) is the public verification
 * code: anyone with the link can check it, without signing in.
 */
export const certificate = pgTable(
	"certificate",
	{
		id: id(),
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: idRef("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		contentId: idRef("content_id")
			.notNull()
			.references(() => contentItem.id, { onDelete: "cascade" }),
		/** the name and title as they were when issued, so the certificate reads the same later */
		name: text("name").notNull(),
		title: text("title").notNull(),
		issuedAt: moment("issued_at").defaultNow().notNull(),
	},
	(table) => [
		unique("certificate_person_content").on(table.userId, table.contentId),
		tenantPolicy("certificate"),
	],
).enableRLS();
