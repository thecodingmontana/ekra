import { createFileRoute } from "@tanstack/react-router";
import { env } from "@/env";

// How AI agents find out that /api/mcp needs an Ekra sign-in, and where to get one (RFC 9728 and RFC 8414). Both
// documents also answer at their resource-suffixed address (/.well-known/oauth-protected-resource/api/mcp).
const DOCUMENTS = ["oauth-protected-resource", "oauth-authorization-server"];

async function wellKnown({ params }: { params: { _splat?: string } }) {
	const name = params._splat?.split("/")[0] ?? "";
	if (!DOCUMENTS.includes(name)) return new Response(null, { status: 404 });
	const upstream = await fetch(
		new URL(`/api/.well-known/${name}`, env.API_URL),
	);
	return new Response(await upstream.text(), {
		status: upstream.status,
		headers: {
			"content-type": "application/json",
			"cache-control": "public, max-age=300",
			"access-control-allow-origin": "*",
		},
	});
}

export const Route = createFileRoute("/.well-known/$")({
	server: { handlers: { GET: wellKnown } },
});
