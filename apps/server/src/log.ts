import { initLogger } from "evlog";
import { createFsDrain } from "evlog/fs";
import { evlog } from "evlog/hono";
import { env } from "./env.ts";

/**
 * Structured logs with evlog: one wide event per request (method, path, status, duration, who, what went wrong).
 * Development: a readable tree in the terminal, plus NDJSON files in apps/server/.evlog/logs for tools and agents.
 * Production: one JSON line per event on stdout for the operator's log collector, with emails, IPs and tokens masked.
 */
initLogger({
	env: { service: "ekra-api", environment: env.NODE_ENV },
	// tests check behaviour, not log lines (events are still built, so useLogger() works)
	silent: env.NODE_ENV === "test",
	// an explicit dir stops evlog probing for Nitro's config (installed here for the web app), which warns
	drain:
		env.NODE_ENV === "development"
			? createFsDrain({ dir: ".evlog/logs" })
			: undefined,
});

/** Hono middleware: starts the request's wide event; handlers add to it with `useLogger()` from evlog/hono. */
export const requestLogs = evlog({ include: ["/api/**"] });
