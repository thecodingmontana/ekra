import {
	createFileRoute,
	notFound,
	Outlet,
	useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * Everything inside one organization lives under its address (/o/acme). The page shows that organization;
 * if the session works in another one, it switches over so the API serves this one too.
 */
export const Route = createFileRoute("/_authed/o/$slug")({
	beforeLoad: ({ context: { viewer }, params }) => {
		const membership = viewer.memberships.find(
			(m) => m.organization.slug === params.slug,
		);
		// not a member: the organization might as well not exist
		if (!membership) throw notFound();
		return { membership };
	},
	component: OrganizationLayout,
});

function OrganizationLayout() {
	const { viewer, membership } = Route.useRouteContext();
	const router = useRouter();
	const id = membership.organization.id;

	// biome-ignore lint/correctness/useExhaustiveDependencies: switch only when the organization changes
	useEffect(() => {
		if (viewer.activeOrganizationId === id) return;
		void authClient.organization
			.setActive({ organizationId: id })
			.then(() => router.invalidate());
	}, [id]);

	return <Outlet />;
}
