import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

/** Primary key: a time-ordered UUID made by Postgres 18 (`uuidv7()`), so ids sort by creation time. */
export const id = () => uuid("id").primaryKey().default(sql`uuidv7()`);

const moment = (name: string) =>
	timestamp(name, { mode: "date", precision: 3, withTimezone: true });

export const timestamps = {
	created_at: moment("created_at").defaultNow().notNull(),
	updated_at: moment("updated_at")
		.defaultNow()
		.notNull()
		.$onUpdateFn(() => new Date()),
};
