import { Button } from "@ekra/ui/components/button";
import { Spinner } from "@ekra/ui/components/spinner";
import { toast } from "@ekra/ui/lib/toast";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { VIEWER, type Viewer } from "@/graphql/viewer";

// An AI agent (Claude Code, Cursor, …) asks to use Ekra as you. Approving lets it do whatever your role allows in
// each of your organizations, until you disconnect it in Settings.
export const Route = createFileRoute("/oauth/approve")({
	// the signed authorization request, as one opaque string (see ./consent.tsx)
	validateSearch: (search: Record<string, unknown>) => ({
		request: typeof search.request === "string" ? search.request : "",
	}),
	beforeLoad: async ({ context, search }) => {
		const { data } = await context.apolloClient.query<{
			viewer: Viewer | null;
		}>({ query: VIEWER, fetchPolicy: "network-only" });
		if (!data?.viewer)
			throw redirect({
				to: "/sign-in",
				search: {
					next: `/oauth/approve?request=${encodeURIComponent(search.request)}`,
					error: undefined,
					mode: undefined,
				},
			});
	},
	head: () => ({
		meta: [
			{ title: "Connect an app · Ekra" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: Consent,
});

type PublicClient = { client_name?: string };

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Where approving sends you: the redirect_uri the server signed into this page's address (the app's name is
 * whatever it registered itself with, so it proves nothing). */
function destination(search: string) {
	try {
		const url = new URL(new URLSearchParams(search).get("redirect_uri") ?? "");
		return { host: url.host, local: LOCAL_HOSTS.includes(url.hostname) };
	} catch {
		return null;
	}
}

const WHAT_IT_CAN_DO = [
	[
		"icon-[solar--book-2-linear]",
		"See your library and learning, and create and assign content",
	],
	["icon-[solar--chart-2-linear]", "Read reports, if your role can"],
	[
		"icon-[solar--shield-user-linear]",
		"Only what your role allows: nothing you can't do yourself",
	],
	["icon-[solar--link-broken-linear]", "Disconnect it any time in Settings"],
] as const;

function Consent() {
	const { request: query } = Route.useSearch();
	const [client, setClient] = useState<PublicClient | null>(null);
	const [busy, setBusy] = useState<"accept" | "deny" | null>(null);
	const [clientId, setClientId] = useState<string | null>(null);
	const [dest, setDest] = useState<ReturnType<typeof destination>>(null);

	useEffect(() => {
		const id = new URLSearchParams(query).get("client_id");
		setClientId(id);
		setDest(destination(query));
		if (!id) return;
		void fetch(
			`/api/auth/oauth2/public-client?client_id=${encodeURIComponent(id)}`,
		)
			.then((r) => (r.ok ? r.json() : null))
			.then((c: PublicClient | null) => setClient(c ?? {}))
			.catch(() => setClient({}));
	}, [query]);

	async function answer(accept: boolean) {
		setBusy(accept ? "accept" : "deny");
		try {
			const res = await fetch("/api/auth/oauth2/consent", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json",
				},
				// the signed request this page was opened with: the server checks nothing was changed
				body: JSON.stringify({
					accept,
					oauth_query: query,
				}),
			});
			const data = (await res.json().catch(() => null)) as {
				url?: string;
				message?: string;
			} | null;
			if (!res.ok || !data?.url)
				throw new Error(
					data?.message ?? "This request expired. Connect again from your app.",
				);
			window.location.assign(data.url);
		} catch (error) {
			setBusy(null);
			toast.error("Couldn't finish connecting", {
				desc: (error as Error).message,
			});
		}
	}

	// until its details load, a neutral heading (not a flash of "An app")
	const name = client ? client.client_name?.trim() || "An app" : null;
	return (
		<AuthShell
			title={name ? `${name} wants to use Ekra as you` : "Connect an app"}
			description="It acts with your account and your role in each organization you belong to."
		>
			<ul className="flex flex-col gap-3 text-sm">
				{WHAT_IT_CAN_DO.map(([icon, text]) => (
					<li key={text} className="flex items-start gap-2.5">
						<span
							className={`${icon} mt-0.5 size-4 shrink-0 text-muted-foreground`}
							aria-hidden="true"
						/>
						<span>{text}</span>
					</li>
				))}
			</ul>
			{dest && (
				<p className="rounded-md border px-3 py-2 text-sm">
					{dest.local ? (
						<>
							After you approve, it continues in an app on <b>this computer</b>{" "}
							({dest.host}).
						</>
					) : (
						<>
							After you approve, you'll be sent to <b>{dest.host}</b>. The name
							above is what the app calls itself: approve only if that's where
							the app you're connecting lives.
						</>
					)}
				</p>
			)}
			<p className="text-muted-foreground text-xs">
				Only approve an app you're connecting yourself right now.
			</p>
			<div className="flex gap-2">
				<Button
					variant="outline"
					size="lg"
					className="flex-1"
					disabled={!!busy}
					onClick={() => void answer(false)}
				>
					Deny
				</Button>
				<Button
					size="lg"
					className="flex-1"
					disabled={!!busy || !clientId}
					aria-busy={busy === "accept"}
					onClick={() => void answer(true)}
				>
					{busy === "accept" && <Spinner />}
					Approve
				</Button>
			</div>
		</AuthShell>
	);
}
