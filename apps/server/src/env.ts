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
	},
	runtimeEnv: process.env,
	// treat VAR= in .env as unset, so defaults apply
	emptyStringAsUndefined: true,
});
