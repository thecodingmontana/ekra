import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

/** Primary key: a time-ordered UUID made by Postgres 18 (`uuidv7()`), so ids sort by creation time. */
export const id = () => uuid("id").primaryKey().default(sql`uuidv7()`);

/** A point in time, stored with its time zone, to the millisecond. */
export const moment = (name: string) =>
	timestamp(name, { mode: "date", precision: 3, withTimezone: true });

/** createdAt / updatedAt, named the way Better Auth's tables name them (columns are snake_case). */
export const timestamps = {
	createdAt: moment("created_at").defaultNow().notNull(),
	updatedAt: moment("updated_at")
		.defaultNow()
		.notNull()
		.$onUpdateFn(() => new Date()),
};
