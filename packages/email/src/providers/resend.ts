import type { EmailMessage, EmailProvider } from "../types.ts";

const RESEND_API = "https://api.resend.com/emails";

/** Sends through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). No SDK needed. */
export function createResendProvider(options: {
	apiKey: string;
	/** sender, e.g. "Ekra <noreply@your-domain.com>"; the domain must be verified in Resend */
	from: string;
	/** for tests */
	fetch?: typeof fetch;
}): EmailProvider {
	const send = options.fetch ?? fetch;
	return {
		name: "resend",
		async send(message: EmailMessage) {
			const response = await send(RESEND_API, {
				method: "POST",
				headers: {
					authorization: `Bearer ${options.apiKey}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					from: options.from,
					to: [message.to],
					subject: message.subject,
					html: message.html,
					text: message.text,
				}),
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as {
					message?: string;
				};
				throw new Error(
					`Resend refused the email (${response.status}): ${body.message ?? response.statusText}`,
				);
			}
		},
	};
}
