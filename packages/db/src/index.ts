import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "./env.ts";

export * from "./schema/index.ts";

/**
 * A database connection. Each app makes one at startup and closes it on shutdown.
 * `url` defaults to DATABASE_URL; tests pass TEST_DATABASE_URL.
 */
export function createDb(url: string = env.DATABASE_URL) {
	const client = postgres(url, {
		max: 10,
		idle_timeout: 20,
		connect_timeout: 10,
	});
	return { db: drizzle({ client }), close: () => client.end() };
}

export type Db = ReturnType<typeof createDb>["db"];
