/** One email, ready to send. Always both HTML and plain text, so every mail client shows something readable. */
export type EmailMessage = {
	to: string;
	subject: string;
	html: string;
	text: string;
};

/**
 * Something that delivers email. Adding a provider (Postmark, SES, SMTP, …) means one file in `providers/`
 * implementing this, plus a case in `createMailer`.
 */
export interface EmailProvider {
	readonly name: string;
	send(message: EmailMessage): Promise<void>;
}
