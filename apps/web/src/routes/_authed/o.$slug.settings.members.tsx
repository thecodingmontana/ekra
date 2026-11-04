import { Av } from "@ekra/ui/components/av";
import { Button } from "@ekra/ui/components/button";
import { Input } from "@ekra/ui/components/input";
import {
	Menu,
	MenuContent,
	MenuItem,
	MenuLabel,
	MenuSeparator,
	MenuTrigger,
} from "@ekra/ui/components/menu";
import { ConfirmModal } from "@ekra/ui/components/modal";
import { Spinner } from "@ekra/ui/components/spinner";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { SBlock, SettingsHeader } from "@/components/settings-ui";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { authGet } from "@/lib/auth-get";
import {
	assignableRoles,
	canManageContent,
	canManageMember,
	canManageMembers,
	mainRole,
	ROLE_HELP,
	ROLE_LABEL,
	type Role,
	rolesOf,
} from "@/lib/members";

type Member = {
	id: string;
	userId: string;
	role: string;
	user: { name: string; email: string; image: string | null };
};
type Invitation = {
	id: string;
	email: string;
	role: string;
	status: string;
	expiresAt: string;
};

export const Route = createFileRoute("/_authed/o/$slug/settings/members")({
	head: () => ({ meta: [{ title: "Members · Ekra" }] }),
	// the list shows everyone's email: only for people who run the organization (the API refuses others too)
	beforeLoad: ({ context: { membership } }) => {
		if (!canManageContent(membership.role)) throw notFound();
	},
	loader: async ({ context: { membership } }) => {
		const org = encodeURIComponent(membership.organization.id);
		const [members, invitations] = await Promise.all([
			authGet<{ members: Member[] }>(
				`/organization/list-members?organizationId=${org}&limit=1000`,
			),
			canManageMembers(membership.role)
				? authGet<Invitation[]>(
						`/organization/list-invitations?organizationId=${org}`,
					)
				: null,
		]);
		if (members.error)
			throw new Error(members.error.message ?? "Couldn't load the members");
		const now = Date.now();
		return {
			members: members.data.members,
			invitations: (invitations?.data ?? []).filter(
				(i) => i.status === "pending" && new Date(i.expiresAt).getTime() > now,
			),
		};
	},
	component: Members,
});

const PILL =
	"inline-flex h-[26px] items-center gap-1.5 rounded-[6px] px-[7px] text-foreground text-sm transition-colors duration-150 hover:bg-muted";
const CELL = "border-border/70 border-b px-2 py-[9px] text-left";

function Members() {
	const { membership, viewer } = Route.useRouteContext();
	const { members, invitations } = Route.useLoaderData();
	const router = useRouter();
	const [removing, setRemoving] = useState<Member | null>(null);
	const org = membership.organization;
	const canAdmin = canManageMembers(membership.role);
	const me = { userId: viewer.id, role: membership.role };
	const owners = members.filter((m) =>
		rolesOf(m.role).includes("owner"),
	).length;

	async function changeRole(m: Member, role: Role) {
		if (mainRole(m.role) === role) return;
		const { error } = await authClient.organization.updateMemberRole({
			organizationId: org.id,
			memberId: m.id,
			role,
		});
		if (error) return void toast.error(authErrorMessage(error));
		toast.success(`${m.user.name} is now ${article(ROLE_LABEL[role])}`);
		await router.invalidate();
	}

	async function cancel(invitation: Invitation) {
		const { error } = await authClient.organization.cancelInvitation({
			invitationId: invitation.id,
		});
		if (error) return void toast.error(authErrorMessage(error));
		toast.success(`Invitation to ${invitation.email} cancelled`);
		await router.invalidate();
	}

	return (
		<>
			<SettingsHeader
				title="Members"
				lead={`${count(members.length, "person", "people")} in ${org.name}${canAdmin ? ` · ${invitations.length} pending` : ""}`}
			/>
			{canAdmin && <InviteForm viewerRole={membership.role} />}
			<SBlock title={canAdmin ? "People" : undefined} first={!canAdmin}>
				<div className="relative mt-2 overflow-x-auto rounded-[10px] border bg-card">
					<table className="w-full min-w-[520px] border-collapse text-sm">
						<thead>
							<tr>
								<th
									className={cn(
										CELL,
										"pl-3.5 font-medium text-muted-foreground text-xs",
									)}
								>
									Member
								</th>
								<th
									className={cn(
										CELL,
										"font-medium text-muted-foreground text-xs",
									)}
								>
									Role
								</th>
								<th
									className={cn(
										CELL,
										"font-medium text-muted-foreground text-xs",
									)}
								>
									Status
								</th>
								<th className={CELL}>
									<span className="sr-only">Actions</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{members.map((m) => {
								const manage = canManageMember({
									viewer: me,
									member: m,
									owners,
								});
								const role = mainRole(m.role);
								return (
									<tr key={m.id} data-testid="member-row">
										<td className={cn(CELL, "pl-3.5")}>
											<span className="flex items-center gap-2.5">
												<Av name={m.user.name} image={m.user.image} size="md" />
												<span className="flex min-w-0 flex-col">
													<b className="truncate font-medium">
														{m.user.name}
														{m.userId === viewer.id && (
															<span className="font-normal text-muted-foreground">
																{" "}
																(you)
															</span>
														)}
													</b>
													<span className="truncate text-muted-foreground text-xs">
														{m.user.email}
													</span>
												</span>
											</span>
										</td>
										<td className={CELL}>
											{manage ? (
												<Menu>
													<MenuTrigger
														render={
															<button
																type="button"
																className={cn(PILL, "border")}
																aria-label={`Role for ${m.user.name}`}
															/>
														}
													>
														{ROLE_LABEL[role]}
														<span
															className="icon-[solar--alt-arrow-down-linear] size-3"
															aria-hidden="true"
														/>
													</MenuTrigger>
													<MenuContent width={260} align="start">
														<RoleChoices
															title={`Role for ${m.user.name}`}
															roles={assignableRoles(membership.role)}
															current={role}
															onPick={(r) => void changeRole(m, r)}
														/>
													</MenuContent>
												</Menu>
											) : (
												<span className={PILL}>
													{role === "owner" && (
														<span
															className="icon-[solar--crown-linear] size-[13px]"
															aria-hidden="true"
														/>
													)}
													{ROLE_LABEL[role]}
												</span>
											)}
										</td>
										<td className={CELL}>
											<Badge tone="green">Active</Badge>
										</td>
										<td className={cn(CELL, "w-10 pr-2 text-right")}>
											{manage && (
												<Menu>
													<MenuTrigger
														render={
															<button
																type="button"
																className="inline-grid size-[26px] place-items-center rounded-[6px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
																aria-label={`Options for ${m.user.name}`}
															/>
														}
													>
														<span
															className="icon-[solar--menu-dots-linear] size-3.5"
															aria-hidden="true"
														/>
													</MenuTrigger>
													<MenuContent>
														<MenuItem
															icon="icon-[solar--user-minus-linear]"
															danger
															onSelect={() => setRemoving(m)}
														>
															Remove from organization
														</MenuItem>
													</MenuContent>
												</Menu>
											)}
										</td>
									</tr>
								);
							})}
							{invitations.map((i) => (
								<tr key={i.id} data-testid="invitation-row">
									<td className={cn(CELL, "pl-3.5")}>
										<span className="flex items-center gap-2.5">
											<Av name={i.email} size="md" />
											<span className="flex min-w-0 flex-col">
												<b className="truncate font-medium">{i.email}</b>
												<span className="text-muted-foreground text-xs">
													Invitation pending
												</span>
											</span>
										</span>
									</td>
									<td className={CELL}>
										<span className={PILL}>{ROLE_LABEL[mainRole(i.role)]}</span>
									</td>
									<td className={CELL}>
										<Badge tone="amber">Invited</Badge>
									</td>
									<td className={cn(CELL, "pr-2 text-right")}>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => void cancel(i)}
										>
											Cancel
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</SBlock>
			<ConfirmModal
				open={!!removing}
				onOpenChange={(open) => !open && setRemoving(null)}
				title={`Remove ${removing?.user.name ?? ""}?`}
				body={`${removing?.user.name ?? ""} will lose access to ${org.name} immediately.`}
				ok="Remove member"
				danger
				icon="icon-[solar--user-minus-linear]"
				onConfirm={async () => {
					if (!removing) return;
					const { error } = await authClient.organization.removeMember({
						organizationId: org.id,
						memberIdOrEmail: removing.id,
					});
					if (error) return void toast.error(authErrorMessage(error));
					toast.success(`Removed ${removing.user.name}`);
					setRemoving(null);
					await router.invalidate();
				}}
			/>
		</>
	);
}

/** Email plus role; Better Auth sends the invitation email. */
function InviteForm({ viewerRole }: { viewerRole: string }) {
	const { membership } = Route.useRouteContext();
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<Role>("learner");
	const [busy, setBusy] = useState(false);

	async function invite(event: FormEvent) {
		event.preventDefault();
		const address = email.trim();
		if (!address) return;
		setBusy(true);
		const { error } = await authClient.organization.inviteMember({
			organizationId: membership.organization.id,
			email: address,
			// the browser client only knows Better Auth's default roles; the server checks Ekra's
			role: role as "member",
		});
		setBusy(false);
		if (error) return void toast.error(authErrorMessage(error));
		toast.success(`Invitation sent to ${address}`);
		setEmail("");
		await router.invalidate();
	}

	return (
		<SBlock title="Invite people" first>
			<p className="mb-3 text-muted-foreground text-sm">
				They get an email with a link to join. It works for 7 days.
			</p>
			<form onSubmit={invite} className="flex flex-wrap items-center gap-2">
				<Input
					type="email"
					required
					className="h-[30px] min-w-0 flex-1 basis-56"
					placeholder="name@company.com"
					aria-label="Email address"
					data-testid="invite-email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
				<Menu>
					<MenuTrigger
						render={
							<button
								type="button"
								className={cn(PILL, "h-[30px] border")}
								aria-label="Role"
								data-testid="invite-role"
							/>
						}
					>
						{ROLE_LABEL[role]}
						<span
							className="icon-[solar--alt-arrow-down-linear] size-3"
							aria-hidden="true"
						/>
					</MenuTrigger>
					<MenuContent width={260}>
						<RoleChoices
							title="Invite as"
							roles={assignableRoles(viewerRole)}
							current={role}
							onPick={setRole}
						/>
					</MenuContent>
				</Menu>
				<Button type="submit" disabled={busy || !email.trim()} aria-busy={busy}>
					{busy ? (
						<Spinner />
					) : (
						<span
							className="icon-[solar--user-plus-linear] size-3.5"
							aria-hidden="true"
						/>
					)}
					Invite
				</Button>
			</form>
		</SBlock>
	);
}

function RoleChoices({
	title,
	roles,
	current,
	onPick,
}: {
	title: string;
	roles: readonly Role[];
	current: Role;
	onPick: (role: Role) => void;
}) {
	return (
		<>
			<MenuLabel>{title}</MenuLabel>
			<MenuSeparator />
			{roles.map((r) => (
				<MenuItem key={r} checked={current === r} onSelect={() => onPick(r)}>
					<div className="grow whitespace-normal py-1">
						<div className="font-medium">{ROLE_LABEL[r]}</div>
						<div className="text-[11.5px] text-muted-foreground">
							{ROLE_HELP[r]}
						</div>
					</div>
				</MenuItem>
			))}
		</>
	);
}

function Badge({
	tone,
	children,
}: {
	tone: "green" | "amber";
	children: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex h-5 items-center gap-[5px] rounded-[5px] px-[7px] font-medium text-xs",
				tone === "green"
					? "bg-tint-green/12 text-tint-green"
					: "bg-tint-amber/12 text-tint-amber",
			)}
		>
			<span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
			{children}
		</span>
	);
}

const count = (n: number, one: string, many: string) =>
	`${n} ${n === 1 ? one : many}`;
const article = (word: string) =>
	`${/^[aeiou]/i.test(word) ? "an" : "a"} ${word.toLowerCase()}`;
