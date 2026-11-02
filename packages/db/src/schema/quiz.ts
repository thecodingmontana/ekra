/**
 * Quizzes: a quiz is a piece of content (content_item, kind quiz) with its settings here, its questions in order,
 * and each person's attempts. Questions' payloads hold the right answers; learners only ever get them through
 * publicQuestion (@ekra/core). Tenant tables like the library (org_id + the row-level policy, inside withOrg).
 */
import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";
import { id, idRef, moment, timestamps } from "./columns.ts";
import { contentItem, tenantPolicy } from "./content.ts";

export const showAnswers = pgEnum("quiz_show_answers", [
	"never",
	"after_each",
	"at_end",
]);
export const questionKind = pgEnum("quiz_question_kind", [
	"multiple_choice",
	"fill_blank",
	"hotspot",
]);

export const quiz = pgTable(
	"quiz",
	{
		/** the quiz's content item */
		contentId: idRef("content_id")
			.primaryKey()
			.references(() => contentItem.id, { onDelete: "cascade" }),
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		/** the share of points needed to pass (0–100); null: no pass mark */
		passPercent: integer("pass_percent"),
		/** null: no time limit */
		timeLimitSeconds: integer("time_limit_seconds"),
		/** null: as many tries as they like */
		maxAttempts: integer("max_attempts"),
		/** ask this many questions picked at random from all of them; null: all of them */
		poolSize: integer("pool_size"),
		shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
		shuffleOptions: boolean("shuffle_options").notNull().default(true),
		showAnswers: showAnswers("show_answers").notNull().default("at_end"),
		passMessage: text("pass_message"),
		failMessage: text("fail_message"),
		updatedAt: moment("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdateFn(() => new Date()),
	},
	() => [tenantPolicy("quiz")],
).enableRLS();

export const quizQuestion = pgTable(
	"quiz_question",
	{
		id: id(),
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		quizId: idRef("quiz_id")
			.notNull()
			.references(() => contentItem.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		kind: questionKind("kind").notNull(),
		/** what's asked */
		prompt: text("prompt").notNull(),
		/** a picture shown with the question (from the image pipeline) */
		image: text("image"),
		/** the choices, blanks or areas, with the right answers (QuestionPayload in @ekra/core) */
		payload: jsonb("payload").notNull(),
		points: integer("points").notNull().default(1),
		required: boolean("required").notNull().default(true),
		/** shown after answering, when the quiz shows answers */
		explanation: text("explanation"),
		...timestamps,
	},
	(table) => [
		index("quiz_question_quiz_idx").on(table.quizId, table.position),
		tenantPolicy("quiz_question"),
	],
).enableRLS();

export const quizAttempt = pgTable(
	"quiz_attempt",
	{
		id: id(),
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		quizId: idRef("quiz_id")
			.notNull()
			.references(() => contentItem.id, { onDelete: "cascade" }),
		userId: idRef("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** the questions this attempt asks, in the order it asks them */
		questionIds: text("question_ids").array().notNull(),
		/** question id → the learner's answer (QuestionAnswer in @ekra/core) */
		answers: jsonb("answers")
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		startedAt: moment("started_at").defaultNow().notNull(),
		/** when time runs out, if the quiz has a limit */
		deadline: moment("deadline"),
		submittedAt: moment("submitted_at"),
		score: integer("score"),
		maxScore: integer("max_score"),
		passed: boolean("passed"),
	},
	(table) => [
		index("quiz_attempt_user_idx").on(table.quizId, table.userId),
		tenantPolicy("quiz_attempt"),
	],
).enableRLS();
