/**
 * An organization's learning content (Phase 2's library). Every tenant table has org_id and this row-level policy:
 * the app reads and writes it as the ekra_app role inside withOrg() (see ../tenant.ts), and Postgres only lets it
 * see and write rows of the organization that transaction is for.
 */
import { sql } from "drizzle-orm";
import { index, pgEnum, pgPolicy, pgTable, text } from "drizzle-orm/pg-core";
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
	"course",
	"page",
	"quiz",
	"assignment",
	"path",
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
		createdBy: idRef("created_by").references(() => user.id, {
			onDelete: "set null",
		}),
		/** archived content leaves the library but isn't deleted */
		archivedAt: moment("archived_at"),
		...timestamps,
	},
	(table) => [
		index("content_item_org_idx").on(table.orgId, table.updatedAt),
		tenantPolicy("content_item"),
	],
).enableRLS();
