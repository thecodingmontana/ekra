import { createFileRoute } from "@tanstack/react-router";
import { env } from "@/env";

// Response headers that describe the upstream body's encoding; fetch already decoded it, so don't pass them on.
const HOP_BY_HOP = [
	"content-encoding",
	"content-length",
	"transfer-encoding",
	"connection",
];

/**
 * Forwards every /api/* request to the Hono API (API_URL), so the browser only ever talks to this origin and
 * sign-in cookies stay first-party. Handles page loads too (a sign-in link, Google's callback), which a proxy rule
 * can miss because the page router answers them first. Redirects and cookies pass through untouched.
 * shortcut: plain HTTP only; WebSocket upgrades are added with the realtime work (Phase 1e).
 */
async function forward({ request }: { request: Request }): Promise<Response> {
	const url = new URL(request.url);
	const headers = new Headers(request.headers);
	headers.delete("host");
	headers.set("x-forwarded-host", url.host);
	headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

	const upstream = await fetch(
		new URL(`${url.pathname}${url.search}`, env.API_URL),
		{
			method: request.method,
			headers,
			body:
				request.method === "GET" || request.method === "HEAD"
					? undefined
					: await request.arrayBuffer(),
			redirect: "manual",
		},
	);

	const responseHeaders = new Headers(upstream.headers);
	for (const name of HOP_BY_HOP) responseHeaders.delete(name);
	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: responseHeaders,
	});
}

export const Route = createFileRoute("/api/$")({
	server: {
		handlers: {
			GET: forward,
			HEAD: forward,
			POST: forward,
			PUT: forward,
			PATCH: forward,
			DELETE: forward,
			OPTIONS: forward,
		},
	},
});
