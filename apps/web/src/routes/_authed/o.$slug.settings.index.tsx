import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/o/$slug/settings/")({
	beforeLoad: ({ params }) => {
		throw redirect({ to: "/o/$slug/settings/profile", params });
	},
});
