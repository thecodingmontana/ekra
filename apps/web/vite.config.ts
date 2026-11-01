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
	// fail fast on bad settings; /api/* is forwarded to the API by src/routes/api/$.ts
	await import("./src/env.ts");

	return {
		envDir: ROOT,
		// where the app runs (organizations get subdomains of it); one setting shared with the API
		define: {
			__APP_URL__: JSON.stringify(
				process.env.BETTER_AUTH_URL ?? "http://ekra.localhost:3000",
			),
		},
		resolve: { tsconfigPaths: true },
		// packages used inside @ekra/ui: bundled up front, so Vite doesn't find them mid-session, re-bundle and
		// leave the open page with two copies of React ("Invalid hook call")
		optimizeDeps: {
			include: [
				"@ekra/ui > @base-ui/react/button",
				"@ekra/ui > @base-ui/react/input",
				"@ekra/ui > @base-ui/react/menu",
				"@ekra/ui > @base-ui/react/separator",
				"@ekra/ui > @base-ui/react/tooltip",
				"@ekra/ui > motion/react",
				"qrcode.react",
			],
		},
		plugins: [devtools(), nitro(), tailwindcss(), tanstackStart(), viteReact()],
	};
});
