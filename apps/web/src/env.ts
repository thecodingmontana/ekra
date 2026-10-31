import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Server-side settings for the web app, checked when it starts.
 * Read config through `env`, never `process.env`. Keep `.env.example` and SETUP.md in sync.
 */
export const env = createEnv({
	server: {
		// where the web server (and the Vite dev proxy) reaches the Hono API
		API_URL: z.url().default("http://127.0.0.1:4000"),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
