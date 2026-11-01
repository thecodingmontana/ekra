import type { ApolloClientIntegration } from "@apollo/client-integration-tanstack-start";
import { Toaster } from "@ekra/ui/components/toast/toaster";
import appCss from "@ekra/ui/globals.css?url";
import {
	createRootRouteWithContext,
	HeadContent,
	redirect,
	ScriptOnce,
	Scripts,
} from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { THEME_SCRIPT } from "@/lib/theme";

const currentUrl = createIsomorphicFn()
	.server(async () => {
		const { getRequestUrl } = await import("@tanstack/react-start/server");
		return getRequestUrl().href;
	})
	.client(async () => window.location.href);

export const Route =
	createRootRouteWithContext<ApolloClientIntegration.RouterContext>()({
		// sign-in only works on the app's address and its subdomains (the cookie is theirs): send other hosts
		// (e.g. localhost:3000) there.
		// shortcut: custom organization domains (Phase 8) will need to pass this check too.
		beforeLoad: async () => {
			const url = new URL(await currentUrl());
			const app = new URL(__APP_URL__);
			if (url.host === app.host || url.host.endsWith(`.${app.host}`)) return;
			throw redirect({ href: `${app.origin}${url.pathname}${url.search}` });
		},
		head: () => ({
			meta: [
				{ charSet: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				{ title: "Ekra" },
				{ name: "description", content: "Learning for teams and creators." },
			],
			links: [
				{ rel: "stylesheet", href: appCss },
				{ rel: "icon", href: "/favicon.ico" },
			],
		}),
		shellComponent: RootDocument,
	});

function RootDocument({ children }: { children: ReactNode }) {
	return (
		// the theme script sets class and colour-scheme on <html> before React hydrates
		<html lang="en" suppressHydrationWarning>
			<head>
				<ScriptOnce>{THEME_SCRIPT}</ScriptOnce>
				<HeadContent />
			</head>
			<body className="bg-background text-foreground antialiased">
				{children}
				<Toaster position="top-center" />
				<Scripts />
			</body>
		</html>
	);
}
