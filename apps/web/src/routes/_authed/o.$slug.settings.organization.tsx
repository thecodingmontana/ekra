import { ORG_COLORS, SLUG_MAX, slugProblem } from "@ekra/core";
import { Button } from "@ekra/ui/components/button";
import { Field, FieldError, FieldLabel } from "@ekra/ui/components/field";
import { Input } from "@ekra/ui/components/input";
import { Spinner } from "@ekra/ui/components/spinner";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { type CSSProperties, type FormEvent, useState } from "react";
import { OrgLogo } from "@/components/org-logo";
import { SettingsHeader } from "@/components/settings-ui";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export const Route = createFileRoute("/_authed/o/$slug/settings/organization")({
	head: () => ({ meta: [{ title: "Organization · Ekra" }] }),
	component: Organization,
});

/** The organization's address is a subdomain of wherever this install runs (its BETTER_AUTH_URL). */
const DOMAIN = `.${new URL(__APP_URL__).host}`;

function Organization() {
	const { membership } = Route.useRouteContext();
	const router = useRouter();
	const navigate = useNavigate();
	const org = membership.organization;
	const canEdit = membership.role === "owner" || membership.role === "admin";
	const [name, setName] = useState(org.name);
	const [slug, setSlug] = useState(org.slug);
	const [busy, setBusy] = useState(false);

	const problem = slug ? slugProblem(slug) : "Choose an address";
	const changed = name.trim() !== org.name || slug !== org.slug;

	async function pickColor(color: string | null) {
		const { error } = await authClient.organization.update({
			organizationId: org.id,
			// "" clears it: Ekra's green
			data: { color: color ?? "" },
		});
		if (error) return void toast.error(authErrorMessage(error));
		toast.success("Colour updated");
		await router.invalidate();
	}

	async function save(event: FormEvent) {
		event.preventDefault();
		if (!name.trim() || problem) return;
		setBusy(true);
		const { error } = await authClient.organization.update({
			organizationId: org.id,
			data: { name: name.trim(), slug },
		});
		setBusy(false);
		if (error) return void toast.error(authErrorMessage(error));
		toast.success("Organization saved");
		await router.invalidate();
		// a new address moves the page to it
		if (slug !== org.slug)
			await navigate({
				to: "/o/$slug/settings/organization",
				params: { slug },
				replace: true,
			});
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
			<div className="mb-5 flex items-center gap-3.5">
				<OrgLogo organization={org} px={52} />
				<div>
					<div className="mb-1.5 font-medium text-sm">Colour</div>
					{/* the chosen colour gets a ring; Ekra's green means none */}
					<fieldset className="flex flex-wrap gap-2.5" disabled={!canEdit}>
						<legend className="sr-only">Organization colour</legend>
						{[null, ...ORG_COLORS].map((color) => (
							<label
								key={color ?? "ekra"}
								className={cn(
									"grid size-[22px] cursor-pointer place-items-center rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.08)] transition-transform duration-150 hover:scale-[1.08] has-focus-visible:ring-2 has-focus-visible:ring-ring",
									color === null && "bg-brand",
									(org.color || null) === color &&
										"shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--c)]",
								)}
								style={
									{
										"--c": color ?? "var(--brand)",
										...(color && { background: color }),
									} as CSSProperties
								}
							>
								<input
									type="radio"
									name="org-color"
									className="sr-only"
									checked={(org.color || null) === color}
									onChange={() => pickColor(color)}
									aria-label={color ?? "Ekra green"}
								/>
							</label>
						))}
					</fieldset>
				</div>
			</div>
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
