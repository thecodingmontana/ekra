import {
	type ConsoleProvider,
	createConsoleProvider,
} from "./providers/console.ts";
import { createResendProvider } from "./providers/resend.ts";
import type { EmailProvider } from "./types.ts";

export {
	type ConsoleProvider,
	createConsoleProvider,
} from "./providers/console.ts";
export { createResendProvider } from "./providers/resend.ts";
export {
	escapeHtml,
	resetPasswordEmail,
	signInLinkEmail,
	verifyEmailEmail,
} from "./templates.ts";
export type { EmailMessage, EmailProvider } from "./types.ts";

/** Providers you can pick with EMAIL_PROVIDER. */
export const EMAIL_PROVIDERS = ["resend", "console"] as const;
export type EmailProviderName = (typeof EMAIL_PROVIDERS)[number];

/** The provider named in settings. Unknown names never get here: each app validates EMAIL_PROVIDER first. */
export function createMailer(options: {
	provider: EmailProviderName;
	from: string;
	resendApiKey?: string;
	quiet?: boolean;
}): EmailProvider | ConsoleProvider {
	switch (options.provider) {
		case "resend":
			if (!options.resendApiKey)
				throw new Error(
					"EMAIL_PROVIDER=resend needs RESEND_API_KEY (see SETUP.md).",
				);
			return createResendProvider({
				apiKey: options.resendApiKey,
				from: options.from,
			});
		case "console":
			return createConsoleProvider({ quiet: options.quiet });
	}
}
