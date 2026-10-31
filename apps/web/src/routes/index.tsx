import { gql } from "@apollo/client";
import { useQuery } from "@apollo/client/react";
import { Button } from "@ekra/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";

const HEALTH = gql`
	query Health {
		health
	}
`;

export const Route = createFileRoute("/")({ component: Home });

// Placeholder start page until sign-in and the library land (Phase 1–2).
function Home() {
	const { data, error, loading } = useQuery<{ health: string }>(HEALTH);
	const status = error
		? "unreachable"
		: loading && !data
			? "checking…"
			: data?.health;

	return (
		<main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6">
			<h1 className="font-heading text-2xl font-semibold">Ekra</h1>
			<p className="text-muted-foreground text-sm">
				Learning for teams and creators. The app is being built.
			</p>
			<p className="text-sm" aria-live="polite">
				API: <span data-testid="api-status">{status}</span>
			</p>
			<Button
				render={<a href="https://github.com/thecodingmontana/ekra" />}
				className="w-fit"
			>
				View on GitHub
			</Button>
		</main>
	);
}
