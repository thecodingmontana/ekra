import { useApolloClient } from "@apollo/client/react";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "./auth-client";

/** Sign out, forget everything cached for this person, and go to the sign-in page. */
export function useSignOut() {
	const apollo = useApolloClient();
	const navigate = useNavigate();
	return async () => {
		await authClient.signOut();
		await apollo.clearStore();
		await navigate({
			to: "/sign-in",
			search: { next: undefined, error: undefined, mode: undefined },
		});
	};
}
