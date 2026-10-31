import { costLimitPlugin } from "@escape.tech/graphql-armor-cost-limit";
import { maxAliasesPlugin } from "@escape.tech/graphql-armor-max-aliases";
import { maxDepthPlugin } from "@escape.tech/graphql-armor-max-depth";
import { GraphQLError } from "graphql";
import { createSchema, createYoga, useErrorHandler } from "graphql-yoga";
import { auth } from "../auth/index.ts";
import { env } from "../env.ts";

/** What every resolver knows about the request: the Better Auth session, or null when signed out. */
export type GraphQLContext = {
	session: Awaited<ReturnType<typeof auth.api.getSession>>;
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
		}

		type Viewer {
			id: ID!
			name: String!
			email: String!
			image: String
			"The organization this session is working in, if one is chosen."
			activeOrganizationId: ID
		}
	`,
	resolvers: {
		Query: {
			health: () => "ok",
			viewer: (_parent, _args, { session }) =>
				session
					? {
							...session.user,
							activeOrganizationId:
								session.session.activeOrganizationId ?? null,
						}
					: null,
		},
	},
});

/** A bug rather than an expected refusal: anything not thrown on purpose as a GraphQLError. */
const isUnexpected = (error: GraphQLError) =>
	!!error.originalError && !(error.originalError instanceof GraphQLError);

export const yoga = createYoga<object, GraphQLContext>({
	schema,
	context: async ({ request }) => ({
		session: await auth.api.getSession({ headers: request.headers }),
	}),
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
				if (error instanceof GraphQLError && isUnexpected(error))
					console.error(
						`[graphql] ${error.path?.join(".") ?? "request"}:`,
						error.originalError?.stack ?? error.message,
					);
		}),
	],
	graphqlEndpoint: "/api/graphql",
	graphiql: env.NODE_ENV !== "production",
});
