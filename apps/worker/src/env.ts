import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Every environment variable the worker reads, checked once at startup (the same names as the server's; see
 * SETUP.md). DATABASE_URL is read by @ekra/db.
 */
export const env = createEnv({
	server: {
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		S3_ENDPOINT: z.url().default("http://localhost:8334"),
		S3_REGION: z.string().min(1).default("us-east-1"),
		S3_BUCKET: z.string().min(3).default("ekra"),
		S3_ACCESS_KEY: z.string().min(1),
		S3_SECRET_KEY: z.string().min(1),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});

// .env.example's placeholder is public: fine on a laptop, never on a server
if (env.NODE_ENV === "production" && env.S3_SECRET_KEY.includes("change-me"))
	throw new Error(
		"S3_SECRET_KEY still has the placeholder from .env.example. Set the storage's real secret key before running in production.",
	);
