import { ArrowChip, Button, buttonVariants } from "@ekra/ui/components/button";
import { Field, FieldError, FieldLabel } from "@ekra/ui/components/field";
import { InputWithIcon } from "@ekra/ui/components/input-with-icon";
import { Spinner } from "@ekra/ui/components/spinner";
import { toast } from "@ekra/ui/lib/toast";
import { Link, useHydrated } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { PasswordField } from "@/components/password-field";
import {
	authClient,
	authErrorMessage,
	linkErrorMessage,
} from "@/lib/auth-client";

export const MODES = ["sign-in", "email", "sign-up", "forgot", "link"] as const;
export type Mode = (typeof MODES)[number];

/** Only same-site paths, so a sign-in link can't send people to another site. */
export const safeNext = (value: unknown) =>
	typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
		? value
		: undefined;

const COPY: Record<Mode, { title: string; description: string }> = {
	"sign-in": {
		title: "Welcome to Ekra",
		description: "Sign in with Google, your email or a passkey.",
	},
	email: {
		title: "Sign in with email",
		description: "Use your password, or get a sign-in link.",
	},
	"sign-up": {
		title: "Create your account",
		description: "Start teaching or learning with Ekra.",
	},
	forgot: {
		title: "Forgot your password?",
		description: "We'll email you a link to choose a new one.",
	},
	link: {
		title: "Sign in with a link",
		description:
			"We'll email you a link that signs you in. No password needed.",
	},
};

/** The sign-in page (and /sign-up, which opens it in sign-up mode). */
export function SignInPage({
	mode,
	methods,
	next,
	error,
}: {
	mode: Mode;
	methods: string[];
	next?: string;
	error?: string;
}) {
	const hydrated = useHydrated();
	// sign-up opens on its method chooser; picking email shows the form
	const [withEmail, setWithEmail] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	// which action is running: its button shows a spinner and the others wait
	const [busy, setBusy] = useState<"form" | "google" | "passkey" | null>(null);
	const [sent, setSent] = useState<string | null>(null);
	// a problem the page was opened with (an expired link); failures of what you do here show as toasts
	const [problem, setProblem] = useState<string | null>(
		linkErrorMessage(error),
	);
	const callbackURL = next ?? "/";

	// every form here does one auth call, then shows its error or a "check your email" note
	async function submit(
		event: FormEvent,
		run: () => Promise<{ error: unknown } | undefined>,
		doneNote?: string,
	) {
		event.preventDefault();
		setBusy("form");
		setProblem(null);
		const result = await run();
		if (result?.error) {
			setBusy(null);
			return void toast.error(authErrorMessage(result.error));
		}
		if (doneNote) {
			setBusy(null);
			setSent(doneNote);
		}
		// keep the spinner until the next page opens
		else window.location.assign(callbackURL);
	}

	const go = (to: Mode) => ({ search: { next, error: undefined, mode: to } });
	const { title, description } = COPY[mode];

	if (sent) {
		return (
			<AuthShell title="Check your email" description={sent}>
				<Link
					to="/sign-in"
					{...go("sign-in")}
					className="text-center text-sm underline underline-offset-2"
					onClick={() => setSent(null)}
				>
					Back to sign in
				</Link>
			</AuthShell>
		);
	}

	const emailField = (
		<Field>
			<FieldLabel htmlFor="email">Email</FieldLabel>
			<InputWithIcon
				icon="icon-[solar--letter-linear]"
				id="email"
				type="email"
				autoComplete="email"
				placeholder="you@company.com"
				required
				value={email}
				onChange={(e) => setEmail(e.target.value)}
			/>
		</Field>
	);
	const passwordField = (autoComplete: string) => (
		<Field>
			<FieldLabel htmlFor="password">Password</FieldLabel>
			<InputWithIcon
				icon="icon-[solar--lock-password-linear]"
				id="password"
				type="password"
				autoComplete={autoComplete}
				placeholder="Your password"
				minLength={10}
				maxLength={128}
				required
				value={password}
				onChange={(e) => setPassword(e.target.value)}
			/>
		</Field>
	);
	const action = (label: string) => (
		<Button
			type="submit"
			size="lg"
			className="w-full"
			disabled={!hydrated || !!busy}
			aria-busy={busy === "form"}
		>
			{busy === "form" && <Spinner />}
			{label}
			{busy !== "form" && <ArrowChip />}
		</Button>
	);

	async function signInWithPasskey() {
		setProblem(null);
		setBusy("passkey");
		const result = await authClient.signIn.passkey();
		// closing the browser's passkey prompt isn't an error worth showing
		if (result?.error) {
			setBusy(null);
			if (!/cancel|abort|not ?allowed/i.test(result.error.message ?? ""))
				toast.error(authErrorMessage(result.error));
			return;
		}
		window.location.assign(callbackURL);
	}

	// Google sign-in leaves the page; the spinner stays until it does
	async function continueWithGoogle(errorCallbackURL: string) {
		setProblem(null);
		setBusy("google");
		const result = await authClient.signIn.social({
			provider: "google",
			callbackURL,
			errorCallbackURL,
		});
		if (result?.error) {
			setBusy(null);
			toast.error(authErrorMessage(result.error));
		}
	}

	const chooser = (
		<div className="flex flex-col gap-2">
			{methods.includes("google") && (
				<Button
					variant="outline"
					size="lg"
					className="w-full"
					disabled={!hydrated || !!busy}
					aria-busy={busy === "google"}
					onClick={() => continueWithGoogle("/sign-in")}
				>
					{busy === "google" ? (
						<Spinner />
					) : (
						<span aria-hidden className="icon-[devicon--google] size-4" />
					)}
					Continue with Google
				</Button>
			)}
			<Link
				to="/sign-in"
				{...go("email")}
				className={buttonVariants({
					variant: "outline",
					size: "lg",
					className: "w-full",
				})}
			>
				<span aria-hidden className="icon-[solar--letter-linear] size-4" />
				Continue with email
			</Link>
			<Link
				to="/sign-in"
				{...go("link")}
				className={buttonVariants({
					variant: "outline",
					size: "lg",
					className: "w-full",
				})}
			>
				<span
					aria-hidden
					className="icon-[solar--magic-stick-3-linear] size-4"
				/>
				Email me a sign-in link
			</Link>
			<Button
				variant="outline"
				size="lg"
				className="w-full"
				disabled={!hydrated || !!busy}
				aria-busy={busy === "passkey"}
				onClick={signInWithPasskey}
			>
				{busy === "passkey" ? (
					<Spinner />
				) : (
					<span
						aria-hidden
						className="icon-[solar--key-minimalistic-linear] size-4"
					/>
				)}
				Sign in with a passkey
			</Button>
		</div>
	);

	let form: ReactNode;
	const signUpChooser = (
		<div className="flex flex-col gap-2">
			{methods.includes("google") && (
				<Button
					variant="outline"
					size="lg"
					className="w-full"
					disabled={!hydrated || !!busy}
					aria-busy={busy === "google"}
					onClick={() => continueWithGoogle("/sign-up")}
				>
					{busy === "google" ? (
						<Spinner />
					) : (
						<span aria-hidden className="icon-[devicon--google] size-4" />
					)}
					Sign up with Google
				</Button>
			)}
			<Button
				variant="outline"
				size="lg"
				className="w-full"
				disabled={!hydrated}
				onClick={() => setWithEmail(true)}
			>
				<span aria-hidden className="icon-[solar--letter-linear] size-4" />
				Sign up with email
			</Button>
			<Link
				to="/sign-in"
				{...go("link")}
				className={buttonVariants({
					variant: "outline",
					size: "lg",
					className: "w-full",
				})}
			>
				<span
					aria-hidden
					className="icon-[solar--magic-stick-3-linear] size-4"
				/>
				Email me a sign-up link
			</Link>
		</div>
	);

	if (mode === "sign-up" && !withEmail) {
		form = signUpChooser;
	} else if (mode === "sign-up") {
		form = (
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) =>
					submit(
						e,
						() =>
							authClient.signUp.email({ name, email, password, callbackURL }),
						`We sent a link to ${email}. Open it to confirm your address and finish signing up.`,
					)
				}
			>
				<Field>
					<FieldLabel htmlFor="name">Your name</FieldLabel>
					<InputWithIcon
						icon="icon-[solar--user-linear]"
						id="name"
						autoComplete="name"
						placeholder="e.g. Amina Kamau"
						required
						maxLength={120}
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</Field>
				{emailField}
				<PasswordField
					id="password"
					label="Password"
					value={password}
					onChange={setPassword}
				/>
				{action("Create account")}
			</form>
		);
	} else if (mode === "forgot") {
		form = (
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) =>
					submit(
						e,
						() =>
							authClient.requestPasswordReset({
								email,
								redirectTo: "/reset-password",
							}),
						`If ${email} has an Ekra account, we sent it a link to choose a new password. It works for 60 minutes.`,
					)
				}
			>
				{emailField}
				{action("Email me a reset link")}
			</form>
		);
	} else if (mode === "link") {
		form = (
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) =>
					submit(
						e,
						() =>
							authClient.signIn.magicLink({
								email,
								callbackURL,
								errorCallbackURL: "/sign-in",
							}),
						`We sent a sign-in link to ${email}. It works once and expires in 10 minutes.`,
					)
				}
			>
				{emailField}
				{action("Email me a sign-in link")}
			</form>
		);
	} else if (mode === "email") {
		form = (
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) =>
					submit(e, () =>
						authClient.signIn.email({ email, password, callbackURL }),
					)
				}
			>
				{emailField}
				{passwordField("current-password")}
				<Link
					to="/sign-in"
					{...go("forgot")}
					className="-mt-1 self-end text-xs text-muted-foreground underline-offset-2 hover:underline"
				>
					Forgot password?
				</Link>
				{action("Sign in")}
			</form>
		);
	} else {
		form = chooser;
	}

	return (
		<AuthShell title={title} description={description}>
			<div className="flex flex-col gap-3">
				{form}
				{problem && <FieldError role="alert">{problem}</FieldError>}
			</div>
			<div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
				{mode === "sign-in" && (
					<span>
						New here?{" "}
						<Link
							to="/sign-up"
							search={{ next, error: undefined }}
							className="text-foreground underline underline-offset-2"
						>
							Create an account
						</Link>
					</span>
				)}
				{mode === "email" && (
					<>
						<Link
							to="/sign-in"
							{...go("link")}
							className="underline-offset-2 hover:underline"
						>
							Email me a sign-in link instead
						</Link>
						<span>
							New here?{" "}
							<Link
								to="/sign-up"
								search={{ next, error: undefined }}
								className="text-foreground underline underline-offset-2"
							>
								Create an account
							</Link>
						</span>
						<Link
							to="/sign-in"
							{...go("sign-in")}
							className="underline-offset-2 hover:underline"
						>
							Other ways to sign in
						</Link>
					</>
				)}
				{mode === "sign-up" && withEmail && (
					<button
						type="button"
						onClick={() => setWithEmail(false)}
						className="underline-offset-2 hover:underline"
					>
						Other ways to sign up
					</button>
				)}
				{mode !== "email" && mode !== "sign-in" && (
					<Link
						to="/sign-in"
						{...go("sign-in")}
						className="underline-offset-2 hover:underline"
					>
						{mode === "sign-up"
							? "Already have an account? Sign in"
							: "Back to sign in"}
					</Link>
				)}
			</div>
			<p className="text-center text-xs text-muted-foreground">
				By continuing, you agree to our{" "}
				<Link
					to="/terms"
					className="underline underline-offset-2 hover:text-foreground"
				>
					Terms of Service
				</Link>{" "}
				and{" "}
				<Link
					to="/privacy"
					className="underline underline-offset-2 hover:text-foreground"
				>
					Privacy Policy
				</Link>
				.
			</p>
		</AuthShell>
	);
}
