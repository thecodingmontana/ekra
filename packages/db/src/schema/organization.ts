import { pgEnum, pgTable, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.ts";

/** A company training its people, or a creator publishing courses. */
export const organizationKind = pgEnum("organization_kind", [
	"company",
	"creator",
]);

/** The tenant: every organization's data is kept apart from every other's (row-level security lands in Phase 1). */
export const organization = pgTable("organization", {
	id: id(),
	name: varchar("name", { length: 120 }).notNull(),
	/** subdomain and URL name, e.g. "acme" for acme.ekra.app */
	slug: varchar("slug", { length: 48 }).notNull().unique(),
	kind: organizationKind("kind").notNull().default("company"),
	...timestamps,
});
