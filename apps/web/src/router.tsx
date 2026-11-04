import { HttpLink } from "@apollo/client";
import {
	ApolloClient,
	InMemoryCache,
	routerWithApolloClient,
} from "@apollo/client-integration-tanstack-start";
import { tenantUrls } from "@ekra/core";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { PageFailed, PageNotFound } from "./components/states";
import { TAB_ID } from "./lib/tab";
import { routeTree } from "./routeTree.gen";

// During server rendering, call the API directly with the visitor's cookies; in the browser, use /api on this origin.
const graphqlFetch = createIsomorphicFn()
	.server((): typeof fetch => async (_input, init) => {
		const [{ env }, { getRequestHeaders, getRequest }] = await Promise.all([
			import("./env.ts"),
			import("@tanstack/react-start/server"),
		]);
		const headers = new Headers(init?.headers);
		const cookie = getRequestHeaders().get("cookie");
		if (cookie) headers.set("cookie", cookie);
		// the API takes POSTs only from the app's own origin (the address this page was opened at)
		headers.set("origin", new URL(getRequest().url).origin);
		return fetch(`${env.API_URL}/api/graphql`, { ...init, headers });
	})
	.client((): typeof fetch => (input, init) => {
		// lets live updates skip the tab that made a change (it already shows it)
		const headers = new Headers(init?.headers);
		headers.set("x-ekra-tab", TAB_ID);
		return fetch(input, { ...init, headers });
	});

export function getRouter() {
	const apolloClient = new ApolloClient({
		cache: new InMemoryCache(),
		link: new HttpLink({ uri: "/api/graphql", fetch: graphqlFetch() }),
		// show what's cached at once, then refresh from the server
		defaultOptions: {
			watchQuery: {
				fetchPolicy: "cache-and-network",
				nextFetchPolicy: "cache-first",
			},
		},
	});

	// acme.ekra.localhost/settings is the route /o/acme/settings, and back
	const tenant = tenantUrls(__APP_URL__);

	const router = createTanStackRouter({
		routeTree,
		rewrite: {
			input: ({ url }) => tenant.input(url),
			output: ({ url }) => tenant.output(url),
		},
		context: { ...routerWithApolloClient.defaultContext },
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		defaultNotFoundComponent: PageNotFound,
		// a page that throws shows the "Something went wrong" state in its place
		defaultErrorComponent: PageFailed,
	});

	return routerWithApolloClient(router, apolloClient);
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
