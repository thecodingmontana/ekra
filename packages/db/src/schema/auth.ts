/**
 * Better Auth's tables: people, sign-in, sessions, and organizations with their members, invitations and teams.
 * Started from `npx auth generate` (Better Auth 1.7.14) and kept by hand: property names must stay as Better Auth
 * names them. After changing auth plugins, run the generator into a scratch file and copy over what changed.
 */
import {
	bigint,
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	uuid,
} from "drizzle-orm/pg-core";
import { id, moment, timestamps } from "./columns.ts";

export const user = pgTable("user", {
	id: id(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	...timestamps,
});

export const session = pgTable(
	"session",
	{
		id: id(),
		expiresAt: moment("expires_at").notNull(),
		token: text("token").notNull().unique(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** the organization (and team) this session is working in */
		activeOrganizationId: text("active_organization_id"),
		activeTeamId: text("active_team_id"),
		...timestamps,
	},
	(table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
	"account",
	{
		id: id(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: moment("access_token_expires_at"),
		refreshTokenExpiresAt: moment("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		...timestamps,
	},
	(table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
	"verification",
	{
		id: id(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: moment("expires_at").notNull(),
		...timestamps,
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

/** A company training its people, or a creator publishing courses. */
export const organizationKind = pgEnum("organization_kind", [
	"company",
	"creator",
]);

/** The tenant: every organization's data is kept apart from every other's. */
export const organization = pgTable("organization", {
	id: id(),
	name: text("name").notNull(),
	/** subdomain and URL name, e.g. "acme" for acme.ekra.app */
	slug: text("slug").notNull().unique(),
	logo: text("logo"),
	metadata: text("metadata"),
	kind: organizationKind("kind").notNull().default("company"),
	createdAt: moment("created_at").defaultNow().notNull(),
});

export const member = pgTable(
	"member",
	{
		id: id(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** owner, admin, trainer, learner or guest (comma-separated when someone has several) */
		role: text("role").default("learner").notNull(),
		createdAt: moment("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("member_organization_id_idx").on(table.organizationId),
		index("member_user_id_idx").on(table.userId),
	],
);

export const invitation = pgTable(
	"invitation",
	{
		id: id(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role"),
		teamId: text("team_id"),
		status: text("status").default("pending").notNull(),
		expiresAt: moment("expires_at").notNull(),
		inviterId: uuid("inviter_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: moment("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("invitation_organization_id_idx").on(table.organizationId),
		index("invitation_email_idx").on(table.email),
	],
);

export const team = pgTable(
	"team",
	{
		id: id(),
		name: text("name").notNull(),
		memberCount: integer("member_count").default(0).notNull(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		createdAt: moment("created_at").defaultNow().notNull(),
		updatedAt: moment("updated_at").$onUpdateFn(() => new Date()),
	},
	(table) => [index("team_organization_id_idx").on(table.organizationId)],
);

export const teamMember = pgTable(
	"team_member",
	{
		id: id(),
		teamId: uuid("team_id")
			.notNull()
			.references(() => team.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		membershipKey: text("membership_key").unique(),
		createdAt: moment("created_at").defaultNow(),
	},
	(table) => [
		index("team_member_team_id_idx").on(table.teamId),
		index("team_member_user_id_idx").on(table.userId),
	],
);

/** Better Auth's request counters, kept in Postgres so limits hold across restarts and server instances. */
export const rateLimit = pgTable("rate_limit", {
	id: id(),
	key: text("key").notNull().unique(),
	count: integer("count").notNull(),
	lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
