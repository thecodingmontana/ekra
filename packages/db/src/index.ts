import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
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
	return {
		db: drizzle({ client }),
		close: () => client.end(),
		/** Postgres LISTEN on its own connection; calls `onMessage` with each NOTIFY payload. */
		listen: (channel: string, onMessage: (payload: string) => void) =>
			client.listen(channel, onMessage),
		/** Postgres NOTIFY: every process LISTENing on `channel` gets `payload`. */
		notify: (channel: string, payload: string) =>
			client.notify(channel, payload),
	};
}

export type Db = ReturnType<typeof createDb>["db"];

/** Apply every pending migration to the database at `url` (tests use this; apps use `pnpm db:migrate`). */
export async function migrateDatabase(url: string) {
	// one connection, holding a lock: two processes migrating at once (parallel test runs) wait for each other
	const client = postgres(url, { max: 1, onnotice: () => {} });
	try {
		await client`select pg_advisory_lock(hashtext('ekra-migrate'))`;
		await migrate(drizzle({ client }), {
			migrationsFolder: fileURLToPath(
				new URL("../migrations", import.meta.url),
			),
		});
	} finally {
		await client.end();
	}
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Runs `run` in a transaction that can only see and change the organization's rows: it switches to the ekra_app
 * role and sets app.org_id, so every tenant table's row-level policy applies, even to a query that forgets its
 * org_id filter. Every read or write of tenant data goes through here.
 */
export function withOrg<T>(
	db: Db,
	orgId: string,
	run: (tx: Tx) => Promise<T>,
): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`set local role ekra_app`);
		await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
		return run(tx);
	});
}
