/**
 * Learning paths (content of kind path): stages in order, and in each stage the library items to take (courses,
 * pages, quizzes, wikis…). A path taken in order (content_item.sequential) opens each step when the ones before
 * are done. Tenant tables (org_id + the row-level policy, inside withOrg).
 */
import { index, integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { organization } from "./auth.ts";
import { id, idRef, timestamps } from "./columns.ts";
import { contentItem, tenantPolicy } from "./content.ts";

export const pathStage = pgTable(
	"path_stage",
	{
		id: id(),
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		pathId: idRef("path_id")
			.notNull()
			.references(() => contentItem.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		position: integer("position").notNull(),
		...timestamps,
	},
	(table) => [
		index("path_stage_path_idx").on(table.pathId, table.position),
		tenantPolicy("path_stage"),
	],
).enableRLS();

export const pathStep = pgTable(
	"path_step",
	{
		id: id(),
		orgId: idRef("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		pathId: idRef("path_id")
			.notNull()
			.references(() => contentItem.id, { onDelete: "cascade" }),
		stageId: idRef("stage_id")
			.notNull()
			.references(() => pathStage.id, { onDelete: "cascade" }),
		/** the library item this step takes */
		contentId: idRef("content_id")
			.notNull()
			.references(() => contentItem.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		...timestamps,
	},
	(table) => [
		unique("path_step_once").on(table.pathId, table.contentId),
		index("path_step_stage_idx").on(table.stageId, table.position),
		tenantPolicy("path_step"),
	],
).enableRLS();
