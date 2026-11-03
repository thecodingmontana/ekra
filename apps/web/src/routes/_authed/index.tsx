import { createFileRoute, redirect } from "@tanstack/react-router";
import { authGet } from "@/lib/auth-get";

/**
 * "/" opens your current organization (or your first). Someone in none who was invited somewhere goes to that
 * invitation; only someone with neither is sent to set up an organization.
 */
export const Route = createFileRoute("/_authed/")({
	beforeLoad: async ({ context: { viewer } }) => {
		const membership =
			viewer.memberships.find(
				(m) => m.organization.id === viewer.activeOrganizationId,
			) ?? viewer.memberships[0];
		if (membership)
			throw redirect({
				to: "/o/$slug",
				params: { slug: membership.organization.slug },
			});
		const { data } = await authGet<{ id: string; expiresAt: string }[]>(
			"/organization/list-user-invitations",
		);
		// pending only; Better Auth doesn't drop expired ones here
		const invitation = data?.find(
			(i) => new Date(i.expiresAt).getTime() > Date.now(),
		);
		if (invitation)
			throw redirect({ to: "/invite/$id", params: { id: invitation.id } });
		throw redirect({ to: "/onboarding" });
	},
});
