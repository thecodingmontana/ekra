import { SLUG_MAX, slugProblem } from "@ekra/core";
import { Button } from "@ekra/ui/components/button";
import { Field, FieldError, FieldLabel } from "@ekra/ui/components/field";
import { Input } from "@ekra/ui/components/input";
import { Spinner } from "@ekra/ui/components/spinner";
import { toast } from "@ekra/ui/lib/toast";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { SettingsHeader } from "@/components/settings-ui";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export const Route = createFileRoute("/_authed/settings/organization")({
	// there's nothing to show without an organization to be in
	beforeLoad: ({ context }) => {
		if (!context.viewer.activeOrganizationId)
			throw redirect({ to: "/settings/profile" });
	},
	head: () => ({ meta: [{ title: "Organization · Ekra" }] }),
	component: Organization,
});

/** shortcut: the hosted domain isn't decided yet; read it from config once subdomains land (Phase 1d). */
const DOMAIN = ".ekra.app";

function Organization() {
	const { viewer } = Route.useRouteContext();
	const router = useRouter();
	const membership = viewer.memberships.find(
		(m) => m.organization.id === viewer.activeOrganizationId,
	);
	const org = membership?.organization;
	const canEdit = membership?.role === "owner" || membership?.role === "admin";
	const [name, setName] = useState(org?.name ?? "");
	const [slug, setSlug] = useState(org?.slug ?? "");
	const [busy, setBusy] = useState(false);
	if (!org) return null;

	const problem = slug ? slugProblem(slug) : "Choose an address";
	const changed = name.trim() !== org.name || slug !== org.slug;

	async function save(event: FormEvent) {
		event.preventDefault();
		if (!org || !name.trim() || problem) return;
		setBusy(true);
		const { error } = await authClient.organization.update({
			organizationId: org.id,
			data: { name: name.trim(), slug },
		});
		setBusy(false);
		if (error) return void toast.error(authErrorMessage(error));
		toast.success("Organization saved");
		await router.invalidate();
	}

	return (
		<>
			<SettingsHeader
				title="Organization"
				lead={
					canEdit
						? "Your organization's name and web address."
						: "Only owners and admins can change these."
				}
			/>
			<form onSubmit={save} className="flex max-w-[440px] flex-col gap-4">
				<Field>
					<FieldLabel htmlFor="org-name">Organization name</FieldLabel>
					<Input
						id="org-name"
						className="h-10"
						maxLength={120}
						placeholder="e.g. Acme Academy"
						disabled={!canEdit}
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</Field>
				<Field data-invalid={canEdit && problem ? true : undefined}>
					<FieldLabel htmlFor="org-slug">Organization address</FieldLabel>
					<div className="flex">
						<Input
							id="org-slug"
							className="h-10 rounded-r-none"
							maxLength={SLUG_MAX}
							placeholder="acme-academy"
							disabled={!canEdit}
							value={slug}
							aria-invalid={canEdit && problem ? true : undefined}
							onChange={(e) =>
								setSlug(
									e.target.value
										.toLowerCase()
										.replace(/[^a-z0-9-]+/g, "-")
										.slice(0, SLUG_MAX),
								)
							}
						/>
						<span className="flex items-center rounded-r-md border border-l-0 bg-muted px-3 text-muted-foreground text-sm">
							{DOMAIN}
						</span>
					</div>
					{canEdit && problem && <FieldError>{problem}</FieldError>}
				</Field>
				{canEdit && (
					<div>
						<Button
							type="submit"
							disabled={busy || !changed || !name.trim() || !!problem}
							aria-busy={busy}
						>
							{busy && <Spinner />}
							Save
						</Button>
					</div>
				)}
			</form>
		</>
	);
}
