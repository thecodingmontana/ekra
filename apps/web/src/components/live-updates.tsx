import { useApolloClient } from "@apollo/client/react";
import { spaced } from "@ekra/core";
import { useEffect } from "react";
import { TAB_ID } from "@/lib/tab";

/**
 * Keeps an organization's pages current: when anything in it changes (by a teammate, or in another tab), the
 * server says "changed" and what's on screen is fetched again. Nothing is shown. The browser reconnects on its
 * own after a dropped connection, and then catches up once.
 */
export function LiveUpdates({ slug }: { slug: string }) {
	const client = useApolloClient();
	useEffect(() => {
		const refresh = spaced(() => client.refetchQueries({ include: "active" }));
		const source = new EventSource(
			`/api/events?org=${encodeURIComponent(slug)}`,
		);
		let connected = false;
		source.addEventListener("ready", () => {
			if (connected) refresh();
			connected = true;
		});
		source.addEventListener("changed", (event) => {
			try {
				const { from } = JSON.parse(event.data) as { from: string | null };
				if (from !== TAB_ID) refresh();
			} catch {
				refresh();
			}
		});
		return () => {
			refresh.cancel();
			source.close();
		};
	}, [slug, client]);
	return null;
}
