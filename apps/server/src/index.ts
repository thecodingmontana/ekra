import { serve } from "@hono/node-server";
import { log } from "evlog";
import { app } from "./app.ts";
import { closeDb } from "./db.ts";
import { env } from "./env.ts";

const server = serve(
	{ fetch: app.fetch, port: env.SERVER_PORT, hostname: env.SERVER_HOST },
	(info) => {
		log.info("server", `Ekra API on http://${info.address}:${info.port}/api`);
	},
);

// finish open requests, then close the database, before exiting (Ctrl+C, docker stop)
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () =>
		server.close(() => closeDb().then(() => process.exit(0))),
	);
}
