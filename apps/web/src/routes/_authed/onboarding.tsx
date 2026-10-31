import { SLUG_MAX, slugify, slugProblem } from "@ekra/core";
import { ArrowChip, Button } from "@ekra/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@ekra/ui/components/field";
import { InputWithIcon } from "@ekra/ui/components/input-with-icon";
import {
	createFileRoute,
	useHydrated,
	useRouter,
} from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import type { OrganizationKind } from "@/graphql/viewer";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export const Route = createFileRoute("/_authed/onboarding")({
	head: () => ({ meta: [{ title: "Set up Ekra" }] }),
	component: Onboarding,
});

const KINDS: { value: OrganizationKind; label: string; hint: string }[] = [
	{ value: "company", label: "A company", hint: "Train your own people" },
	{
		value: "creator",
		label: "A creator",
		hint: "Publish courses for learners",
	},
];
const STEP_NAMES = ["kind", "name", "done"] as const;
const STEPS = STEP_NAMES.length;

/** zadaci's onboarding, cut to what Ekra uses today: what you are, your organization's name and address, done. */
function Onboarding() {
	const router = useRouter();
	const hydrated = useHydrated();
	const [step, setStep] = useState(0);
	const [kind, setKind] = useState<OrganizationKind>("company");
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	const url = slugEdited ? slug : slugify(name);
	const urlProblem = url ? slugProblem(url) : null;

	async function next(event: FormEvent) {
		event.preventDefault();
		if (step === 0) return setStep(1);
		if (step === 2) {
			await router.invalidate();
			return router.navigate({ to: "/" });
		}
		if (urlProblem) return;
		setBusy(true);
		setProblem(null);
		const result = await authClient.organization.create({
			name: name.trim(),
			slug: url,
			kind,
		});
		setBusy(false);
		if (result.error) return setProblem(authErrorMessage(result.error));
		setStep(2);
	}

	return (
		<main className="flex flex-1 justify-center px-4 pt-[6vh] pb-10">
			<form onSubmit={next} className="flex w-full max-w-md flex-col gap-4">
				<div className="flex flex-col items-center gap-2">
					<div aria-hidden className="flex gap-1.5">
						{STEP_NAMES.map((name, i) => (
							<span
								key={name}
								className={`h-0.75 w-7 rounded-full ${i <= step ? "bg-brand" : "bg-border"}`}
							/>
						))}
					</div>
					<p className="text-xs text-muted-foreground">
						Step {step + 1} of {STEPS}
					</p>
				</div>

				{step === 0 && (
					<>
						<Heading
							title="Who's Ekra for?"
							description="This shapes what you see first. You can change it later."
						/>
						<fieldset className="grid grid-cols-2 gap-2">
							<legend className="sr-only">This organization is</legend>
							{KINDS.map((option) => (
								<label
									key={option.value}
									className="flex cursor-pointer flex-col gap-1 rounded-lg border bg-card px-3 py-3.5 text-sm transition-[border-color,box-shadow] duration-150 hover:border-foreground/25 has-checked:border-brand has-checked:shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_18%,transparent)] has-focus-visible:ring-2 has-focus-visible:ring-ring"
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
						</fieldset>
					</>
				)}

				{step === 1 && (
					<>
						<Heading
							title="Name your organization"
							description="Your courses, people and progress live here."
						/>
						<Field>
							<FieldLabel htmlFor="org-name">Name</FieldLabel>
							<InputWithIcon
								icon="icon-[solar--buildings-2-linear]"
								id="org-name"
								required
								autoFocus
								maxLength={120}
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</Field>
						<Field data-invalid={urlProblem ? true : undefined}>
							<FieldLabel htmlFor="org-slug">Address</FieldLabel>
							<InputWithIcon
								icon="icon-[solar--link-linear]"
								id="org-slug"
								required
								maxLength={SLUG_MAX}
								value={url}
								aria-invalid={urlProblem ? true : undefined}
								onChange={(e) => {
									setSlugEdited(true);
									setSlug(e.target.value.toLowerCase());
								}}
							/>
							{urlProblem ? (
								<FieldError>{urlProblem}</FieldError>
							) : (
								<FieldDescription>
									{url || "your-name"}.ekra.app
								</FieldDescription>
							)}
						</Field>
						{problem && <FieldError role="alert">{problem}</FieldError>}
					</>
				)}

				{step === 2 && (
					<Heading
						title={`${name.trim()} is ready`}
						description="Next you'll add your first course. Invite your team when you're ready."
					/>
				)}

				<div className="mt-1.5 flex items-center gap-2">
					{step === 1 && (
						<Button type="button" variant="ghost" onClick={() => setStep(0)}>
							Back
						</Button>
					)}
					<span className="flex-1" />
					<Button
						type="submit"
						size="lg"
						disabled={
							!hydrated ||
							busy ||
							(step === 1 && (!name.trim() || !!urlProblem))
						}
					>
						{busy
							? "Creating…"
							: step === 2
								? "Open Ekra"
								: step === 1
									? "Create organization"
									: "Continue"}
						{!busy && <ArrowChip />}
					</Button>
				</div>
			</form>
		</main>
	);
}

function Heading({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="space-y-1 text-center">
			<h1
				className="text-2xl font-semibold tracking-[-0.022em] text-balance"
				data-testid="onboarding-title"
			>
				{title}
			</h1>
			<p className="text-sm text-pretty text-muted-foreground">{description}</p>
		</div>
	);
}
