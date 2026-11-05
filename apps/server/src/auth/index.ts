import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import {
	isImageSrc,
	isOrgColor,
	passwordProblem,
	slugProblem,
} from "@ekra/core";
import {
	generateId,
	member,
	oauthAccessToken,
	oauthConsent,
	oauthRefreshToken,
	schema,
} from "@ekra/db";
import {
	invitationEmail,
	resetPasswordEmail,
	signInLinkEmail,
	verifyEmailEmail,
} from "@ekra/email";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { jwt, magicLink, organization, twoFactor } from "better-auth/plugins";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db.ts";
import { mailer, sendInBackground } from "../email.ts";
import { env } from "../env.ts";
import { nameFromEmail } from "./name-from-email.ts";
import { ac, canManageContent, roles } from "./permissions.ts";
import { isTrustedDevice } from "./trusted-device.ts";

const MAGIC_LINK_MINUTES = 10;

/** Every organization's subdomain of the app: http://*.ekra.localhost:3000 */
const APP_SUBDOMAINS = (() => {
	const { protocol, host } = new URL(env.BETTER_AUTH_URL);
	return `${protocol}//*.${host}`;
})();
const RESET_PASSWORD_MINUTES = 60;
/** how long the "enter your code" step stays open after the first step */
const TWO_FACTOR_SECONDS = 600;

/** Only the picker's colours (or none): the value ends up in a style attribute. */
function assertColor(color: unknown) {
	// "" (or null) clears it back to Ekra's green
	if (
		color === undefined ||
		color === null ||
		color === "" ||
		isOrgColor(color)
	)
		return;
	throw new APIError("BAD_REQUEST", { message: "Pick one of the colours." });
}

/** Only a picture from Ekra's own image pipeline (or none): it's shown wherever the organization appears. */
function assertLogo(logo: unknown) {
	if (logo === undefined || logo === null || logo === "" || isImageSrc(logo))
		return;
	throw new APIError("BAD_REQUEST", {
		message: "Upload the logo here instead of linking to it.",
	});
}

function assertSlug(slug: string) {
	const problem = slugProblem(slug);
	if (problem) throw new APIError("BAD_REQUEST", { message: problem });
}

const INVITATION_DAYS = 7;

/** Better Auth's endpoints that list everyone's email in an organization: only for those who run it. */
const ROSTER_PATHS = new Set([
	"/organization/list-members",
	"/organization/get-full-organization",
	"/organization/list-invitations",
]);

/** The caller's role in the organization a request names (id or slug), else the session's active one. */
async function roleIn(
	userId: string,
	query: { organizationId?: unknown; organizationSlug?: unknown } | undefined,
	activeOrganizationId: string | null | undefined,
) {
	const id =
		typeof query?.organizationId === "string" ? query.organizationId : null;
	const slug =
		typeof query?.organizationSlug === "string" ? query.organizationSlug : null;
	const which = id ?? (slug ? null : activeOrganizationId);
	if (!which && !slug) return null;
	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.innerJoin(
			schema.organization,
			eq(schema.organization.id, member.organizationId),
		)
		.where(
			and(
				eq(member.userId, userId),
				which
					? eq(member.organizationId, which)
					: eq(schema.organization.slug, slug ?? ""),
			),
		)
		.limit(1);
	return row?.role ?? null;
}

/** Who signs agents' access tokens: the app's own address, where its sign-in lives. */
export const AUTH_ISSUER = new URL(env.BETTER_AUTH_URL).origin;
/** AI agents (MCP clients) get access tokens for this address, and use them only there. */
export const MCP_RESOURCE = `${AUTH_ISSUER}/api/mcp`;
/** What an agent can ask for: to act as you (offline_access: it stays connected between sessions). */
export const MCP_SCOPES = ["profile", "email", "offline_access"];

type AuthHookContext = Parameters<
	Parameters<typeof createAuthMiddleware>[0]
>[0];

/**
 * Disconnecting an agent (Settings → Security) deletes its approval, and /api/mcp refuses its access tokens from
 * then on. Its refresh tokens would still mint new ones, so the agent would think it's connected and show no
 * tools: end them too, and it asks to sign in again.
 */
async function endAgentTokens(ctx: AuthHookContext) {
	const id = (ctx.body as { id?: unknown } | undefined)?.id;
	const session = await getSessionFromCtx(ctx);
	if (typeof id !== "string" || !session) return;
	const [consent] = await db
		.select({ clientId: oauthConsent.clientId })
		.from(oauthConsent)
		.where(
			and(
				eq(oauthConsent.id, id),
				// only your own: nobody ends someone else's connection with a guessed id
				eq(oauthConsent.userId, session.user.id),
			),
		);
	if (!consent) return;
	const mine = (table: typeof oauthRefreshToken | typeof oauthAccessToken) =>
		and(
			eq(table.userId, session.user.id),
			eq(table.clientId, consent.clientId),
			isNull(table.revoked),
		);
	const now = new Date();
	await db
		.update(oauthRefreshToken)
		.set({ revoked: now })
		.where(mine(oauthRefreshToken));
	await db
		.update(oauthAccessToken)
		.set({ revoked: now })
		.where(mine(oauthAccessToken));
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * An agent on your computer registers as a public client with a local callback but rarely says it's a "native"
 * app, and the plugin assumes "web", which forbids local callbacks. RFC 8252: a client with no secret whose
 * callbacks are all on this machine is a native app, so say so for it (nothing else changes).
 */
function nativeClient(ctx: AuthHookContext) {
	const body = ctx.body as
		| {
				application_type?: string;
				token_endpoint_auth_method?: string;
				redirect_uris?: unknown;
		  }
		| undefined;
	if (
		!body ||
		body.application_type ||
		body.token_endpoint_auth_method !== "none"
	)
		return;
	const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
	const local = (uri: unknown) => {
		try {
			const { protocol, hostname } = new URL(String(uri));
			return protocol === "http:" && LOCAL_HOSTS.includes(hostname);
		} catch {
			return false;
		}
	};
	if (uris.length && uris.every(local))
		return { context: { body: { ...body, application_type: "native" } } };
}

/** Sign-in methods that are switched on, so the sign-in page only offers those. */
export const signInMethods = [
	"password",
	"email-link",
	"passkey",
	...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? ["google"] : []),
];

/** Better Auth: sign-in, sessions, organizations, members, roles, invitations and teams. Served at /api/auth/*. */
export const auth = betterAuth({
	appName: "Ekra",
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	basePath: "/api/auth",
	// the app, and every organization on its own subdomain (acme.ekra.localhost)
	trustedOrigins: [env.BETTER_AUTH_URL, APP_SUBDOMAINS],
	database: drizzleAdapter(db, { provider: "pg", schema }),
	// the same 16-character nanoid ids as every other table (packages/db)
	advanced: {
		database: { generateId: () => generateId() },
		// checked in tests too (Better Auth turns it off when NODE_ENV=test), so they cover what production does
		disableOriginCheck: false,
		// one sign-in for the app and all its organization subdomains
		// (not on bare "localhost": browsers refuse a cookie for it, so sign-in would break)
		crossSubDomainCookies: {
			enabled: new URL(env.BETTER_AUTH_URL).hostname.includes("."),
			domain: new URL(env.BETTER_AUTH_URL).hostname,
		},
		// a visitor's IP is the last address in X-Forwarded-For that isn't one of our proxies (the web app adds it)
		ipAddress: { trustedProxies: env.TRUSTED_PROXIES },
	},
	// counted in Postgres rather than in memory, so limits hold across server restarts and instances; on in every
	// environment (Better Auth turns it off outside production by default), so development and tests see them too
	rateLimit: {
		enabled: true,
		storage: "database",
		customRules: {
			// each one sends an email
			"/organization/invite-member": { window: 600, max: 10 },
			// a six-digit code can't be guessed in a few tries a minute
			"/two-factor/*": { window: 60, max: 5 },
		},
	},
	emailAndPassword: {
		enabled: true,
		// password sign-in works once the address is confirmed (Google and email links prove it already)
		requireEmailVerification: true,
		minPasswordLength: 10,
		maxPasswordLength: 128,
		resetPasswordTokenExpiresIn: RESET_PASSWORD_MINUTES * 60,
		// a reset signs out every other device, in case the password was stolen
		revokeSessionsOnPasswordReset: true,
		// not awaited, so the response time doesn't reveal whether an account exists
		sendResetPassword: async ({ user, url }) => {
			sendInBackground({
				to: user.email,
				...resetPasswordEmail({
					name: user.name,
					url,
					minutes: RESET_PASSWORD_MINUTES,
				}),
			});
		},
	},
	emailVerification: {
		sendOnSignUp: true,
		// trying to sign in before confirming sends a fresh link
		sendOnSignIn: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			sendInBackground({
				to: user.email,
				...verifyEmailEmail({ name: user.name, url }),
			});
		},
	},
	databaseHooks: {
		user: {
			create: {
				// email-link sign-ups come without a name: start from the email ("amina.k@…" → "Amina K")
				before: async (user) => ({
					data: {
						...user,
						name: user.name?.trim() || nameFromEmail(user.email),
					},
				}),
			},
		},
	},
	hooks: {
		// the same password rules the forms show (packages/core), so calling the API directly can't skip them
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path === "/oauth2/delete-consent") return endAgentTokens(ctx);
			if (ctx.path === "/oauth2/register") return nativeClient(ctx);
			if (ROSTER_PATHS.has(ctx.path)) {
				const session = await getSessionFromCtx(ctx);
				// signed out: Better Auth answers 401 itself
				if (!session) return;
				const role = await roleIn(
					session.user.id,
					ctx.query,
					session.session.activeOrganizationId,
				);
				if (!role || !canManageContent(role))
					throw new APIError("FORBIDDEN", {
						message:
							"Only people who run this organization can see its members.",
					});
				return;
			}
			const body = ctx.body as
				| { password?: unknown; newPassword?: unknown }
				| undefined;
			const password =
				ctx.path === "/sign-up/email"
					? body?.password
					: ctx.path === "/reset-password" || ctx.path === "/change-password"
						? body?.newPassword
						: undefined;
			if (typeof password !== "string") return;
			const problem = passwordProblem(password);
			if (problem) throw new APIError("BAD_REQUEST", { message: problem });
		}),
		// Better Auth asks for the second step only after password sign-in; do the same for
		// Google (the redirect callback, or an ID token sent to /sign-in/social) and emailed links,
		// so none skips it (passkeys are already two factors)
		after: createAuthMiddleware(async (ctx) => {
			if (
				!ctx.path.startsWith("/callback/") &&
				ctx.path !== "/sign-in/social" &&
				ctx.path !== "/magic-link/verify"
			)
				return;
			const data = ctx.context.newSession;
			if (!data?.user.twoFactorEnabled) return;
			// "Trust this device" skips the code, as it does after password sign-in
			if (await isTrustedDevice(ctx, data.user.id)) return;

			deleteSessionCookie(ctx, true);
			await ctx.context.internalAdapter.deleteSession(data.session.token);
			ctx.context.setNewSession(null);

			const cookie = ctx.context.createAuthCookie("two_factor", {
				maxAge: TWO_FACTOR_SECONDS,
			});
			const identifier = `2fa-${generateRandomString(20)}`;
			const expiresAt = new Date(Date.now() + TWO_FACTOR_SECONDS * 1000);
			await ctx.context.internalAdapter.createVerificationValue({
				value: data.user.id,
				identifier,
				expiresAt,
			});
			// verify-totp counts failed attempts against this record
			await ctx.context.internalAdapter.createVerificationValue({
				value: "0",
				identifier: `2fa-attempts-${identifier}`,
				expiresAt,
			});
			await ctx.setSignedCookie(
				cookie.name,
				identifier,
				ctx.context.secret,
				cookie.attributes,
			);
			throw ctx.redirect("/two-factor");
		}),
	},
	socialProviders:
		env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
			? {
					google: {
						clientId: env.GOOGLE_CLIENT_ID,
						clientSecret: env.GOOGLE_CLIENT_SECRET,
					},
				}
			: {},
	plugins: [
		// the key pair that signs agents' access tokens (RS256, kept in the jwks table, private half encrypted)
		jwt({
			jwks: { keyPairConfig: { alg: "RS256", modulusLength: 2048 } },
			jwt: { issuer: AUTH_ISSUER },
			disableSettingJwtHeader: true,
		}),
		// AI agents (Claude Code, Cursor, Codex…) sign in as you over OAuth and then use Ekra through /api/mcp with
		// your role in each organization. MCP clients register themselves, so registration is open; nothing is
		// granted until you approve it on the consent page.
		oauthProvider({
			loginPage: "/oauth/signin",
			consentPage: "/oauth/consent",
			scopes: MCP_SCOPES,
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			clientRegistrationDefaultScopes: MCP_SCOPES,
			// short-lived: /api/mcp also checks the approval still exists, so Disconnect is instant
			resources: [
				{ identifier: MCP_RESOURCE, name: "Ekra", accessTokenTtl: 600 },
			],
			clientRegistrationDefaultResources: [MCP_RESOURCE],
		}),
		// two-step sign-in with an authenticator app, plus single-use backup codes
		twoFactor({
			issuer: "Ekra",
			// Google-only and email-link accounts have no password to confirm with
			allowPasswordless: true,
			twoFactorCookieMaxAge: TWO_FACTOR_SECONDS,
		}),
		// passkeys belong to the app's domain (BETTER_AUTH_URL), so they work at that address
		passkey({
			rpName: "Ekra",
			// valid on the app and its subdomains; each request's origin is already limited to trustedOrigins
			rpID: new URL(env.BETTER_AUTH_URL).hostname,
		}),
		// "Email me a sign-in link": single use, stored hashed, valid for 10 minutes
		magicLink({
			expiresIn: MAGIC_LINK_MINUTES * 60,
			storeToken: "hashed",
			// awaited: if the link can't be sent, the person sees it failed and can try again
			sendMagicLink: async ({ email, url }) => {
				await mailer.send({
					to: email,
					...signInLinkEmail({ url, minutes: MAGIC_LINK_MINUTES }),
				});
			},
		}),
		organization({
			ac,
			roles,
			creatorRole: "owner",
			teams: { enabled: true },
			invitationExpiresIn: INVITATION_DAYS * 86_400,
			// the link opens the invitation page, which asks to sign in (or sign up) with the invited address first
			sendInvitationEmail: async ({
				id,
				email,
				role,
				organization,
				inviter,
			}) => {
				await mailer.send({
					to: email,
					...invitationEmail({
						organization: organization.name,
						from: inviter.user.name,
						role: role.split(",")[0] ?? "member",
						url: new URL(`/invite/${id}`, env.BETTER_AUTH_URL).toString(),
						days: INVITATION_DAYS,
					}),
				});
			},
			organizationHooks: {
				// the slug becomes a subdomain, so it must follow hostname rules (packages/core)
				beforeCreateOrganization: async ({ organization }) => {
					assertSlug(organization.slug ?? "");
					assertColor(organization.color);
					assertLogo(organization.logo);
				},
				beforeUpdateOrganization: async ({ organization }) => {
					if (organization.slug !== undefined) assertSlug(organization.slug);
					assertColor(organization.color);
					assertLogo(organization.logo);
				},
			},
			schema: {
				organization: {
					additionalFields: {
						// a company training its people, or a creator publishing courses
						kind: {
							type: ["company", "creator"],
							required: false,
							defaultValue: "company",
						},
						// the logo letter's colour: one of ORG_COLORS, or null for Ekra's green
						color: { type: "string", required: false },
					},
				},
			},
		}),
	],
});

export type Auth = typeof auth;

/** The app's own address or one of its organizations' subdomains: Better Auth's trustedOrigins rule, reused. */
export const isTrustedOrigin = async (origin: string | null | undefined) =>
	!!origin && (await auth.$context).isTrustedOrigin(origin);
