import { useApolloClient } from "@apollo/client/react";
import { Button } from "@ekra/ui/components/button";
import {
	createFileRoute,
	Outlet,
	redirect,
	useLocation,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme-toggle";
import { VIEWER, type Viewer } from "@/graphql/viewer";
import { authClient } from "@/lib/auth-client";

/** Everything behind sign-in. Signed-out visitors go to /sign-in and come back here afterwards. */
export const Route = createFileRoute("/_authed")({
	beforeLoad: async ({ context, location }) => {
		const { data } = await context.apolloClient.query<{
			viewer: Viewer | null;
		}>({
			query: VIEWER,
			fetchPolicy: "network-only",
		});
		if (!data?.viewer) {
			throw redirect({
				to: "/sign-in",
				search: { next: location.href, error: undefined, mode: undefined },
			});
		}
		return { viewer: data.viewer };
	},
	component: AuthedLayout,
});

function AuthedLayout() {
	const { viewer } = Route.useRouteContext();
	const router = useRouter();
	const navigate = useNavigate();
	const apollo = useApolloClient();
	const pathname = useLocation({ select: (l) => l.pathname });
	const hasOrganizations = viewer.memberships.length > 0;

	async function switchTo(organizationId: string) {
		await authClient.organization.setActive({ organizationId });
		await router.invalidate();
	}

	async function signOut() {
		await authClient.signOut();
		await apollo.clearStore();
		await navigate({
			to: "/sign-in",
			search: { next: undefined, error: undefined, mode: undefined },
		});
	}

	// onboarding draws its own header (Exit setup + theme), like zadaci
	if (pathname === "/onboarding") return <Outlet />;

	return (
		<div className="flex min-h-svh flex-col">
			<header className="flex items-center gap-4 px-6 py-4.5">
				<span className="font-heading text-lg font-semibold">Ekra</span>
				{hasOrganizations && (
					<label className="flex items-center gap-2 text-sm">
						<span className="sr-only">Organization</span>
						<select
							className="rounded-md border bg-background px-2 py-1 text-sm"
							value={viewer.activeOrganizationId ?? ""}
							onChange={(event) => switchTo(event.target.value)}
							data-testid="organization-switcher"
						>
							{!viewer.activeOrganizationId && (
								<option value="" disabled>
									Choose an organization
								</option>
							)}
							{viewer.memberships.map(({ organization }) => (
								<option key={organization.id} value={organization.id}>
									{organization.name}
								</option>
							))}
						</select>
					</label>
				)}
				<span className="flex-1" />
				<Button variant="ghost" size="sm" onClick={signOut}>
					Sign out
				</Button>
				<ThemeToggle />
			</header>
			<Outlet />
		</div>
	);
}
