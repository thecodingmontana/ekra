import type { ApolloClientIntegration } from "@apollo/client-integration-tanstack-start";
import { Toaster } from "@ekra/ui/components/toast/toaster";
import appCss from "@ekra/ui/globals.css?url";
import {
	createRootRouteWithContext,
	HeadContent,
	ScriptOnce,
	Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { THEME_SCRIPT } from "@/lib/theme";

export const Route =
	createRootRouteWithContext<ApolloClientIntegration.RouterContext>()({
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
