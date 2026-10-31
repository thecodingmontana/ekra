import { schema } from "@ekra/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, organization } from "better-auth/plugins";
import { db } from "../db.ts";
import { env } from "../env.ts";
import { nameFromEmail } from "./name-from-email.ts";
import { ac, roles } from "./permissions.ts";

const MAGIC_LINK_MINUTES = 10;

/**
 * Sign-in links sent while no email service is set up (development and tests only): the latest link per address.
 * shortcut: no email delivery yet; links are printed in the server terminal. Add a mail transport before production.
 */
export const devOutbox = new Map<string, string>();

/** Better Auth: sign-in, sessions, organizations, members, roles, invitations and teams. Served at /api/auth/*. */
export const auth = betterAuth({
	appName: "Ekra",
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	basePath: "/api/auth",
	trustedOrigins: [env.BETTER_AUTH_URL],
	database: drizzleAdapter(db, { provider: "pg", schema }),
	// Postgres makes the ids (uuidv7() defaults in packages/db), so they sort by creation time
	advanced: { database: { generateId: "uuid" } },
	// counted in Postgres rather than in memory, so limits hold across server restarts and instances
	rateLimit: { storage: "database" },
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
		// "Email me a sign-in link": single use, stored hashed, valid for 10 minutes
		magicLink({
			expiresIn: MAGIC_LINK_MINUTES * 60,
			storeToken: "hashed",
			sendMagicLink: async ({ email, url }) => {
				if (env.NODE_ENV === "production") {
					throw new Error(
						"Email sending isn't set up yet, so sign-in links can't be sent.",
					);
				}
				devOutbox.set(email.toLowerCase(), url);
				if (env.NODE_ENV === "development")
					console.info(`[auth] sign-in link for ${email}: ${url}`);
			},
		}),
		organization({
			ac,
			roles,
			creatorRole: "owner",
			teams: { enabled: true },
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
