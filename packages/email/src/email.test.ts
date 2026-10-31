import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createConsoleProvider,
	createMailer,
	createResendProvider,
	escapeHtml,
	resetPasswordEmail,
	signInLinkEmail,
	verifyEmailEmail,
} from "./index.ts";

const URL_WITH_QUERY =
	"http://localhost:3000/api/auth/verify?token=abc&callbackURL=%2F";

test("templates carry the link in both HTML and text, and escape names", () => {
	for (const content of [
		signInLinkEmail({ url: URL_WITH_QUERY, minutes: 10 }),
		verifyEmailEmail({ name: "<b>Amina</b>", url: URL_WITH_QUERY }),
		resetPasswordEmail({
			name: "<b>Amina</b>",
			url: URL_WITH_QUERY,
			minutes: 60,
		}),
	]) {
		assert.ok(content.subject.length > 0);
		assert.ok(
			content.text.includes(URL_WITH_QUERY),
			"plain text has the raw link",
		);
		assert.ok(
			content.html.includes(escapeHtml(URL_WITH_QUERY)),
			"HTML has the escaped link",
		);
		assert.ok(
			!content.html.includes("<b>Amina</b>"),
			"names can't inject markup",
		);
	}
});

test("the Resend provider posts the message with the API key", async () => {
	const calls: { url: string; init: RequestInit }[] = [];
	const provider = createResendProvider({
		apiKey: "re_test",
		from: "Ekra <noreply@example.com>",
		fetch: async (url, init) => {
			calls.push({ url: String(url), init: init ?? {} });
			return new Response(JSON.stringify({ id: "1" }), { status: 200 });
		},
	});
	await provider.send({
		to: "a@example.com",
		subject: "Hi",
		html: "<p>Hi</p>",
		text: "Hi",
	});
	assert.equal(calls[0]?.url, "https://api.resend.com/emails");
	assert.equal(
		new Headers(calls[0]?.init.headers).get("authorization"),
		"Bearer re_test",
	);
	assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
		from: "Ekra <noreply@example.com>",
		to: ["a@example.com"],
		subject: "Hi",
		html: "<p>Hi</p>",
		text: "Hi",
	});
});

test("the Resend provider reports a refused email", async () => {
	const provider = createResendProvider({
		apiKey: "re_test",
		from: "x@example.com",
		fetch: async () =>
			new Response(JSON.stringify({ message: "Domain not verified" }), {
				status: 403,
			}),
	});
	await assert.rejects(
		provider.send({ to: "a@example.com", subject: "s", html: "h", text: "t" }),
		/Resend refused the email \(403\): Domain not verified/,
	);
});

test("the console provider keeps what it sends", async () => {
	const provider = createConsoleProvider({ quiet: true });
	await provider.send({
		to: "A@example.com",
		subject: "one",
		html: "",
		text: "",
	});
	await provider.send({
		to: "a@example.com",
		subject: "two",
		html: "",
		text: "",
	});
	assert.equal(provider.lastTo("a@example.com")?.subject, "two");
	assert.equal(provider.sent.length, 2);
});

test("createMailer needs a key for Resend", () => {
	assert.throws(
		() => createMailer({ provider: "resend", from: "x@example.com" }),
		/RESEND_API_KEY/,
	);
	assert.equal(
		createMailer({ provider: "console", from: "x", quiet: true }).name,
		"console",
	);
});
