import { slugProblem } from "@ekra/core";
import { member, organization } from "@ekra/db";
import { costLimitPlugin } from "@escape.tech/graphql-armor-cost-limit";
import { maxAliasesPlugin } from "@escape.tech/graphql-armor-max-aliases";
import { maxDepthPlugin } from "@escape.tech/graphql-armor-max-depth";
import { asc, eq } from "drizzle-orm";
import { identifyUser } from "evlog/better-auth";
import { useLogger } from "evlog/hono";
import { GraphQLError } from "graphql";
import { createSchema, createYoga, useErrorHandler } from "graphql-yoga";
import { auth, signInMethods } from "../auth/index.ts";
import { db } from "../db.ts";
import { env } from "../env.ts";
import { type ActiveOrg, activeOrg, requireOrg } from "./tenant.ts";

/**
 * What every resolver knows about the request: the Better Auth session (null when signed out) and the organization
 * it works in with the person's role (null when none, or when they aren't a member of it). Tenant resolvers use
 * `requireOrg` (./tenant.ts).
 */
export type GraphQLContext = {
	session: Awaited<ReturnType<typeof auth.api.getSession>>;
	org: ActiveOrg | null;
};

/**
 * How much one request may ask for, so a single query can't flood the database
 * (e.g. the same list repeated under hundreds of aliases).
 */
export const LIMITS = { aliases: 15, depth: 12, cost: 5000 };

const schema = createSchema<GraphQLContext>({
	typeDefs: /* GraphQL */ `
		type Query {
			"Answers ok while the API is up."
			health: String!
			"The signed-in person, or null when signed out."
			viewer: Viewer
			"Ways to sign in that are switched on: email-link, and google when configured."
			signInMethods: [String!]!
			"Whether an organization address is free to take (signed in only; false when it breaks the rules)."
			slugAvailable(slug: String!): Boolean!
			"The organization this session works in, with your role there. Refused without one."
			organization: ActiveOrganization!
		}

		type ActiveOrganization {
			organization: Organization!
			"owner, admin, trainer, learner or guest"
			role: String!
		}

		type Viewer {
			id: ID!
			name: String!
			email: String!
			image: String
			"The organization this session is working in, if one is chosen."
			activeOrganizationId: ID
			"Two-step sign-in with an authenticator app is on."
			twoFactorEnabled: Boolean!
			"Every organization this person belongs to, with their role in it."
			memberships: [Membership!]!
		}

		type Membership {
			"owner, admin, trainer, learner or guest"
			role: String!
			organization: Organization!
		}

		type Organization {
			id: ID!
			name: String!
			slug: String!
			"company or creator"
			kind: String!
			logo: String
		}
	`,
	resolvers: {
		Query: {
			health: () => "ok",
			signInMethods: () => signInMethods,
			organization: async (_parent, _args, ctx) => {
				const { id, role } = requireOrg(ctx);
				const [row] = await db
					.select()
					.from(organization)
					.where(eq(organization.id, id));
				return { organization: row, role };
			},
			slugAvailable: async (
				_parent,
				{ slug }: { slug: string },
				{ session },
			) => {
				if (!session) throw new GraphQLError("Sign in first.");
				if (slugProblem(slug)) return false;
				const [taken] = await db
					.select({ id: organization.id })
					.from(organization)
					.where(eq(organization.slug, slug))
					.limit(1);
				return !taken;
			},
			viewer: (_parent, _args, { session }) =>
				session
					? {
							...session.user,
							activeOrganizationId:
								session.session.activeOrganizationId ?? null,
							twoFactorEnabled: session.user.twoFactorEnabled ?? false,
						}
					: null,
		},
		Viewer: {
			memberships: async ({ id }: { id: string }) => {
				const rows = await db
					.select({ role: member.role, organization })
					.from(member)
					.innerJoin(organization, eq(member.organizationId, organization.id))
					.where(eq(member.userId, id))
					.orderBy(asc(organization.name));
				return rows;
			},
		},
	},
});

/** A bug rather than an expected refusal: anything not thrown on purpose as a GraphQLError. */
const isUnexpected = (error: GraphQLError) =>
	!!error.originalError && !(error.originalError instanceof GraphQLError);

export const yoga = createYoga<object, GraphQLContext>({
	schema,
	context: async ({ request, params }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		const log = useLogger();
		log.set({ graphql: { operation: params.operationName ?? "anonymous" } });
		// who made the request, on its log event (the session is loaded here anyway)
		if (session)
			identifyUser(log, session, {
				extend: (s) => ({
					organizationId: s.session.activeOrganizationId ?? null,
				}),
			});
		const org = await activeOrg(
			session?.user.id,
			session?.session.activeOrganizationId,
		);
		return { session, org };
	},
	// Yoga logs every request at "info": keep the logs to problems
	logging: "warn",
	// crashes reach the client as "Unexpected error." and are logged below with the details
	maskedErrors: true,
	plugins: [
		maxAliasesPlugin({ n: LIMITS.aliases }),
		maxDepthPlugin({ n: LIMITS.depth }),
		costLimitPlugin({ maxCost: LIMITS.cost }),
		useErrorHandler(({ errors }) => {
			for (const error of errors)
				if (error instanceof GraphQLError && isUnexpected(error)) {
					const log = useLogger();
					log.set({
						graphql: { failedAt: error.path?.join(".") ?? "request" },
					});
					log.error(error.originalError ?? error);
				}
		}),
	],
	graphqlEndpoint: "/api/graphql",
	graphiql: env.NODE_ENV !== "production",
});
