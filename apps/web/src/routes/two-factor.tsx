import { safeNextPath } from "@ekra/core";
import { Button } from "@ekra/ui/components/button";
import { Input } from "@ekra/ui/components/input";
import { Spinner } from "@ekra/ui/components/spinner";
import { toast } from "@ekra/ui/lib/toast";
import { createFileRoute, Link, useHydrated } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { authClient, authErrorMessage } from "@/lib/auth-client";

// Sign-in sends people here when their account has two-step sign-in on (password, Google or an emailed link).
export const Route = createFileRoute("/two-factor")({
	validateSearch: (search: Record<string, unknown>) => ({
		next: safeNextPath(search.next),
	}),
	head: () => ({ meta: [{ title: "Two-step sign-in · Ekra" }] }),
	component: TwoFactor,
});

function TwoFactor() {
	const { next } = Route.useSearch();
	const hydrated = useHydrated();
	const [backup, setBackup] = useState(false);
	const [code, setCode] = useState("");
	const [trustDevice, setTrustDevice] = useState(false);
	const [busy, setBusy] = useState(false);
	const [expired, setExpired] = useState(false);

	async function verify(value: string) {
		setBusy(true);
		const { error } = backup
			? await authClient.twoFactor.verifyBackupCode({
					code: value.trim(),
					trustDevice,
				})
			: await authClient.twoFactor.verifyTotp({ code: value, trustDevice });
		// keep the spinner until the next page opens
		if (!error) return window.location.assign(next ?? "/");
		setBusy(false);
		setCode("");
		// the step is open for 10 minutes after the first one
		if (error.code === "INVALID_TWO_FACTOR_COOKIE") return setExpired(true);
		toast.error(authErrorMessage(error));
	}

	function submit(event: FormEvent) {
		event.preventDefault();
		if (code) void verify(code);
	}

	if (expired) {
		return (
			<AuthShell
				title="Sign in again"
				description="Too much time passed since the first step. Start over to get a new chance."
			>
				<Link
					to="/sign-in"
					search={{ next, error: undefined, mode: undefined }}
					className="text-center text-sm underline underline-offset-2"
				>
					Back to sign in
				</Link>
			</AuthShell>
		);
	}

	return (
		<AuthShell
			title="Two-step sign-in"
			description={
				backup
					? "Enter one of the backup codes you saved when you turned this on."
					: "Enter the 6-digit code from your authenticator app."
			}
		>
			<form className="flex flex-col gap-4" onSubmit={submit}>
				<Input
					key={backup ? "backup" : "totp"}
					autoFocus
					aria-label={backup ? "Backup code" : "6-digit code"}
					autoComplete="one-time-code"
					inputMode={backup ? "text" : "numeric"}
					maxLength={backup ? 32 : 6}
					placeholder={backup ? "xxxxx-xxxxx" : "123456"}
					spellCheck={false}
					className="h-11 text-center font-mono text-lg tracking-[0.3em]"
					value={code}
					disabled={busy}
					onChange={(e) => {
						const value = backup
							? e.target.value
							: e.target.value.replace(/\D/g, "");
						setCode(value);
						// six digits is a whole code: no need to press Verify
						if (!backup && value.length === 6) void verify(value);
					}}
				/>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						className="size-4 accent-brand"
						checked={trustDevice}
						onChange={(e) => setTrustDevice(e.target.checked)}
					/>
					Trust this device for 30 days
				</label>
				<Button
					type="submit"
					size="lg"
					className="w-full"
					disabled={!hydrated || busy || !code}
					aria-busy={busy}
				>
					{busy && <Spinner />}
					Verify
				</Button>
			</form>
			<button
				type="button"
				className="text-center text-muted-foreground text-sm underline-offset-2 hover:underline"
				onClick={() => {
					setBackup(!backup);
					setCode("");
				}}
			>
				{backup
					? "Use your authenticator app instead"
					: "Use a backup code instead"}
			</button>
		</AuthShell>
	);
}
