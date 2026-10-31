import { serve } from "@hono/node-server";
import { app } from "./app.ts";
import { env } from "./env.ts";

const server = serve(
	{ fetch: app.fetch, port: env.SERVER_PORT, hostname: env.SERVER_HOST },
	(info) => {
		console.log(`Ekra API on http://${info.address}:${info.port}/api`);
	},
);

// finish open requests before exiting (Ctrl+C, docker stop)
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => server.close(() => process.exit(0)));
}
