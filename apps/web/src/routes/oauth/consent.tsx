import { createFileRoute } from "@tanstack/react-router";

/**
 * Where the API sends you to approve an AI agent. Its query is signed and must come back byte for byte, but the
 * router re-encodes a page's query (repeated keys become one array) and redirects to that copy, which the API
 * would refuse. So hand it to the page as one opaque value instead.
 */
export const Route = createFileRoute("/oauth/consent")({
	server: {
		handlers: {
			GET: ({ request }) => {
				const query = new URL(request.url).search.slice(1);
				return new Response(null, {
					status: 302,
					headers: {
						location: `/oauth/approve?request=${encodeURIComponent(query)}`,
					},
				});
			},
		},
	},
});
