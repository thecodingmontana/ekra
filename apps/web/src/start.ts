import { createMiddleware, createStart } from "@tanstack/react-start";
import { securityHeaders } from "./lib/security-headers.ts";

const HEADERS = securityHeaders(import.meta.env.PROD);

/** Security headers on every page; /api responses keep the ones the API sets. */
const pageHeaders = createMiddleware().server(async ({ next, request }) => {
	const result = await next();
	if (new URL(request.url).pathname.startsWith("/api/")) return result;
	// a redirect's headers can't be changed in place, so copy the response
	const headers = new Headers(result.response.headers);
	for (const [name, value] of Object.entries(HEADERS)) headers.set(name, value);
	return {
		...result,
		response: new Response(result.response.body, {
			status: result.response.status,
			statusText: result.response.statusText,
			headers,
		}),
	};
});

export const startInstance = createStart(() => ({
	requestMiddleware: [pageHeaders],
}));
