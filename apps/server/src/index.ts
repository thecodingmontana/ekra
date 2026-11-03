import { serve } from "@hono/node-server";
import { log } from "evlog";
import { app } from "./app.ts";
import { closeDb } from "./db.ts";
import { env } from "./env.ts";
import { closeStreams } from "./realtime.ts";

const server = serve(
	{ fetch: app.fetch, port: env.SERVER_PORT, hostname: env.SERVER_HOST },
	(info) => {
		log.info("server", `Ekra API on http://${info.address}:${info.port}/api`);
	},
);

/** how long requests still running at shutdown get to finish */
const DRAIN_MS = 10_000;

// finish open requests, then close the database, before exiting (Ctrl+C, docker stop, a dev restart)
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => {
		server.close(() => closeDb().then(() => process.exit(0)));
		// live-update streams never finish on their own; end them so the close above can (browsers reconnect)
		closeStreams();
		// kept-alive connections (the dev proxy's, a load balancer's) would hold the close forever
		if ("closeIdleConnections" in server) server.closeIdleConnections();
		setTimeout(() => {
			if ("closeAllConnections" in server) server.closeAllConnections();
		}, DRAIN_MS).unref();
	});
}
