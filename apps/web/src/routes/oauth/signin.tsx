import { createFileRoute } from "@tanstack/react-router";
import { env } from "@/env";

/**
 * An AI agent asked to connect and you aren't signed in: sign in the usual way (password, email link, Google,
 * passkey and two-step all keep `next`), then carry on to the approval. A server route, not a page: the query is
 * signed by the API and must reach it byte for byte, and the router would re-encode it (repeated keys as arrays).
 */
async function signIn({ request }: { request: Request }) {
	const authorize = `/api/auth/oauth2/authorize${new URL(request.url).search}`;
	const cookie = request.headers.get("cookie");
	const session = await fetch(new URL("/api/auth/get-session", env.API_URL), {
		headers: cookie ? { cookie } : {},
	})
		.then((r) => (r.ok ? r.json() : null))
		.catch(() => null);
	const to = session
		? authorize
		: `/sign-in?next=${encodeURIComponent(authorize)}`;
	return new Response(null, { status: 302, headers: { location: to } });
}

export const Route = createFileRoute("/oauth/signin")({
	server: { handlers: { GET: signIn } },
});
