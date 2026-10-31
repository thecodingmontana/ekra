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
		resolve: { tsconfigPaths: true },
		plugins: [devtools(), nitro(), tailwindcss(), tanstackStart(), viteReact()],
	};
});
