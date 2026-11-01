/**
 * Each organization lives on its own subdomain of the app: with the app at ekra.localhost:3000,
 * acme.ekra.localhost:3000/settings is the page the router knows as /o/acme/settings.
 * Signing in, signing up and setting up happen on the app's own address, shared by everyone.
 */

/** Pages that belong to no organization: always on the app's own address. */
const SHARED =
	/^\/(?:api|sign-in|sign-up|onboarding|two-factor|reset-password|terms|privacy)(?:\/|$)/;

const ORG_PATH = /^\/o\/([a-z0-9-]+)(\/.*)?$/;

export function tenantUrls(appUrl: string) {
	const app = new URL(appUrl);
	const suffix = `.${app.hostname}`;
	// a sign-in cookie can't be shared across bare "localhost", so there organizations stay at /o/acme
	const subdomains = app.hostname.includes(".");

	/** The organization a host belongs to ("acme" for acme.ekra.localhost), or null. */
	const slugOf = (url: URL) => {
		if (!subdomains || url.port !== app.port || !url.hostname.endsWith(suffix))
			return null;
		const slug = url.hostname.slice(0, -suffix.length);
		return /^[a-z0-9-]+$/.test(slug) ? slug : null;
	};

	const onApp = (url: URL) => {
		const next = new URL(url);
		next.protocol = app.protocol;
		next.hostname = app.hostname;
		next.port = app.port;
		return next;
	};

	return {
		slugOf,
		/** The address in the browser → the route: acme.ekra.localhost/settings → /o/acme/settings. */
		input(url: URL): URL | undefined {
			const slug = slugOf(url);
			if (!slug || SHARED.test(url.pathname)) return undefined;
			const next = new URL(url);
			next.pathname = `/o/${slug}${url.pathname === "/" ? "" : url.pathname}`;
			return next;
		},
		/** A route → the address to show: /o/acme/settings → acme.ekra.localhost/settings. */
		output(url: URL): URL | undefined {
			if (!subdomains) return undefined;
			const match = url.pathname.match(ORG_PATH);
			if (match) {
				const next = onApp(url);
				next.hostname = `${match[1]}${suffix}`;
				next.pathname = match[2] ?? "/";
				return next;
			}
			// shared pages (and "/", which opens your organization) live on the app's address
			if (url.hostname !== app.hostname) return onApp(url);
			return undefined;
		},
	};
}
