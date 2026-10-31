import { ArrowChip, Button } from "@ekra/ui/components/button";
import { Field, FieldError, FieldLabel } from "@ekra/ui/components/field";
import { InputWithIcon } from "@ekra/ui/components/input-with-icon";
import { createFileRoute, Link, useHydrated } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { PasswordField } from "@/components/password-field";
import { authClient, authErrorMessage } from "@/lib/auth-client";

// The reset email's link goes through the API, which sends the browser here with ?token= (or ?error= if it expired).
export const Route = createFileRoute("/reset-password")({
	validateSearch: (search: Record<string, unknown>) => ({
		token: typeof search.token === "string" ? search.token : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	head: () => ({ meta: [{ title: "Choose a new password · Ekra" }] }),
	component: ResetPassword,
});

const toSignIn = { next: undefined, error: undefined, mode: undefined };

function ResetPassword() {
	const { token, error } = Route.useSearch();
	const hydrated = useHydrated();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	if (!token || error) {
		return (
			<AuthShell
				title="This link has expired"
				description="Reset links work once, for 60 minutes. Ask for a new one."
			>
				<Link
					to="/sign-in"
					search={{ ...toSignIn, mode: "forgot" }}
					className="text-center text-sm underline underline-offset-2"
				>
					Send a new reset link
				</Link>
			</AuthShell>
		);
	}

	if (done) {
		return (
			<AuthShell
				title="Password changed"
				description="You're signed out on your other devices. Sign in with your new password."
			>
				<Link
					to="/sign-in"
					search={toSignIn}
					className="text-center text-sm underline underline-offset-2"
				>
					Sign in
				</Link>
			</AuthShell>
		);
	}

	async function save(event: FormEvent) {
		event.preventDefault();
		if (password !== confirm)
			return setProblem("The two passwords don't match.");
		setBusy(true);
		setProblem(null);
		const result = await authClient.resetPassword({
			newPassword: password,
			token,
		});
		setBusy(false);
		if (result.error) return setProblem(authErrorMessage(result.error));
		setDone(true);
	}

	return (
		<AuthShell
			title="Choose a new password"
			description="Pick something you don't use anywhere else."
		>
			<form className="flex flex-col gap-3" onSubmit={save}>
				<PasswordField
					id="password"
					label="New password"
					value={password}
					onChange={setPassword}
				/>
				<Field>
					<FieldLabel htmlFor="confirm">Type it again</FieldLabel>
					<InputWithIcon
						icon="icon-[solar--lock-password-linear]"
						id="confirm"
						type="password"
						autoComplete="new-password"
						required
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
					/>
				</Field>
				{problem && <FieldError role="alert">{problem}</FieldError>}
				<Button
					type="submit"
					size="lg"
					className="w-full"
					disabled={!hydrated || busy}
				>
					{busy ? "Saving…" : "Save new password"}
					{!busy && <ArrowChip />}
				</Button>
			</form>
		</AuthShell>
	);
}
