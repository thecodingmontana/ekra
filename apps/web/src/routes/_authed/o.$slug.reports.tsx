import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { canManageContent } from "@/lib/members";

/** Reports are for people who manage content; anyone else gets the not-found page. */
export const Route = createFileRoute("/_authed/o/$slug/reports")({
	beforeLoad: ({ context: { membership } }) => {
		if (!canManageContent(membership.role)) throw notFound();
	},
	component: Outlet,
});
