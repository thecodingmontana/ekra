import { member } from "@ekra/db";
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
 * Every resolver that reads or writes an organization's data starts here, and scopes its queries by the id it
 * returns. Refuses (FORBIDDEN) when the request has no organization it belongs to.
 * shortcut: app-level scoping only; Postgres row-level security joins it with the first tenant table (Phase 2).
 */
export function requireOrg(ctx: { org: ActiveOrg | null }): ActiveOrg {
	if (!ctx.org)
		throw new GraphQLError("Choose an organization you belong to first.", {
			extensions: { code: "FORBIDDEN" },
		});
	return ctx.org;
}
