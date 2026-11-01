import { contentItem, withOrg } from "@ekra/db";
import { desc, isNotNull, isNull } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { z } from "zod";
import { db } from "../db.ts";
import { type ActiveOrg, requireOrg } from "./tenant.ts";

/** An organization's learning content: every read and write runs through withOrg (Postgres row-level security). */
export const libraryTypeDefs = /* GraphQL */ `
	extend type Query {
		"The organization's content, newest first. Archived content only when asked for."
		library(archived: Boolean = false): [ContentItem!]!
	}

	type Mutation {
		"Create content in the organization (owners, admins and trainers)."
		createContent(input: CreateContentInput!): ContentItem!
	}

	enum ContentKind {
		course
		page
		quiz
		assignment
		path
	}

	type ContentItem {
		id: ID!
		kind: ContentKind!
		title: String!
		description: String
		"draft or published"
		status: String!
		createdAt: String!
		updatedAt: String!
	}

	input CreateContentInput {
		kind: ContentKind!
		title: String!
		description: String
	}
`;

const CREATORS = new Set(["owner", "admin", "trainer"]);

const createInput = z.object({
	kind: z.enum(["course", "page", "quiz", "assignment", "path"]),
	title: z.string().trim().min(1, "Give it a title.").max(200),
	description: z.string().trim().max(2000).nullish(),
});

type Ctx = { org: ActiveOrg | null; session: { user: { id: string } } | null };

const iso = (row: typeof contentItem.$inferSelect) => ({
	...row,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export const libraryResolvers = {
	Query: {
		library: async (
			_parent: unknown,
			{ archived }: { archived: boolean },
			ctx: Ctx,
		) => {
			const org = requireOrg(ctx);
			// no org_id filter needed: withOrg only lets this organization's rows through
			const rows = await withOrg(db, org.id, (tx) =>
				tx
					.select()
					.from(contentItem)
					.where(
						archived
							? isNotNull(contentItem.archivedAt)
							: isNull(contentItem.archivedAt),
					)
					.orderBy(desc(contentItem.updatedAt))
					.limit(500),
			);
			return rows.map(iso);
		},
	},
	Mutation: {
		createContent: async (
			_parent: unknown,
			{ input }: { input: unknown },
			ctx: Ctx,
		) => {
			const org = requireOrg(ctx);
			if (!CREATORS.has(org.role))
				throw new GraphQLError(
					"Only owners, admins and trainers can create content.",
					{ extensions: { code: "FORBIDDEN" } },
				);
			const parsed = createInput.safeParse(input);
			if (!parsed.success)
				throw new GraphQLError(
					parsed.error.issues[0]?.message ?? "Check the details.",
					{ extensions: { code: "BAD_USER_INPUT" } },
				);
			const [row] = await withOrg(db, org.id, (tx) =>
				tx
					.insert(contentItem)
					.values({
						...parsed.data,
						orgId: org.id,
						createdBy: ctx.session?.user.id,
					})
					.returning(),
			);
			if (!row) throw new Error("content not created");
			return iso(row);
		},
	},
};
