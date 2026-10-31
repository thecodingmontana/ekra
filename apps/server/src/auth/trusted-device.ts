import { createHmac } from "node:crypto";
import type { createAuthMiddleware } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";

type AuthContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/** Better Auth's default: "Trust this device for 30 days". */
const TRUST_DEVICE_SECONDS = 30 * 24 * 60 * 60;

// the same token Better Auth's twoFactor plugin writes: HMAC-SHA256 of "userId!identifier", base64url
const sign = (secret: string, userId: string, identifier: string) =>
	createHmac("sha256", secret)
		.update(`${userId}!${identifier}`)
		.digest("base64url");

/**
 * Whether this browser was trusted for `userId` when they last entered a code ("Trust this device"), checked the
 * way Better Auth checks it after password sign-in. A valid cookie is swapped for a fresh one, so a copied
 * cookie stops working once the real browser signs in again.
 */
export async function isTrustedDevice(ctx: AuthContext, userId: string) {
	const cookie = ctx.context.createAuthCookie("trust_device", {
		maxAge: TRUST_DEVICE_SECONDS,
	});
	const value = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
	const [token, identifier] = value ? value.split("!") : [];
	if (!token || !identifier) return false;
	if (token !== sign(ctx.context.secret, userId, identifier)) return false;
	const record =
		await ctx.context.internalAdapter.findVerificationValue(identifier);
	if (!record || record.value !== userId || record.expiresAt <= new Date())
		return false;

	await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
	const fresh = `trust-device-${generateRandomString(32)}`;
	await ctx.context.internalAdapter.createVerificationValue({
		value: userId,
		identifier: fresh,
		expiresAt: new Date(Date.now() + TRUST_DEVICE_SECONDS * 1000),
	});
	await ctx.setSignedCookie(
		cookie.name,
		`${sign(ctx.context.secret, userId, fresh)}!${fresh}`,
		ctx.context.secret,
		cookie.attributes,
	);
	return true;
}
