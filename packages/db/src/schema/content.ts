/**
 * An organization's learning content (Phase 2's library). Every tenant table has org_id and this row-level policy:
 * the app reads and writes it as the ekra_app role inside withOrg() (see ../tenant.ts), and Postgres only lets it
 * see and write rows of the organization that transaction is for.
 */
import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgPolicy,
	pgTable,
	primaryKey,
	text,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";
import { id, idRef, moment, timestamps } from "./columns.ts";

/** The role tenant queries run as; created by migration, no login of its own. */
export const APP_ROLE = "ekra_app";

/** this row belongs to the organization the current transaction is for */
export const tenantPolicy = (table: string) =>
	pgPolicy(`${table}_tenant`, {
		for: "all",
		to: APP_ROLE,
		using: sql`org_id = current_setting('app.org_id', true)`,
		withCheck: sql`org_id = current_setting('app.org_id', true)`,
	});

export const contentKind = pgEnum("content_kind", [
	"folder",
	"page",
	"course",
	"quiz",
	"assignment",
	"path",
	"wiki",
]);

export const contentStatus = pgEnum("content_status", ["draft", "published"]);

export const contentItem = pgTable(
	"content_item",
	{
		id: id(),
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		kind: contentKind("kind").notNull(),
		title: text("title").notNull(),
		description: text("description"),
		status: contentStatus("status").notNull().default("draft"),
		/** the folder it sits in; null at the top of the library */
		parentId: idRef("parent_id").references((): AnyPgColumn => contentItem.id, {
			onDelete: "set null",
		}),
		/** a starting point others copy ("Use template"); learners never see templates */
		isTemplate: boolean("is_template").notNull().default(false),
		/** categories people filter by ("Onboarding", "Safety"), as typed by trainers */
		tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
		/** a cover picture from the image pipeline (/api/media/…), shown on cards */
		cover: text("cover"),
		/** courses and paths: learners take the parts in order (each unlocks when the one before is done) */
		sequential: boolean("sequential").notNull().default(false),
		/** the body (Tiptap JSON, checked by checkDoc in @ekra/core); null until someone writes in it */
		doc: jsonb("doc"),
		/** the body as plain text, for search and the version history's "what changed" */
		bodyText: text("body_text"),
		/** when the body last changed: an editor saving on top of an older body is refused (not title or status edits) */
		bodyUpdatedAt: moment("body_updated_at"),
		createdBy: idRef("created_by").references(() => user.id, {
			onDelete: "set null",
		}),
		/** archived content leaves the library but isn't deleted */
		archivedAt: moment("archived_at"),
		...timestamps,
	},
	(table) => [
		index("content_item_org_idx").on(table.orgId, table.updatedAt),
		index("content_item_parent_idx").on(table.parentId),
		index("content_item_tags_idx").using("gin", table.tags),
		tenantPolicy("content_item"),
	],
).enableRLS();

/** Someone's starred content. */
export const contentFavorite = pgTable(
	"content_favorite",
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
		createdAt: moment("created_at").defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.contentId] }),
		tenantPolicy("content_favorite"),
	],
).enableRLS();

/** When someone last opened a piece of content (the library's Recent view). */
export const contentView = pgTable(
	"content_view",
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
		viewedAt: moment("viewed_at").defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.contentId] }),
		index("content_view_user_idx").on(table.userId, table.viewedAt),
		tenantPolicy("content_view"),
	],
).enableRLS();

/**
 * Earlier states of a piece of content's body. Saves by the same person within a few minutes update one version,
 * so the history reads like sittings, not keystrokes.
 */
export const contentVersion = pgTable(
	"content_version",
	{
		id: id(),
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		contentId: idRef("content_id")
			.notNull()
			.references(() => contentItem.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		doc: jsonb("doc").notNull(),
		bodyText: text("body_text").notNull(),
		authorId: idRef("author_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(table) => [
		index("content_version_content_idx").on(table.contentId, table.updatedAt),
		tenantPolicy("content_version"),
	],
).enableRLS();

/**
 * A picture uploaded to an organization, stored as the sizes the image pipeline made (@ekra/media) under
 * media/<org_id>/<id>/ in storage. The original upload is never kept or served.
 */
export const mediaKind = pgEnum("media_kind", ["image", "video"]);
/** a video is uploaded, then processed by the worker; a picture is ready as soon as it's stored */
export const mediaStatus = pgEnum("media_status", [
	"uploading",
	"processing",
	"ready",
	"failed",
]);

export const mediaAsset = pgTable(
	"media_asset",
	{
		id: id(),
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		kind: mediaKind("kind").notNull().default("image"),
		status: mediaStatus("status").notNull().default("ready"),
		/** known once processed */
		width: integer("width"),
		height: integer("height"),
		/** a tiny blurred picture (data URL) shown while the real one loads */
		placeholder: text("placeholder"),
		/** the stored files: name ("640.avif", "720p.m3u8"), MIME type, width */
		files: jsonb("files")
			.$type<{ name: string; type: string; width: number }[]>()
			.notNull()
			.default([]),
		/** a video's length */
		durationSeconds: integer("duration_seconds"),
		/** a video's original upload, kept private so it can be processed again later; never served */
		originalKey: text("original_key"),
		/** why processing failed, in words for the person who uploaded it */
		error: text("error"),
		/** while uploading in parts: storage's id for the upload */
		uploadId: text("upload_id"),
		/** while uploading in parts: how many parts the upload's size needs */
		uploadParts: integer("upload_parts"),
		/** while uploading: the lesson this video goes to once the upload completes */
		lessonId: idRef("lesson_id"),
		/** processing tries so far, and until when the current try holds the job */
		attempts: integer("attempts").notNull().default(0),
		lockedUntil: moment("locked_until"),
		createdBy: idRef("created_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: moment("created_at").defaultNow().notNull(),
		updatedAt: moment("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdateFn(() => new Date()),
	},
	(table) => [
		index("media_asset_org_idx").on(table.orgId),
		index("media_asset_jobs_idx").on(table.status, table.lockedUntil),
		tenantPolicy("media_asset"),
	],
).enableRLS();
