import { Button } from "@ekra/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ekra/ui/components/card";
import { Field, FieldError, FieldLabel } from "@ekra/ui/components/field";
import { Input } from "@ekra/ui/components/input";
import { createFileRoute, redirect, useHydrated } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { SIGN_IN_METHODS, VIEWER, type Viewer } from "@/graphql/viewer";
import { authClient, signInLinkError } from "@/lib/auth-client";

/** Only same-site paths, so a sign-in link can't send people to another site. */
const safeNext = (value: unknown) =>
	typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
		? value
		: undefined;

export const Route = createFileRoute("/sign-in")({
	validateSearch: (search: Record<string, unknown>) => ({
		next: safeNext(search.next),
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	beforeLoad: async ({ context, search }) => {
		const { data } = await context.apolloClient.query<{
			viewer: Viewer | null;
		}>({
			query: VIEWER,
			fetchPolicy: "network-only",
		});
		if (data?.viewer) throw redirect({ href: search.next ?? "/" });
	},
	loader: async ({ context }) => {
		const { data } = await context.apolloClient.query<{
			signInMethods: string[];
		}>({
			query: SIGN_IN_METHODS,
		});
		return { methods: data?.signInMethods ?? ["email-link"] };
	},
	head: () => ({ meta: [{ title: "Sign in · Ekra" }] }),
	component: SignIn,
});

function SignIn() {
	const { methods } = Route.useLoaderData();
	const { next, error } = Route.useSearch();
	const [email, setEmail] = useState("");
	const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
	const [problem, setProblem] = useState<string | null>(signInLinkError(error));
	// until the page is interactive, a click would submit the bare HTML form and lose what was typed
	const hydrated = useHydrated();
	const callbackURL = next ?? "/";

	async function sendLink(event: FormEvent) {
		event.preventDefault();
		setState("sending");
		setProblem(null);
		const result = await authClient.signIn.magicLink({
			email,
			callbackURL,
			errorCallbackURL: "/sign-in",
		});
		if (result.error) {
			setState("idle");
			setProblem(result.error.message ?? "Couldn't send the link. Try again.");
			return;
		}
		setState("sent");
	}

	return (
		<main className="flex min-h-svh items-center justify-center p-6">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="font-heading text-xl">
						Sign in to Ekra
					</CardTitle>
					<CardDescription>
						{state === "sent"
							? `We sent a sign-in link to ${email}. Open it on this device to continue. It works once, for 10 minutes.`
							: "We'll email you a link that signs you in. No password needed."}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{state === "sent" ? (
						<Button variant="outline" onClick={() => setState("idle")}>
							Use a different email
						</Button>
					) : (
						<form onSubmit={sendLink} className="flex flex-col gap-4">
							<Field data-invalid={problem ? true : undefined}>
								<FieldLabel htmlFor="email">Email</FieldLabel>
								<Input
									id="email"
									type="email"
									autoComplete="email"
									required
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									aria-invalid={problem ? true : undefined}
								/>
								{problem && <FieldError>{problem}</FieldError>}
							</Field>
							<Button type="submit" disabled={!hydrated || state === "sending"}>
								{state === "sending" ? "Sending…" : "Email me a sign-in link"}
							</Button>
						</form>
					)}
					{methods.includes("google") && state !== "sent" && (
						<Button
							variant="outline"
							onClick={() =>
								authClient.signIn.social({ provider: "google", callbackURL })
							}
						>
							Continue with Google
						</Button>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
