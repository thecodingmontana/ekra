import { passkey } from "@better-auth/passkey";
import { passwordProblem, slugProblem } from "@ekra/core";
import { generateId, schema } from "@ekra/db";
import {
	resetPasswordEmail,
	signInLinkEmail,
	verifyEmailEmail,
} from "@ekra/email";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { magicLink, organization, twoFactor } from "better-auth/plugins";
import { db } from "../db.ts";
import { mailer, sendInBackground } from "../email.ts";
import { env } from "../env.ts";
import { nameFromEmail } from "./name-from-email.ts";
import { ac, roles } from "./permissions.ts";
import { isTrustedDevice } from "./trusted-device.ts";

const MAGIC_LINK_MINUTES = 10;
const RESET_PASSWORD_MINUTES = 60;
/** how long the "enter your code" step stays open after the first step */
const TWO_FACTOR_SECONDS = 600;

function assertSlug(slug: string) {
	const problem = slugProblem(slug);
	if (problem) throw new APIError("BAD_REQUEST", { message: problem });
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
	trustedOrigins: [env.BETTER_AUTH_URL],
	database: drizzleAdapter(db, { provider: "pg", schema }),
	// the same 16-character nanoid ids as every other table (packages/db)
	advanced: {
		database: { generateId: () => generateId() },
		// a visitor's IP is the last address in X-Forwarded-For that isn't one of our proxies (the web app adds it)
		ipAddress: { trustedProxies: env.TRUSTED_PROXIES },
	},
	// counted in Postgres rather than in memory, so limits hold across server restarts and instances
	rateLimit: { storage: "database" },
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
		// Google and emailed links, so neither skips it (passkeys are already two factors)
		after: createAuthMiddleware(async (ctx) => {
			if (
				!ctx.path.startsWith("/callback/") &&
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
			rpID: new URL(env.BETTER_AUTH_URL).hostname,
			origin: env.BETTER_AUTH_URL,
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
			organizationHooks: {
				// the slug becomes a subdomain, so it must follow hostname rules (packages/core)
				beforeCreateOrganization: async ({ organization }) => {
					assertSlug(organization.slug ?? "");
				},
				beforeUpdateOrganization: async ({ organization }) => {
					if (organization.slug !== undefined) assertSlug(organization.slug);
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
					},
				},
			},
		}),
	],
});

export type Auth = typeof auth;
