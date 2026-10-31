// Runs once before the server tests (package.json "test"): brings the test database (set up by test-env.ts) up to date.
import { migrateDatabase } from "@ekra/db";

await migrateDatabase(process.env.DATABASE_URL ?? "");
