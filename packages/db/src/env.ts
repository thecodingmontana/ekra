import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** Database settings, checked on first use. Keep `.env.example` and SETUP.md in sync. */
export const env = createEnv({
	server: {
		DATABASE_URL: z.url(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
