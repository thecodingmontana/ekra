import { timestamp, varchar } from "drizzle-orm/pg-core";
import { customAlphabet } from "nanoid";

export const ID_LENGTH = 16;

const nanoid = customAlphabet(
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
	ID_LENGTH,
);

/** A short, URL-safe id (16 characters from 62, as in zadaci). Better Auth uses it too (advanced.database.generateId). */
export function generateId(prefix?: string): string {
	const id = nanoid();
	return prefix ? `${prefix}_${id}` : id;
}

/** Primary key, filled in by the app with generateId(). */
export const id = () =>
	varchar("id", { length: ID_LENGTH })
		.primaryKey()
		.$defaultFn(() => generateId());

/** A column holding another table's id. */
export const idRef = (name: string) => varchar(name, { length: ID_LENGTH });

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
