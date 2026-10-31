import { SLUG_MAX, slugify, slugProblem } from "@ekra/core";
import { Button } from "@ekra/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ekra/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@ekra/ui/components/field";
import { Input } from "@ekra/ui/components/input";
import { useHydrated, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import type { OrganizationKind } from "@/graphql/viewer";
import { authClient } from "@/lib/auth-client";

const KINDS: { value: OrganizationKind; label: string; hint: string }[] = [
	{ value: "company", label: "A company", hint: "Train your own people" },
	{
		value: "creator",
		label: "A creator",
		hint: "Publish courses for learners",
	},
];

/** Name an organization; its URL name follows the name until edited. The server checks the rules again. */
export function CreateOrganization({
	firstOne = false,
}: {
	firstOne?: boolean;
}) {
	const router = useRouter();
	const hydrated = useHydrated();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const [kind, setKind] = useState<OrganizationKind>("company");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const effectiveSlug = slugEdited ? slug : slugify(name);
	const slugError = effectiveSlug ? slugProblem(effectiveSlug) : null;

	async function create(event: FormEvent) {
		event.preventDefault();
		if (slugError) return;
		setBusy(true);
		setError(null);
		const result = await authClient.organization.create({
			name: name.trim(),
			slug: effectiveSlug,
			kind,
		});
		setBusy(false);
		if (result.error) {
			setError(
				result.error.message ?? "Couldn't create the organization. Try again.",
			);
			return;
		}
		await router.invalidate();
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-heading text-xl">
					{firstOne ? "Create your organization" : "New organization"}
				</CardTitle>
				<CardDescription>
					Your courses, people and progress live in an organization. You can
					create more later.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={create} className="flex flex-col gap-5">
					<Field>
						<FieldLabel htmlFor="org-name">Name</FieldLabel>
						<Input
							id="org-name"
							required
							maxLength={120}
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>
					<Field data-invalid={slugError ? true : undefined}>
						<FieldLabel htmlFor="org-slug">URL name</FieldLabel>
						<Input
							id="org-slug"
							required
							maxLength={SLUG_MAX}
							value={effectiveSlug}
							onChange={(event) => {
								setSlugEdited(true);
								setSlug(event.target.value.toLowerCase());
							}}
							aria-invalid={slugError ? true : undefined}
						/>
						{slugError ? (
							<FieldError>{slugError}</FieldError>
						) : (
							<FieldDescription>
								Your address: {effectiveSlug || "your-name"}.ekra.app
							</FieldDescription>
						)}
					</Field>
					<FieldSet>
						<FieldLegend>This organization is</FieldLegend>
						<div className="grid grid-cols-2 gap-2">
							{KINDS.map((option) => (
								<label
									key={option.value}
									className="flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
								>
									<input
										type="radio"
										name="kind"
										value={option.value}
										checked={kind === option.value}
										onChange={() => setKind(option.value)}
										className="sr-only"
									/>
									<span className="font-medium">{option.label}</span>
									<span className="text-muted-foreground">{option.hint}</span>
								</label>
							))}
						</div>
					</FieldSet>
					{error && <FieldError>{error}</FieldError>}
					<Button
						type="submit"
						disabled={!hydrated || busy || !name.trim() || !!slugError}
					>
						{busy ? "Creating…" : "Create organization"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
