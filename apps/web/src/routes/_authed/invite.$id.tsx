import { gql } from "@apollo/client";
import { Button, buttonVariants } from "@ekra/ui/components/button";
import { toast } from "@ekra/ui/lib/toast";
import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { OrgLogo } from "@/components/org-logo";
import type { Membership } from "@/graphql/viewer";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { mainRole, ROLE_LABEL } from "@/lib/members";
import { useSignOut } from "@/lib/use-sign-out";

type Invitation = {
	id: string;
	email: string;
	role: string;
	inviterName: string;
	forYou: boolean;
	joinedSlug: string | null;
	organization: Pick<
		Membership["organization"],
		"id" | "name" | "slug" | "logo" | "color"
	>;
};

const INVITATION = gql`
	query InvitationPreview($id: ID!) {
		invitationPreview(id: $id) {
			id
			email
			role
			inviterName
			forYou
			joinedSlug
			organization {
				id
				name
				slug
				logo
				color
			}
		}
	}
`;

// Where an invitation email lands: you see the organization and who invited you, then accept or decline.
// Nobody joins without accepting here. Signing in first (new account or not) brings you back.
export const Route = createFileRoute("/_authed/invite/$id")({
	loader: async ({ context, params }) => {
		const { data, error } = await context.apolloClient.query<{
			invitationPreview: Invitation | null;
		}>({
			query: INVITATION,
			variables: { id: params.id },
			fetchPolicy: "network-only",
		});
		if (error) throw error;
		return { invitation: data?.invitationPreview ?? null };
	},
	head: () => ({ meta: [{ title: "Join an organization · Ekra" }] }),
	component: InvitePage,
	errorComponent: ({ error }) => (
		<AuthShell
			title="Couldn't open this invitation"
			description={
				error instanceof Error ? error.message : "Try the link again."
			}
		>
			<GoHome />
		</AuthShell>
	),
});

function GoHome() {
	return (
		<Link
			to="/"
			className={buttonVariants({
				variant: "outline",
				size: "lg",
				className: "w-full",
			})}
		>
			Go to Ekra
		</Link>
	);
}

function SignInAs({ email, id }: { email: string; id: string }) {
	const signOut = useSignOut(`/invite/${id}`);
	const [leaving, setLeaving] = useState(false);
	return (
		<Button
			size="lg"
			className="w-full"
			disabled={leaving}
			onClick={async () => {
				setLeaving(true);
				await signOut();
			}}
		>
			Sign in as {email}
		</Button>
	);
}

function InvitePage() {
	const { invitation } = Route.useLoaderData();
	const { viewer } = Route.useRouteContext();
	const navigate = useNavigate();
	const router = useRouter();
	const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

	if (!invitation)
		return (
			<AuthShell
				title="This invitation is no longer valid"
				description="It was cancelled, already used, or is more than 7 days old. Ask whoever invited you for a new one."
			>
				<GoHome />
			</AuthShell>
		);

	if (invitation.joinedSlug)
		return (
			<AuthShell
				title={`You're already in ${invitation.organization.name}`}
				description="Nothing to accept: it's in your organizations."
			>
				<Link
					to="/o/$slug"
					params={{ slug: invitation.joinedSlug }}
					className={buttonVariants({ size: "lg", className: "w-full" })}
				>
					Open {invitation.organization.name}
				</Link>
			</AuthShell>
		);

	if (!invitation.forYou)
		return (
			<AuthShell
				title="This invitation is for someone else"
				description={
					<>
						It was sent to <b className="text-foreground">{invitation.email}</b>
						, and you're signed in as{" "}
						<b className="text-foreground">{viewer.email}</b>.
					</>
				}
			>
				<div className="flex flex-col gap-2">
					<SignInAs email={invitation.email} id={invitation.id} />
					<GoHome />
				</div>
			</AuthShell>
		);

	const role = ROLE_LABEL[mainRole(invitation.role)];

	async function accept() {
		if (!invitation) return;
		setBusy("accept");
		const { error } = await authClient.organization.acceptInvitation({
			invitationId: invitation.id,
		});
		if (!error)
			await authClient.organization.setActive({
				organizationId: invitation.organization.id,
			});
		setBusy(null);
		if (error)
			return void toast.error("Couldn't join the organization", {
				desc: authErrorMessage(error),
			});
		await router.invalidate();
		await navigate({
			to: "/o/$slug",
			params: { slug: invitation.organization.slug },
		});
	}

	async function decline() {
		if (!invitation) return;
		setBusy("decline");
		const { error } = await authClient.organization.rejectInvitation({
			invitationId: invitation.id,
		});
		setBusy(null);
		if (error)
			return void toast.error("Couldn't decline the invitation", {
				desc: authErrorMessage(error),
			});
		toast.success(
			`You declined the invitation to ${invitation.organization.name}`,
		);
		await router.invalidate();
		await navigate({ to: "/" });
	}

	return (
		<AuthShell
			title={`Join ${invitation.organization.name}`}
			description={`${invitation.inviterName} invited you to join as ${/^[aeiou]/i.test(role) ? "an" : "a"} ${role.toLowerCase()}.`}
		>
			<div className="flex items-center gap-3 rounded-lg border p-4">
				<OrgLogo organization={invitation.organization} px={40} />
				<div className="min-w-0 text-sm">
					<p className="truncate font-medium">{invitation.organization.name}</p>
					<p className="text-muted-foreground">{role}</p>
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<Button
					size="lg"
					className="w-full"
					disabled={!!busy}
					aria-busy={busy === "accept"}
					data-testid="accept-invitation"
					onClick={() => void accept()}
				>
					{busy === "accept" ? "Joining…" : "Accept and join"}
				</Button>
				<Button
					variant="outline"
					size="lg"
					className="w-full"
					disabled={!!busy}
					aria-busy={busy === "decline"}
					onClick={() => void decline()}
				>
					{busy === "decline" ? "Declining…" : "Decline"}
				</Button>
			</div>
			<p className="text-center text-muted-foreground text-xs text-pretty">
				Signed in as {viewer.email}
			</p>
		</AuthShell>
	);
}
