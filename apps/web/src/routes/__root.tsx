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
		notFoundComponent: () => (
			<main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-2 p-6">
				<h1 className="font-heading text-xl font-medium">Page not found</h1>
				<p className="text-muted-foreground text-sm">
					The page you're looking for doesn't exist.
				</p>
			</main>
		),
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
