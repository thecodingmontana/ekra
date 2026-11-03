import { createIsomorphicFn } from "@tanstack/react-start";

export type AuthError = { status: number; code?: string; message?: string };
export type AuthResult<T> =
	| { data: T; error: null }
	| { data: null; error: AuthError };

// during server rendering, call the API directly with the visitor's cookies; in the browser, /api on this origin
const request = createIsomorphicFn()
	.server(async (path: string) => {
		const [{ env }, { getRequestHeaders }] = await Promise.all([
			import("../env.ts"),
			import("@tanstack/react-start/server"),
		]);
		const cookie = getRequestHeaders().get("cookie");
		return fetch(`${env.API_URL}/api/auth${path}`, {
			headers: cookie ? { cookie } : {},
		});
	})
	.client((path: string) =>
		fetch(`/api/auth${path}`, { credentials: "same-origin" }),
	);

/**
 * A Better Auth read (GET /api/auth/<path>) that also works in loaders during server rendering, where the
 * browser's `authClient` can't reach the API. Changes still go through `authClient` from event handlers.
 */
export async function authGet<T>(path: string): Promise<AuthResult<T>> {
	const res = await request(path);
	const body = await res.json().catch(() => null);
	if (res.ok) return { data: body as T, error: null };
	return { data: null, error: { status: res.status, ...body } };
}
