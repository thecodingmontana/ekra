import { createFileRoute, redirect } from "@tanstack/react-router";
import {
	MODES,
	type Mode,
	SignInPage,
	safeNext,
} from "@/components/sign-in-page";
import { SIGN_IN_METHODS, VIEWER, type Viewer } from "@/graphql/viewer";

export const Route = createFileRoute("/sign-in")({
	validateSearch: (search: Record<string, unknown>) => ({
		next: safeNext(search.next),
		error: typeof search.error === "string" ? search.error : undefined,
		mode: MODES.includes(search.mode as Mode)
			? (search.mode as Mode)
			: undefined,
	}),
	beforeLoad: async ({ context, search }) => {
		const { data } = await context.apolloClient.query<{
			viewer: Viewer | null;
		}>({
			query: VIEWER,
			fetchPolicy: "network-only",
		});
		if (data?.viewer) throw redirect({ href: search.next ?? "/" });
	},
	loader: async ({ context }) => {
		const { data } = await context.apolloClient.query<{
			signInMethods: string[];
		}>({
			query: SIGN_IN_METHODS,
		});
		return { methods: data?.signInMethods ?? [] };
	},
	head: () => ({ meta: [{ title: "Sign in · Ekra" }] }),
	component: SignIn,
});

function SignIn() {
	const { methods } = Route.useLoaderData();
	const { next, error, mode = "sign-in" } = Route.useSearch();
	return <SignInPage mode={mode} methods={methods} next={next} error={error} />;
}
