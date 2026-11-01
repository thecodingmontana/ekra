import { member, organization } from "@ekra/db";
import { and, eq } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { db } from "../db.ts";

/** The organization a request works in, and the person's role there. */
export type ActiveOrg = { id: string; role: string };

/**
 * The session's active organization, only while the person is still a member: a removed member, or a session
 * pointing at someone else's organization, gets null. Checked on every request, never trusted from the session.
 */
export async function activeOrg(
	userId: string | undefined,
	organizationId: string | null | undefined,
): Promise<ActiveOrg | null> {
	if (!userId || !organizationId) return null;
	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
		)
		.limit(1);
	return row ? { id: organizationId, role: row.role } : null;
}

/**
 * The session's organization for resolvers that work in it (`organization`), checked against `member` when asked.
 * Refuses (FORBIDDEN) when the request has no organization it belongs to. Library resolvers name their
 * organization instead (`orgBySlug`).
 */
export async function requireOrg(ctx: {
	session: {
		user: { id: string };
		session: { activeOrganizationId?: string | null };
	} | null;
}): Promise<ActiveOrg> {
	const org = await activeOrg(
		ctx.session?.user.id,
		ctx.session?.session.activeOrganizationId,
	);
	if (!org)
		throw new GraphQLError("Choose an organization you belong to first.", {
			extensions: { code: "FORBIDDEN" },
		});
	return org;
}

/**
 * The organization a page names by its address, for tenant queries that take `slug`: the page says which
 * organization it shows, so it never depends on which one the session switched to last. Refuses (FORBIDDEN)
 * unless the signed-in person is a member, so another organization's address answers the same as a made-up one.
 */
export async function orgBySlug(
	ctx: { session: { user: { id: string } } | null },
	slug: string,
): Promise<ActiveOrg> {
	const userId = ctx.session?.user.id;
	const [row] = userId
		? await db
				.select({ id: organization.id, role: member.role })
				.from(member)
				.innerJoin(organization, eq(member.organizationId, organization.id))
				.where(and(eq(member.userId, userId), eq(organization.slug, slug)))
				.limit(1)
		: [];
	if (!row)
		throw new GraphQLError("Choose an organization you belong to first.", {
			extensions: { code: "FORBIDDEN" },
		});
	return row;
}
