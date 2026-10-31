import { createFileRoute } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth-shell";

// shortcut: placeholder until the real privacy policy is written; replace this text with it.
export const Route = createFileRoute("/privacy")({
	head: () => ({ meta: [{ title: "Privacy Policy · Ekra" }] }),
	component: () => (
		<AuthShell
			title="Privacy Policy"
			description="We're writing this now. Questions? Email thecodingmontana@gmail.com."
		>
			<a
				href="/sign-in"
				className="text-center text-sm underline underline-offset-2"
			>
				Back to sign in
			</a>
		</AuthShell>
	),
});
