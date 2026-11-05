/**
 * AI agents signing in as a person (Better Auth's jwt and oauth-provider plugins, 1.7.14): the signing keys, the
 * agents that registered (clients), what a person approved (consents) and the tokens issued. Not tenant data:
 * like user and session, these belong to a person, not an organization. Property names must stay as the plugins
 * name them; Better Auth reads and writes these tables itself.
 */
import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { session, user } from "./auth.ts";
import { idRef, moment } from "./columns.ts";

const userRef = (name: string) =>
	idRef(name).references(() => user.id, { onDelete: "cascade" });
const sessionRef = (name: string) =>
	idRef(name).references(() => session.id, { onDelete: "set null" });

/** Signing keys for agents' access tokens (RS256); the private half is stored encrypted. */
export const jwks = pgTable("jwks", {
	id: text("id").primaryKey(),
	publicKey: text("public_key").notNull(),
	privateKey: text("private_key").notNull(),
	createdAt: moment("created_at").notNull(),
	expiresAt: moment("expires_at"),
	alg: text("alg"),
	crv: text("crv"),
});

export const oauthClient = pgTable("oauth_client", {
	id: text("id").primaryKey(),
	clientId: text("client_id").notNull().unique(),
	clientSecret: text("client_secret"),
	clientDiscoveryId: text("client_discovery_id"),
	disabled: boolean("disabled").default(false),
	skipConsent: boolean("skip_consent"),
	enableEndSession: boolean("enable_end_session"),
	subjectType: text("subject_type"),
	scopes: text("scopes").array(),
	clientCredentialsScopes: text("client_credentials_scopes")
		.array()
		.default([]),
	userId: userRef("user_id"),
	createdAt: moment("created_at"),
	updatedAt: moment("updated_at"),
	name: text("name"),
	uri: text("uri"),
	icon: text("icon"),
	contacts: text("contacts").array(),
	tos: text("tos"),
	policy: text("policy"),
	softwareId: text("software_id"),
	softwareVersion: text("software_version"),
	softwareStatement: text("software_statement"),
	redirectUris: text("redirect_uris").array().notNull(),
	postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
	backchannelLogoutUri: text("backchannel_logout_uri"),
	backchannelLogoutSessionRequired: boolean(
		"backchannel_logout_session_required",
	),
	tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
	applicationType: text("application_type"),
	jwks: text("jwks"),
	jwksUri: text("jwks_uri"),
	grantTypes: text("grant_types").array(),
	responseTypes: text("response_types").array(),
	requirePKCE: boolean("require_pkce"),
	dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
	referenceId: text("reference_id"),
	metadata: jsonb("metadata"),
});

export const oauthResource = pgTable("oauth_resource", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull().unique(),
	name: text("name").notNull(),
	accessTokenTtl: integer("access_token_ttl"),
	refreshTokenTtl: integer("refresh_token_ttl"),
	signingAlgorithm: text("signing_algorithm"),
	signingKeyId: text("signing_key_id"),
	allowedScopes: text("allowed_scopes").array(),
	customClaims: jsonb("custom_claims"),
	dpopBoundAccessTokensRequired: boolean(
		"dpop_bound_access_tokens_required",
	).default(false),
	disabled: boolean("disabled").default(false),
	createdAt: moment("created_at"),
	updatedAt: moment("updated_at"),
	policyVersion: integer("policy_version").default(1),
	metadata: jsonb("metadata"),
});

export const oauthClientResource = pgTable(
	"oauth_client_resource",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		resourceId: text("resource_id")
			.notNull()
			.references(() => oauthResource.identifier, { onDelete: "cascade" }),
		metadata: jsonb("metadata"),
		createdAt: moment("created_at"),
	},
	(t) => [index("oauth_client_resource_client_idx").on(t.clientId)],
);

export const oauthRefreshToken = pgTable(
	"oauth_refresh_token",
	{
		id: text("id").primaryKey(),
		token: text("token").notNull().unique(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		sessionId: sessionRef("session_id"),
		userId: userRef("user_id").notNull(),
		referenceId: text("reference_id"),
		authorizationCodeId: text("authorization_code_id"),
		resources: text("resources").array(),
		requestedUserInfoClaims: text("requested_user_info_claims").array(),
		expiresAt: moment("expires_at"),
		createdAt: moment("created_at"),
		revoked: moment("revoked"),
		rotatedAt: moment("rotated_at"),
		rotationReplayResponse: text("rotation_replay_response"),
		rotationReplayExpiresAt: moment("rotation_replay_expires_at"),
		authTime: moment("auth_time"),
		confirmation: jsonb("confirmation"),
		scopes: text("scopes").array().notNull(),
	},
	(t) => [index("oauth_refresh_token_user_idx").on(t.userId)],
);

export const oauthAccessToken = pgTable(
	"oauth_access_token",
	{
		id: text("id").primaryKey(),
		token: text("token").unique(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		sessionId: sessionRef("session_id"),
		userId: userRef("user_id"),
		referenceId: text("reference_id"),
		authorizationCodeId: text("authorization_code_id"),
		resources: text("resources").array(),
		requestedUserInfoClaims: text("requested_user_info_claims").array(),
		refreshId: text("refresh_id").references(() => oauthRefreshToken.id, {
			onDelete: "cascade",
		}),
		expiresAt: moment("expires_at"),
		createdAt: moment("created_at"),
		revoked: moment("revoked"),
		confirmation: jsonb("confirmation"),
		scopes: text("scopes").array().notNull(),
	},
	(t) => [index("oauth_access_token_user_idx").on(t.userId)],
);

/** What a person approved for an agent; deleting it (Disconnect) refuses that agent's tokens at once. */
export const oauthConsent = pgTable(
	"oauth_consent",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		userId: userRef("user_id"),
		referenceId: text("reference_id"),
		resources: text("resources").array(),
		requestedUserInfoClaims: text("requested_user_info_claims").array(),
		scopes: text("scopes").array().notNull(),
		createdAt: moment("created_at"),
		updatedAt: moment("updated_at"),
	},
	(t) => [index("oauth_consent_user_idx").on(t.userId, t.clientId)],
);

export const oauthClientAssertion = pgTable("oauth_client_assertion", {
	id: text("id").primaryKey(),
	expiresAt: moment("expires_at").notNull(),
});
