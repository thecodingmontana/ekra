import assert from "node:assert/strict";
import { after, test } from "node:test";
import { user } from "@ekra/db";
import { eq } from "drizzle-orm";
import { db } from "../db.ts";
import {
	call,
	cookieFrom,
	emailsTo,
	linkInLatestEmail,
	post,
} from "../test-helpers.ts";

const email = `pat.lee-${Date.now()}@test.ekra`;
const password = "correct horse battery";
const newPassword = "a whole new passphrase";

after(async () => {
	await db.delete(user).where(eq(user.email, email));
});

const signIn = (pass: string) =>
	post("/api/auth/sign-in/email", { email, password: pass });

test("a password must be at least 10 characters", async () => {
	const res = await post("/api/auth/sign-up/email", {
		name: "Short",
		email: `short-${Date.now()}@test.ekra`,
		password: "too-short",
	});
	assert.equal(res.status, 400);
});

test("signing up sends a confirmation email; password sign-in waits for it", async () => {
	const res = await post("/api/auth/sign-up/email", {
		name: "Pat Lee",
		email,
		password,
		callbackURL: "/",
	});
	assert.equal(res.status, 200);
	assert.match(emailsTo(email).at(-1)?.subject ?? "", /Confirm your email/);

	const before = emailsTo(email).length;
	const early = await signIn(password);
	assert.equal(
		early.status,
		403,
		"unconfirmed accounts can't sign in with a password",
	);
	assert.equal(
		emailsTo(email).length,
		before + 1,
		"a fresh confirmation link is sent",
	);
});

test("the confirmation link confirms the address and signs in", async () => {
	const opened = await call(linkInLatestEmail(email));
	assert.equal(opened.status, 302);
	assert.match(cookieFrom(opened), /session_token=/);
	const [row] = await db.select().from(user).where(eq(user.email, email));
	assert.equal(row?.emailVerified, true);
});

test("once confirmed, the password signs in and a wrong one doesn't", async () => {
	assert.equal((await signIn(password)).status, 200);
	assert.equal((await signIn("not the password")).status, 401);
});

test("forgot password: the emailed link sets a new password and signs out other devices", async () => {
	const session = cookieFrom(await signIn(password));

	const asked = await post("/api/auth/request-password-reset", {
		email,
		redirectTo: "/reset-password",
	});
	assert.equal(asked.status, 200);
	assert.match(emailsTo(email).at(-1)?.subject ?? "", /Reset your/);

	// the link goes through the API, which sends the browser to the app's reset page with a token
	const opened = await call(linkInLatestEmail(email));
	assert.equal(opened.status, 302);
	const location = new URL(
		opened.headers.get("location") ?? "",
		"http://localhost:3000",
	);
	assert.equal(location.pathname, "/reset-password");
	const token = location.searchParams.get("token");
	assert.ok(token);

	const reset = await post("/api/auth/reset-password", { newPassword, token });
	assert.equal(reset.status, 200);

	assert.equal(
		(await signIn(password)).status,
		401,
		"the old password no longer works",
	);
	assert.equal((await signIn(newPassword)).status, 200, "the new one does");
	const stale = await call("/api/auth/get-session", { cookie: session });
	assert.equal(await stale.json(), null, "the earlier session was signed out");
});

test("asking to reset an unknown address looks the same and sends nothing", async () => {
	const nobody = `nobody-${Date.now()}@test.ekra`;
	const res = await post("/api/auth/request-password-reset", {
		email: nobody,
		redirectTo: "/reset-password",
	});
	assert.equal(res.status, 200);
	assert.equal(emailsTo(nobody).length, 0);
});
