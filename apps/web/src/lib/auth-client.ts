import { passkeyClient } from "@better-auth/passkey/client";
import {
	magicLinkClient,
	organizationClient,
	twoFactorClient,
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
		passkeyClient(),
		// the sign-in page sends people to /two-factor itself, so no redirect callback here
		twoFactorClient(),
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

/** The ?error= code an emailed link or Google returns with, in words a person can act on. */
export function linkErrorMessage(code: string | undefined): string | null {
	if (!code) return null;
	if (code === "access_denied") return "Google sign-in was cancelled.";
	if (/expired|invalid/i.test(code)) {
		return "That link has expired or was already used. Ask for a new one.";
	}
	return "We couldn't sign you in. Try again.";
}

/** A Better Auth error from a form, in words a person can act on. */
export function authErrorMessage(error: unknown): string {
	const { status, message } = (error ?? {}) as {
		status?: number;
		message?: string;
	};
	if (status === 403)
		return "Confirm your email first. We just sent you a new link.";
	if (status === 401) return "That email and password don't match.";
	if (status === 429) return "Too many tries. Wait a minute and try again.";
	if (/invalid (code|backup)/i.test(message ?? ""))
		return "That code didn't work. Check it and try again.";
	return message ?? "Something went wrong. Try again.";
}
