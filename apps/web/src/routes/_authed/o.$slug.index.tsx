import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ekra/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/o/$slug/")({
	head: ({ match }) => ({
		meta: [{ title: `${match.context.membership.organization.name} · Ekra` }],
	}),
	component: Home,
});

const ROLE_LABEL: Record<string, string> = {
	owner: "Owner",
	admin: "Admin",
	trainer: "Trainer",
	learner: "Learner",
	guest: "Guest",
};

function Home() {
	const { viewer, membership } = Route.useRouteContext();
	const { organization, role } = membership;

	return (
		<main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
			<Card>
				<CardHeader>
					<CardTitle
						className="font-heading text-2xl"
						data-testid="active-organization"
					>
						{organization.name}
					</CardTitle>
					<CardDescription>
						{organization.kind === "creator" ? "Creator" : "Company"} · you're{" "}
						{(ROLE_LABEL[role] ?? role).toLowerCase()} · {organization.slug}
					</CardDescription>
				</CardHeader>
				<CardContent className="text-muted-foreground text-sm">
					Welcome, {viewer.name}. Your learning library arrives in the next
					phase.
				</CardContent>
			</Card>
		</main>
	);
}
