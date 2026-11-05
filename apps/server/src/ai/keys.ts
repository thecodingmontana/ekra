import {
	createCipheriv,
	createDecipheriv,
	hkdfSync,
	randomBytes,
} from "node:crypto";
import { aiKey } from "@ekra/db";
import { and, eq } from "drizzle-orm";
import { db } from "../db.ts";
import { env } from "../env.ts";

// People's own OpenRouter keys (bring your own key). How they're kept safe:
// - encrypted with AES-256-GCM under AI_KEYS_SECRET (or BETTER_AUTH_SECRET), which lives in the server's
//   environment, not the database: a dump, backup or admin sees only ciphertext
// - each ciphertext is bound to its person and provider, so it can't be moved to another account
// - never sent back to a browser (only a hint like …a1b2), never logged, decrypted only in memory to call OpenRouter
// If the secret changes, saved keys can't be read and people add theirs again.

export const PROVIDER = "openrouter";
/** What an OpenRouter key looks like, to catch a paste of something else before asking OpenRouter. */
export const KEY_PATTERN = /^sk-or-[A-Za-z0-9_-]{20,300}$/;
/** An OpenRouter model id ("vendor/model", optionally ":free" or another variant). */
export const MODEL_PATTERN = /^[a-z0-9][\w.-]*\/[\w.:-]+$/i;

const secret = () =>
	Buffer.from(
		hkdfSync(
			"sha256",
			env.AI_KEYS_SECRET ?? env.BETTER_AUTH_SECRET,
			"ekra",
			"ai-user-keys",
			32,
		),
	);

const b64 = (b: Buffer) => b.toString("base64url");
const bound = (userId: string, provider: string) =>
	Buffer.from(`${userId}:${provider}`);

export function sealKey(plain: string, userId: string, provider = PROVIDER) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", secret(), iv);
	cipher.setAAD(bound(userId, provider));
	const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
	return `${b64(iv)}.${b64(cipher.getAuthTag())}.${b64(body)}`;
}

export function openKey(sealed: string, userId: string, provider = PROVIDER) {
	const [iv, tag, body] = sealed
		.split(".")
		.map((p) => Buffer.from(p, "base64url"));
	if (!iv || !tag || !body) return null;
	try {
		const decipher = createDecipheriv("aes-256-gcm", secret(), iv);
		decipher.setAAD(bound(userId, provider));
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(body), decipher.final()]).toString(
			"utf8",
		);
	} catch {
		// a changed secret, a tampered value or a row moved to another person: no key
		return null;
	}
}

export const keyHint = (key: string) => `…${key.slice(-4)}`;

export type OwnKey = { key: string; model: string };

/** The person's own key and model, or null when they use the shared one. */
export async function ownKey(userId: string): Promise<OwnKey | null> {
	const [row] = await db
		.select()
		.from(aiKey)
		.where(and(eq(aiKey.userId, userId), eq(aiKey.provider, PROVIDER)));
	const key = row && openKey(row.cipher, userId);
	return key ? { key, model: row.model } : null;
}

/** Asks OpenRouter whether a key works (a free, read-only call), before it's saved. */
export async function checkKey(
	key: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	if (!KEY_PATTERN.test(key))
		return {
			ok: false,
			error:
				"That doesn't look like an OpenRouter key (it starts with sk-or-).",
		};
	try {
		const res = await fetch("https://openrouter.ai/api/v1/key", {
			headers: { authorization: `Bearer ${key}` },
			signal: AbortSignal.timeout(8000),
		});
		if ([400, 401, 403].includes(res.status))
			return {
				ok: false,
				error: "OpenRouter didn't accept that key. Check it and try again.",
			};
		if (!res.ok)
			return {
				ok: false,
				error: "Couldn't check the key with OpenRouter. Try again in a moment.",
			};
		return { ok: true };
	} catch {
		return {
			ok: false,
			error:
				"Couldn't reach OpenRouter to check the key. Try again in a moment.",
		};
	}
}
