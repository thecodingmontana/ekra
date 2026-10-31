import { EMAIL_PROVIDERS } from "@ekra/email";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Every environment variable the server reads, checked once at startup.
 * Read config through `env`, never `process.env`, so a missing or bad value fails fast with a clear message.
 * Keep this list, `.env.example` and SETUP.md in sync.
 */
export const env = createEnv({
	server: {
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		SERVER_HOST: z.string().min(1).default("127.0.0.1"),
		SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
		// Better Auth: signs sessions; at least 32 random characters (openssl rand -base64 48)
		BETTER_AUTH_SECRET: z.string().min(32),
		// the address people open the app at (the web app, which forwards /api here)
		BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
		// proxies in front of the web app (Caddy, Nginx, a load balancer): their addresses are skipped when finding
		// a visitor's IP for rate limits. Comma-separated IPs or CIDRs; this machine (loopback) is always trusted.
		TRUSTED_PROXIES: z
			.string()
			.default("")
			.transform((v) => [
				"127.0.0.1",
				"::1",
				"::ffff:127.0.0.1",
				...v
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
			]),
		// optional: "Continue with Google" appears only when both are set
		GOOGLE_CLIENT_ID: z.string().min(1).optional(),
		GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
		// email: which provider sends it (resend by default; console prints it, for development)
		EMAIL_PROVIDER: z.enum(EMAIL_PROVIDERS).default("resend"),
		// sender; with Resend, the domain must be verified there
		EMAIL_FROM: z.string().min(3).default("Ekra <onboarding@resend.dev>"),
		RESEND_API_KEY: z.string().min(1).optional(),
	},
	runtimeEnv: process.env,
	// treat VAR= in .env as unset, so defaults apply
	emptyStringAsUndefined: true,
});
