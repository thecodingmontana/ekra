import {
	magicLinkClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Better Auth in the browser: sign in, sign out, create and switch organizations. It talks to /api/auth on this
 * origin, so call it from event handlers (in the browser), not while rendering on the server. Read who is signed in
 * through GraphQL (`viewer`) instead, which works during server rendering too.
 */
export const authClient = createAuthClient({
	plugins: [
		magicLinkClient(),
		organizationClient({
			teams: { enabled: true },
			schema: {
				organization: {
					additionalFields: {
						kind: { type: ["company", "creator"], required: false },
					},
				},
			},
		}),
	],
});

/** Better Auth's error codes on a returned sign-in link, in words a person can act on. */
export function signInLinkError(code: string | undefined): string | null {
	if (!code) return null;
	if (/expired|invalid/i.test(code)) {
		return "That sign-in link has expired or was already used. Send yourself a new one.";
	}
	return "Something went wrong signing you in. Try again.";
}
