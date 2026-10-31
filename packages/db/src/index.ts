import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "./env.ts";
import * as schema from "./schema/index.ts";

export { generateId, ID_LENGTH } from "./schema/columns.ts";
export * from "./schema/index.ts";
/** Every table, as one object (Better Auth's Drizzle adapter looks tables up in it). */
export { schema };

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

/** Apply every pending migration to the database at `url` (tests use this; apps use `pnpm db:migrate`). */
export async function migrateDatabase(url: string) {
	const { db, close } = createDb(url);
	try {
		await migrate(db, {
			migrationsFolder: fileURLToPath(
				new URL("../migrations", import.meta.url),
			),
		});
	} finally {
		await close();
	}
}
