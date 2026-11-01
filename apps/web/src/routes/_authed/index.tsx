import { createFileRoute, redirect } from "@tanstack/react-router";

/** "/" opens your current organization (or your first), and sends someone with none to set one up. */
export const Route = createFileRoute("/_authed/")({
	beforeLoad: ({ context: { viewer } }) => {
		const membership =
			viewer.memberships.find(
				(m) => m.organization.id === viewer.activeOrganizationId,
			) ?? viewer.memberships[0];
		if (!membership) throw redirect({ to: "/onboarding" });
		throw redirect({
			to: "/o/$slug",
			params: { slug: membership.organization.slug },
		});
	},
});
