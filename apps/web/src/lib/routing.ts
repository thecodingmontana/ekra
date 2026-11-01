import type { ApolloClient, OperationVariables } from "@apollo/client";

/**
 * A loader's query, stale-while-revalidate: data already in the cache shows at once and is refreshed in the
 * background (the page re-renders when it lands); only a first visit waits.
 */
export function prime<TData, TVariables extends OperationVariables>(
	client: ApolloClient,
	options: ApolloClient.QueryOptions<TData, TVariables>,
): Promise<{ data: TData | undefined }> {
	const fresh = () => client.query({ ...options, fetchPolicy: "network-only" });
	const cached = client.readQuery<TData, TVariables>(
		options as ApolloClient.ReadQueryOptions<TData, TVariables>,
	);
	if (cached == null) return fresh();
	// a failed refresh keeps what's on screen; the next visit tries again
	void fresh().catch(() => {});
	return Promise.resolve({ data: cached });
}

/** Loaders re-run when you enter a page, not when only its search changes (a tab, a filter, the layout). */
export const reloadOnEnter = ({
	cause,
}: {
	cause: "preload" | "enter" | "stay";
}) => cause !== "stay";
