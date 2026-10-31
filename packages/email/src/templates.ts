import type { EmailMessage } from "./types.ts";

type Content = Omit<EmailMessage, "to">;

const APP = "Ekra";

/** Escapes text placed inside HTML, so names or addresses can't inject markup. */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** A plain, readable layout that works in every mail client: one message, one button, the link spelled out. */
function layout(options: {
	heading: string;
	paragraphs: string[];
	button: string;
	url: string;
	footer: string;
}) {
	const url = escapeHtml(options.url);
	const paragraphs = options.paragraphs
		.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`)
		.join("");
	const html = `<!doctype html><html><body style="margin:0;background:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:12px;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 24px;font-weight:600;font-size:18px">${APP}</p>
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(options.heading)}</h1>
${paragraphs}
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${escapeHtml(options.button)}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#666">Or paste this link into your browser:</p>
<p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${url}" style="color:#111">${url}</a></p>
<p style="margin:0;font-size:13px;color:#666">${escapeHtml(options.footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
	const text = [
		options.heading,
		"",
		...options.paragraphs,
		"",
		`${options.button}: ${options.url}`,
		"",
		options.footer,
	].join("\n");
	return { html, text };
}

/** "Email me a sign-in link". */
export function signInLinkEmail(options: {
	url: string;
	minutes: number;
}): Content {
	return {
		subject: `Your ${APP} sign-in link`,
		...layout({
			heading: "Sign in to Ekra",
			paragraphs: [
				`Use the button below to sign in. It works once, for ${options.minutes} minutes.`,
			],
			button: "Sign in",
			url: options.url,
			footer: "If you didn't ask to sign in, you can ignore this email.",
		}),
	};
}

/** Confirms a new account's address before password sign-in works. */
export function verifyEmailEmail(options: {
	name: string;
	url: string;
}): Content {
	return {
		subject: `Confirm your email for ${APP}`,
		...layout({
			heading: `Welcome, ${options.name}`,
			paragraphs: [
				"Confirm this is your email address to finish setting up your account.",
			],
			button: "Confirm email",
			url: options.url,
			footer: "If you didn't create an account, you can ignore this email.",
		}),
	};
}

/** "Forgot password?" */
export function resetPasswordEmail(options: {
	name: string;
	url: string;
	minutes: number;
}): Content {
	return {
		subject: `Reset your ${APP} password`,
		...layout({
			heading: "Reset your password",
			paragraphs: [
				`Hi ${options.name}, use the button below to choose a new password. It works once, for ${options.minutes} minutes.`,
				"Resetting signs you out everywhere else.",
			],
			button: "Choose a new password",
			url: options.url,
			footer:
				"If you didn't ask for this, you can ignore this email: your password stays the same.",
		}),
	};
}
