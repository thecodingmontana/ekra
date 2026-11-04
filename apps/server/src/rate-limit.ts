import { getIP } from "better-auth/api";
import { createError } from "evlog";
import { createMiddleware } from "hono/factory";
import { auth } from "./auth/index.ts";

/** Stop counting old windows once this many keys are kept, so the map can't grow without end. */
const PRUNE_AT = 10_000;

/**
 * A fixed-window counter: `hit(key)` gives 0 while the key is within `limit` for the current window, else the
 * seconds until that window ends.
 * shortcut: per process, move to Postgres or Redis when running more than one API process
 */
export function fixedWindow(limit: number, windowMs: number, now = Date.now) {
	const windows = new Map<string, { count: number; endsAt: number }>();
	return {
		hit(key: string): number {
			const at = now();
			if (windows.size >= PRUNE_AT)
				for (const [k, w] of windows) if (w.endsAt <= at) windows.delete(k);
			const current = windows.get(key);
			if (!current || current.endsAt <= at) {
				windows.set(key, { count: 1, endsAt: at + windowMs });
				return 0;
			}
			current.count++;
			return current.count > limit
				? Math.ceil((current.endsAt - at) / 1000)
				: 0;
		},
	};
}

/**
 * Refuses (429, with Retry-After) a client that sends more than `limit` counted requests a minute. The client is
 * the same address Better Auth's limits use (the last X-Forwarded-For entry that isn't a TRUSTED_PROXIES one).
 */
export function perMinute(
	limit: number,
	counts: (request: Request) => boolean | Promise<boolean> = () => true,
) {
	const counter = fixedWindow(limit, 60_000);
	return createMiddleware(async (c, next) => {
		if (!(await counts(c.req.raw))) return next();
		const wait = counter.hit(getIP(c.req.raw, auth.options) ?? "unknown");
		if (!wait) return next();
		c.header("Retry-After", String(wait));
		throw createError({
			message: "Too many requests. Try again in a minute.",
			status: 429,
		});
	});
}
