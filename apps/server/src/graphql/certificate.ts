import { certificate, user } from "@ekra/db";
import { and, desc, eq } from "drizzle-orm";
import { asMember, type Ctx, findOne, refuse } from "./library.ts";
import { progressOf } from "./progress.ts";

/** Certificates for finished courses, paths and quizzes. Inside withOrg (RLS). */
export const certificateTypeDefs = /* GraphQL */ `
	extend type Query {
		"Your certificates in this organization, newest first."
		myCertificates(slug: String!): [Certificate!]!
	}

	extend type Mutation {
		"Your certificate for a course, path or quiz you finished (issued the first time, the same one after)."
		claimCertificate(slug: String!, contentId: ID!): Certificate!
	}

	type Certificate {
		"Also the public verification code (/certificates/<id>)."
		id: ID!
		contentId: ID!
		name: String!
		title: String!
		issuedAt: String!
	}
`;

const CERTIFIED = new Set(["course", "path", "quiz"]);

type Row = typeof certificate.$inferSelect;
const toGraphQL = (c: Row) => ({ ...c, issuedAt: c.issuedAt.toISOString() });

export const certificateResolvers = {
	Query: {
		myCertificates: (_p: unknown, { slug }: { slug: string }, ctx: Ctx) =>
			asMember(ctx, slug, async (tx, _org, userId) =>
				(
					await tx
						.select()
						.from(certificate)
						.where(eq(certificate.userId, userId))
						.orderBy(desc(certificate.issuedAt))
				).map(toGraphQL),
			),
	},
	Mutation: {
		claimCertificate: (
			_p: unknown,
			{ slug, contentId }: { slug: string; contentId: string },
			ctx: Ctx,
		) =>
			asMember(ctx, slug, async (tx, org, userId) => {
				const mine = and(
					eq(certificate.userId, userId),
					eq(certificate.contentId, contentId),
				);
				const [had] = await tx.select().from(certificate).where(mine);
				if (had) return toGraphQL(had);

				const found = await findOne(tx, org, userId, contentId);
				if (!found || !CERTIFIED.has(found.item.kind))
					return refuse(
						"There's no certificate for that, or it was deleted.",
						"NOT_FOUND",
					);
				const done =
					(await progressOf(tx, found.item, [userId])).get(userId)?.percent ===
					100;
				if (!done)
					return refuse(
						"Finish all of it first; the certificate comes after.",
						"BAD_USER_INPUT",
					);
				const [person] = await tx
					.select({ name: user.name })
					.from(user)
					.where(eq(user.id, userId));
				// two claims at once: the second finds the first's
				await tx
					.insert(certificate)
					.values({
						orgId: org.id,
						userId,
						contentId,
						name: person?.name ?? "",
						title: found.item.title,
					})
					.onConflictDoNothing();
				const [issued] = await tx.select().from(certificate).where(mine);
				if (!issued) return refuse("Couldn't issue it.", "INTERNAL");
				return toGraphQL(issued);
			}),
	},
};
