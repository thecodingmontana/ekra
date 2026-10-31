// Shared by server tests: requests the way the browser sends them, and reading links out of sent emails.
import type { ConsoleProvider } from "@ekra/email";
import { app } from "./app.ts";
import { mailer } from "./email.ts";

export const ORIGIN = "http://localhost:3000";

/** Tests run with EMAIL_PROVIDER=console (src/test-env.ts), so sent emails are kept in memory. */
const outbox = mailer as ConsoleProvider;

/** The first link in the newest email to `address`, as a path the app can be called with. */
export function linkInLatestEmail(address: string): string {
	const text = outbox.lastTo(address)?.text ?? "";
	const url = text.match(/https?:\/\/\S+/)?.[0];
	if (!url) throw new Error(`No link in the latest email to ${address}`);
	const { pathname, search } = new URL(url);
	return `${pathname}${search}`;
}

export const emailsTo = (address: string) =>
	outbox.sent.filter((m) => m.to.toLowerCase() === address.toLowerCase());

/** The session cookie a response sets, ready to send back. */
export const cookieFrom = (response: Response) =>
	response.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");

/** A request the way the browser sends it: same origin, JSON, with a cookie when signed in. */
export function call(
	path: string,
	init: RequestInit & { cookie?: string } = {},
) {
	const { cookie = "", headers, ...rest } = init;
	return app.request(path, {
		...rest,
		headers: {
			origin: ORIGIN,
			"content-type": "application/json",
			cookie,
			...headers,
		},
	});
}

export const post = (path: string, body: unknown, cookie = "") =>
	call(path, { method: "POST", body: JSON.stringify(body), cookie });
