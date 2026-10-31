import { createMailer, type EmailMessage } from "@ekra/email";
import { log } from "evlog";
import { env } from "./env.ts";

/**
 * The server's email sender, picked by EMAIL_PROVIDER (Resend by default). In development without a Resend key,
 * emails are printed in the terminal instead, so sign-in still works locally. In production a missing key stops
 * the server at startup.
 */
function pickProvider() {
	if (
		env.EMAIL_PROVIDER === "resend" &&
		!env.RESEND_API_KEY &&
		env.NODE_ENV !== "production"
	) {
		if (env.NODE_ENV === "development") {
			log.warn(
				"email",
				"RESEND_API_KEY isn't set: printing emails here instead (see SETUP.md).",
			);
		}
		return createMailer({
			provider: "console",
			from: env.EMAIL_FROM,
			quiet: env.NODE_ENV === "test",
		});
	}
	return createMailer({
		provider: env.EMAIL_PROVIDER,
		from: env.EMAIL_FROM,
		resendApiKey: env.RESEND_API_KEY,
		quiet: env.NODE_ENV === "test",
	});
}

export const mailer = pickProvider();

/** Sends without making the caller wait or fail: used where a slow or failed send must not leak timing or block. */
export function sendInBackground(message: EmailMessage) {
	// runs after the response, so it logs its own event rather than the request's
	mailer.send(message).catch((error: unknown) => {
		log.error({
			action: "email.send",
			email: { subject: message.subject, to: message.to },
			error: error instanceof Error ? error.message : String(error),
		});
	});
}
