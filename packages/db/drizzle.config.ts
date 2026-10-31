import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// one .env at the repo root for every app; Node reads it without extra packages
const ENV_FILE = "../../.env";
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const url = process.env.DATABASE_URL;
if (!url)
	throw new Error(
		"DATABASE_URL is not set. Copy .env.example to .env (see SETUP.md).",
	);

export default defineConfig({
	schema: "./src/schema/index.ts",
	out: "./migrations",
	dialect: "postgresql",
	verbose: true,
	dbCredentials: { url },
});
