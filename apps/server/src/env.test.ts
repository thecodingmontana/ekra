import assert from "node:assert/strict";
import { test } from "node:test";
import { placeholderSecrets } from "./env.ts";

test("secrets left at .env.example's placeholder are named, real ones pass", () => {
	assert.deepEqual(
		placeholderSecrets({
			BETTER_AUTH_SECRET:
				"change-me-to-a-long-random-string-of-32-or-more-characters",
			S3_SECRET_KEY: "change-me",
		}),
		["BETTER_AUTH_SECRET", "S3_SECRET_KEY"],
	);
	assert.deepEqual(
		placeholderSecrets({
			BETTER_AUTH_SECRET: "q8Wm3x0Zr7…a-real-random-value",
			S3_SECRET_KEY: "s3cr3t-from-the-storage",
		}),
		[],
	);
});
