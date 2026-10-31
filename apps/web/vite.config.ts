import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

const ROOT = "../..";

export default defineConfig(async ({ mode }) => {
	// one .env at the repo root for every app; values already set in the shell win
	for (const [key, value] of Object.entries(loadEnv(mode, ROOT, ""))) {
		process.env[key] ??= value;
	}
	const { env } = await import("./src/env.ts");

	// The browser only ever talks to /api on this origin. Nitro forwards it to the Hono API, in dev and in the
	// built server alike (Vite's own proxy never sees requests: Nitro answers them first).
	// shortcut: plain HTTP only, no WebSocket upgrade yet; add it with the realtime work (Phase 1).
	const routeRules = { "/api/**": { proxy: `${env.API_URL}/api/**` } };

	return {
		envDir: ROOT,
		resolve: { tsconfigPaths: true },
		plugins: [
			devtools(),
			nitro({ routeRules }),
			tailwindcss(),
			tanstackStart(),
			viteReact(),
		],
	};
});
