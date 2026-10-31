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
		// optional: "Continue with Google" appears only when both are set
		GOOGLE_CLIENT_ID: z.string().min(1).optional(),
		GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
	},
	runtimeEnv: process.env,
	// treat VAR= in .env as unset, so defaults apply
	emptyStringAsUndefined: true,
});
