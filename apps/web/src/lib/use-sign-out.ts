import { useApolloClient } from "@apollo/client/react";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "./auth-client";

/** Sign out, forget everything cached for this person, and go to the sign-in page (then on to `next`). */
export function useSignOut(next?: string) {
	const apollo = useApolloClient();
	const navigate = useNavigate();
	return async () => {
		await authClient.signOut();
		await apollo.clearStore();
		await navigate({
			to: "/sign-in",
			search: { next, error: undefined, mode: undefined },
		});
	};
}
