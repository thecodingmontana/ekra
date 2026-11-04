/**
 * The policy for every page in production. Scripts and styles are this app's own; pictures may also be Google
 * profile pictures (people who sign in with Google); videos play from blob: URLs (HLS); YouTube embeds in pages.
 * shortcut: 'unsafe-inline' scripts for the router's inline hydration and theme scripts; switch to per-request
 * nonces once TanStack Start can hand one to its inline scripts.
 */
const CSP = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: https://*.googleusercontent.com",
	"media-src 'self' blob:",
	"font-src 'self' data:",
	"connect-src 'self'",
	"frame-src https://www.youtube.com https://www.youtube-nocookie.com",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'",
].join("; ");

/** Headers for every page. No CSP in development: Vite's live reload injects scripts and opens a socket. */
export function securityHeaders(production: boolean): Record<string, string> {
	return {
		"X-Frame-Options": "DENY",
		"X-Content-Type-Options": "nosniff",
		"Referrer-Policy": "strict-origin-when-cross-origin",
		"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
		...(production && {
			"Content-Security-Policy": CSP,
			"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
		}),
	};
}
