import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, test } from "node:test";
import { user } from "@ekra/db";
import { eq } from "drizzle-orm";
import { db } from "../db.ts";
import { call, cookieFrom, linkInLatestEmail, post } from "../test-helpers.ts";

const email = `two-step-${Date.now()}@test.ekra`;
let secret = "";
let backupCodes: string[] = [];

after(async () => {
	await db.delete(user).where(eq(user.email, email));
});

/** The 6-digit code an authenticator app shows now (RFC 6238: SHA-1, 30 s). */
function totp(base32: string) {
	const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	let bits = "";
	for (const c of base32.replace(/=+$/, "").toUpperCase())
		bits += ALPHABET.indexOf(c).toString(2).padStart(5, "0");
	const key = Buffer.from(
		(bits.match(/.{8}/g) ?? []).map((b) => Number.parseInt(b, 2)),
	);
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
	const mac = createHmac("sha1", key).update(counter).digest();
	const offset = (mac.at(-1) ?? 0) & 0xf;
	const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
	return String(code).padStart(6, "0");
}

/** Ask for a sign-in link and open it; returns the response of opening the link. */
async function openSignInLink() {
	await post("/api/auth/sign-in/magic-link", { email, callbackURL: "/" });
	return call(linkInLatestEmail(email));
}

test("turning on two-step sign-in needs a code from the app before it counts", async () => {
	const cookie = cookieFrom(await openSignInLink());

	// email-link accounts have no password, so none is asked for
	const enabled = await post("/api/auth/two-factor/enable", {}, cookie);
	assert.equal(enabled.status, 200);
	const body = (await enabled.json()) as {
		totpURI: string;
		backupCodes: string[];
	};
	secret = new URL(body.totpURI).searchParams.get("secret") ?? "";
	backupCodes = body.backupCodes;
	assert.ok(secret && backupCodes.length > 0);

	const [pending] = await db.select().from(user).where(eq(user.email, email));
	assert.equal(pending?.twoFactorEnabled, false, "not on until confirmed");

	const confirmed = await post(
		"/api/auth/two-factor/verify-totp",
		{ code: totp(secret) },
		cookie,
	);
	assert.equal(confirmed.status, 200);
	const [on] = await db.select().from(user).where(eq(user.email, email));
	assert.equal(on?.twoFactorEnabled, true);
});

test("an emailed link no longer signs in on its own: it asks for the second step", async () => {
	const opened = await openSignInLink();
	assert.equal(opened.status, 302);
	assert.equal(opened.headers.get("location"), "/two-factor");
	const cookie = cookieFrom(opened);
	assert.match(cookie, /two_factor=/);
	assert.doesNotMatch(
		cookie,
		/session_token=[^;\s]/,
		"no session until the code is entered",
	);

	const wrongCode = totp(secret) === "000000" ? "111111" : "000000";
	const wrong = await post(
		"/api/auth/two-factor/verify-totp",
		{ code: wrongCode },
		cookie,
	);
	assert.equal(wrong.status, 401);

	const right = await post(
		"/api/auth/two-factor/verify-backup-code",
		{ code: backupCodes[0] },
		cookie,
	);
	assert.equal(right.status, 200);
	assert.match(cookieFrom(right), /session_token=[^;\s]/);
});

test("a trusted device skips the code on the next email-link sign-in", async () => {
	const challenged = cookieFrom(await openSignInLink());
	const verified = await post(
		"/api/auth/two-factor/verify-backup-code",
		{ code: backupCodes[1], trustDevice: true },
		challenged,
	);
	assert.equal(verified.status, 200);
	const trust = cookieFrom(verified)
		.split("; ")
		.filter((c) => c.includes("trust_device="))
		.join("; ");
	assert.match(trust, /trust_device=/);

	await post("/api/auth/sign-in/magic-link", { email, callbackURL: "/" });
	const opened = await call(linkInLatestEmail(email), { cookie: trust });
	assert.equal(opened.status, 302);
	assert.notEqual(opened.headers.get("location"), "/two-factor");
	assert.match(cookieFrom(opened), /session_token=[^;\s]/);
});
