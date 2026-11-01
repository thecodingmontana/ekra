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
	varchar,
} from "drizzle-orm/pg-core";
import { id, idRef, moment, timestamps } from "./columns.ts";

export const user = pgTable("user", {
	id: id(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	/** two-step sign-in (authenticator app) is switched on */
	twoFactorEnabled: boolean("two_factor_enabled").default(false),
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
		userId: idRef("user_id")
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
		userId: idRef("user_id")
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
	/** subdomain and URL name, e.g. "acme" for acme.<your domain> */
	slug: text("slug").notNull().unique(),
	logo: text("logo"),
	/** the logo letter's colour (ORG_COLORS in @ekra/core); null is Ekra's green */
	color: varchar("color", { length: 20 }),
	metadata: text("metadata"),
	kind: organizationKind("kind").notNull().default("company"),
	createdAt: moment("created_at").defaultNow().notNull(),
});

export const member = pgTable(
	"member",
	{
		id: id(),
		organizationId: idRef("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: idRef("user_id")
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
		organizationId: idRef("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role"),
		teamId: text("team_id"),
		status: text("status").default("pending").notNull(),
		expiresAt: moment("expires_at").notNull(),
		inviterId: idRef("inviter_id")
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
		organizationId: idRef("organization_id")
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
		teamId: idRef("team_id")
			.notNull()
			.references(() => team.id, { onDelete: "cascade" }),
		userId: idRef("user_id")
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

/** Passkeys people sign in with (Better Auth's passkey plugin). */
export const passkey = pgTable(
	"passkey",
	{
		id: id(),
		name: text("name"),
		publicKey: text("public_key").notNull(),
		userId: idRef("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		credentialID: text("credential_id").notNull(),
		counter: integer("counter").notNull(),
		deviceType: text("device_type").notNull(),
		backedUp: boolean("backed_up").notNull(),
		transports: text("transports"),
		aaguid: text("aaguid"),
		createdAt: moment("created_at").defaultNow(),
	},
	(table) => [
		index("passkey_user_id_idx").on(table.userId),
		index("passkey_credential_id_idx").on(table.credentialID),
	],
);

/** Authenticator-app secrets and backup codes for two-step sign-in (both stored encrypted by Better Auth). */
export const twoFactor = pgTable(
	"two_factor",
	{
		id: id(),
		secret: text("secret").notNull(),
		backupCodes: text("backup_codes").notNull(),
		userId: idRef("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		verified: boolean("verified").default(true),
		failedVerificationCount: integer("failed_verification_count").default(0),
		lockedUntil: moment("locked_until"),
	},
	(table) => [
		index("two_factor_secret_idx").on(table.secret),
		index("two_factor_user_id_idx").on(table.userId),
	],
);
