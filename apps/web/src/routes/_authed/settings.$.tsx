import { createFileRoute, redirect } from "@tanstack/react-router";

/** Settings without an organization in the address (/settings/security) open it in your current one. */
export const Route = createFileRoute("/_authed/settings/$")({
	beforeLoad: ({ context: { viewer }, params }) => {
		const membership =
			viewer.memberships.find(
				(m) => m.organization.id === viewer.activeOrganizationId,
			) ?? viewer.memberships[0];
		if (!membership) throw redirect({ to: "/onboarding" });
		throw redirect({
			href: `/o/${membership.organization.slug}/settings/${params._splat || "profile"}`,
		});
	},
});
