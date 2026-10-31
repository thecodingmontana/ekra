import { useApolloClient } from "@apollo/client/react";
import { SLUG_MAX, slugify, slugProblem } from "@ekra/core";
import { ArrowChip, Button, buttonVariants } from "@ekra/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@ekra/ui/components/field";
import { InputWithIcon } from "@ekra/ui/components/input-with-icon";
import {
	createFileRoute,
	Link,
	useHydrated,
	useRouter,
} from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { OrganizationKind } from "@/graphql/viewer";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export const Route = createFileRoute("/_authed/onboarding")({
	head: () => ({ meta: [{ title: "Set up Ekra" }] }),
	component: Onboarding,
});

const KINDS: {
	value: OrganizationKind;
	label: string;
	hint: string;
	icon: string;
}[] = [
	{
		value: "company",
		label: "A company",
		hint: "Train your own people",
		icon: "icon-[solar--buildings-2-bold]",
	},
	{
		value: "creator",
		label: "A creator",
		hint: "Publish courses for learners",
		icon: "icon-[solar--videocamera-record-bold]",
	},
];
const STEP_NAMES = ["kind", "name", "done"] as const;
const STEPS = STEP_NAMES.length;

/** zadaci's onboarding, cut to what Ekra uses today: what you are, your organization's name and address, done. */
function Onboarding() {
	const router = useRouter();
	const apollo = useApolloClient();
	const { viewer } = Route.useRouteContext();
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

	// no organization to go back to yet, so leaving setup signs out
	async function exitBySigningOut() {
		await authClient.signOut();
		await apollo.clearStore();
		await router.navigate({
			to: "/sign-in",
			search: { next: undefined, error: undefined, mode: undefined },
		});
	}

	return (
		<div className="flex min-h-svh flex-col">
			<header className="flex items-center justify-between px-6 py-4.5">
				<Link to="/" className="font-heading text-lg font-semibold">
					Ekra
				</Link>
				<div className="flex items-center gap-2">
					{viewer.memberships.length > 0 ? (
						<Link
							to="/"
							className={buttonVariants({ variant: "ghost", size: "sm" })}
						>
							Exit setup
						</Link>
					) : (
						<Button variant="ghost" size="sm" onClick={exitBySigningOut}>
							Exit setup
						</Button>
					)}
					<ThemeToggle />
				</div>
			</header>
			<main className="flex flex-1 justify-center px-4 pt-[6vh] pb-10">
				<form onSubmit={next} className="flex w-full max-w-md flex-col gap-4">
					<div className="flex flex-col items-center gap-2">
						<div aria-hidden className="flex gap-1.5">
							{STEP_NAMES.map((name, i) => (
								<span
									key={name}
									className={`h-0.75 w-7 rounded-full transition-colors duration-300 ${i <= step ? "bg-brand" : "bg-border"}`}
								/>
							))}
						</div>
						<p className="text-xs text-muted-foreground">
							Step {step + 1} of {STEPS}
						</p>
					</div>

					<div
						key={step}
						className="flex flex-col gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-3 motion-safe:duration-300 motion-safe:ease-out"
					>
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
											className="flex cursor-pointer flex-col gap-2 rounded-lg border bg-card px-3 py-3.5 text-sm transition-[border-color,box-shadow] duration-150 hover:border-foreground/25 has-checked:border-brand has-checked:shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_18%,transparent)] has-focus-visible:ring-2 has-focus-visible:ring-ring"
										>
											<input
												type="radio"
												name="kind"
												value={option.value}
												checked={kind === option.value}
												onChange={() => setKind(option.value)}
												className="sr-only"
											/>
											<span
												className={`${option.icon} size-4.5 transition-colors duration-150 ${kind === option.value ? "text-brand" : "text-muted-foreground"}`}
												aria-hidden="true"
											/>
											<span className="font-medium">{option.label}</span>
											<span className="text-muted-foreground text-xs">
												{option.hint}
											</span>
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
							<>
								<div className="flex justify-center">
									<span className="grid size-12 place-items-center rounded-xl bg-brand/12 text-brand motion-safe:animate-in motion-safe:zoom-in-90 motion-safe:fade-in motion-safe:duration-300">
										<span
											className="icon-[solar--check-circle-bold] size-6"
											aria-hidden="true"
										/>
									</span>
								</div>
								<Heading
									title={`${name.trim()} is ready`}
									description="Next you'll add your first course. Invite your team when you're ready."
								/>
							</>
						)}
					</div>

					<div className="mt-1.5 flex items-center gap-2">
						{step === 1 && (
							<Button type="button" variant="ghost" onClick={() => setStep(0)}>
								<span
									className="icon-[solar--arrow-left-linear] size-3.5"
									aria-hidden="true"
								/>
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
							{busy && (
								<span
									className="icon-[hugeicons--loading-03] size-4 motion-safe:animate-spin"
									aria-hidden="true"
								/>
							)}
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
		</div>
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
