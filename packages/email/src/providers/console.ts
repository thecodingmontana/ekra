import type { EmailMessage, EmailProvider } from "../types.ts";

export type ConsoleProvider = EmailProvider & {
	/** every message "sent", newest last: tests read links from here */
	readonly sent: EmailMessage[];
	/** the newest message to an address */
	lastTo(address: string): EmailMessage | undefined;
};

/** For development and tests: prints each email (with its links) instead of sending it. */
export function createConsoleProvider(
	options: { quiet?: boolean } = {},
): ConsoleProvider {
	const sent: EmailMessage[] = [];
	return {
		name: "console",
		sent,
		lastTo: (address) =>
			sent.findLast((m) => m.to.toLowerCase() === address.toLowerCase()),
		async send(message) {
			sent.push(message);
			if (!options.quiet) {
				console.info(
					`[email] to ${message.to}: ${message.subject}\n${message.text}\n`,
				);
			}
		},
	};
}
