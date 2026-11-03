import { invitation, member, organization, user } from "@ekra/db";
import { and, eq } from "drizzle-orm";
import { db } from "../db.ts";
import { type Ctx, refuse } from "./library.ts";

/**
 * What an invitation page shows before you accept: the organization, who invited you, the role, and whether it's
 * yours. The id in the emailed link is the secret (16 random characters), so whoever is signed in with it may look.
 * Accepting and declining go through Better Auth, which checks the address again.
 */
export const invitationTypeDefs = /* GraphQL */ `
	extend type Query {
		"An invitation by the id in its link; null when it doesn't exist, was used, cancelled or ran out."
		invitationPreview(id: ID!): InvitationPreview
	}

	type InvitationPreview {
		id: ID!
		"The address it was sent to."
		email: String!
		role: String!
		inviterName: String!
		organization: Organization!
		"Sent to the address you're signed in with."
		forYou: Boolean!
		"You're in this organization already: its address (nothing to accept)."
		joinedSlug: String
	}
`;

export const invitationResolvers = {
	Query: {
		invitationPreview: async (
			_p: unknown,
			{ id }: { id: string },
			ctx: Ctx,
		) => {
			const me = ctx.session?.user;
			if (!me) return refuse("Sign in first.", "UNAUTHENTICATED");
			const [row] = await db
				.select({
					id: invitation.id,
					email: invitation.email,
					role: invitation.role,
					status: invitation.status,
					expiresAt: invitation.expiresAt,
					inviterName: user.name,
					organization,
				})
				.from(invitation)
				.innerJoin(organization, eq(organization.id, invitation.organizationId))
				.innerJoin(user, eq(user.id, invitation.inviterId))
				.where(eq(invitation.id, id.slice(0, 32)));
			if (row?.status !== "pending" || row.expiresAt <= new Date()) return null;
			const [self] = await db
				.select({ email: user.email })
				.from(user)
				.where(eq(user.id, me.id));
			const [already] = await db
				.select({ id: member.id })
				.from(member)
				.where(
					and(
						eq(member.organizationId, row.organization.id),
						eq(member.userId, me.id),
					),
				);
			return {
				...row,
				role: row.role ?? "learner",
				forYou: row.email.toLowerCase() === self?.email.toLowerCase(),
				joinedSlug: already ? row.organization.slug : null,
			};
		},
	},
};
