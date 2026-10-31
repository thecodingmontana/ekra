import { Button } from "@ekra/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ekra/ui/components/card";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { CreateOrganization } from "@/components/create-organization";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_authed/")({
	head: () => ({ meta: [{ title: "Home · Ekra" }] }),
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
	const { viewer } = Route.useRouteContext();
	const router = useRouter();
	const active = viewer.memberships.find(
		(m) => m.organization.id === viewer.activeOrganizationId,
	);

	if (viewer.memberships.length === 0) {
		return (
			<main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center p-6">
				<CreateOrganization firstOne />
			</main>
		);
	}

	if (!active) {
		return (
			<main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 p-6">
				<h1 className="font-heading text-xl font-semibold">
					Choose an organization
				</h1>
				<ul className="flex flex-col gap-2">
					{viewer.memberships.map(({ organization, role }) => (
						<li key={organization.id}>
							<Button
								variant="outline"
								className="w-full justify-between"
								onClick={async () => {
									await authClient.organization.setActive({
										organizationId: organization.id,
									});
									await router.invalidate();
								}}
							>
								<span>{organization.name}</span>
								<span className="text-muted-foreground">
									{ROLE_LABEL[role] ?? role}
								</span>
							</Button>
						</li>
					))}
				</ul>
			</main>
		);
	}

	return (
		<main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
			<Card>
				<CardHeader>
					<CardTitle
						className="font-heading text-2xl"
						data-testid="active-organization"
					>
						{active.organization.name}
					</CardTitle>
					<CardDescription>
						{active.organization.kind === "creator" ? "Creator" : "Company"} ·
						you're {(ROLE_LABEL[active.role] ?? active.role).toLowerCase()} ·{" "}
						{active.organization.slug}
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
