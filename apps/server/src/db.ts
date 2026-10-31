import { createDb } from "@ekra/db";

/** The server's one database connection, shared by auth and GraphQL; closed on shutdown. */
export const { db, close: closeDb } = createDb();
