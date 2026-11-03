import { Button } from "@ekra/ui/components/button";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { OrgLogo } from "@/components/org-logo";
import type { Membership } from "@/graphql/viewer";

type Shown = {
	id: string;
	name: string;
	title: string;
	issuedAt: string;
	organization: Pick<
		Membership["organization"],
		"name" | "slug" | "logo" | "color"
	>;
};

// during server rendering, ask the API directly; in the browser, /api on this origin
const fetchCertificate = createIsomorphicFn()
	.server(async (id: string) => {
		const { env } = await import("../env.ts");
		return fetch(`${env.API_URL}/api/certificates/${encodeURIComponent(id)}`);
	})
	.client((id: string) => fetch(`/api/certificates/${encodeURIComponent(id)}`));

// A certificate anyone can open and check (the link is its code); prints to a one-page PDF from the browser.
export const Route = createFileRoute("/certificates/$id")({
	loader: async ({ params }) => {
		const res = await fetchCertificate(params.id);
		if (res.status === 404) throw notFound();
		if (!res.ok) throw new Error("Couldn't check this certificate. Try again.");
		return (await res.json()) as Shown;
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData
					? `${loaderData.name} · ${loaderData.title} · Certificate`
					: "Certificate · Ekra",
			},
		],
	}),
	notFoundComponent: () => (
		<main className="grid min-h-dvh place-items-center p-6 text-center">
			<div>
				<h1 className="font-semibold text-xl">No such certificate</h1>
				<p className="mt-1 text-muted-foreground">
					Check the link: this code doesn't match a certificate Ekra issued.
				</p>
			</div>
		</main>
	),
	component: CertificatePage,
});

function CertificatePage() {
	const c = Route.useLoaderData();
	return (
		<main className="grid min-h-dvh place-items-center bg-muted/40 p-4 print:bg-white print:p-0">
			<div className="w-full max-w-[880px]">
				<article
					className="flex aspect-[1.414] flex-col items-center justify-center gap-5 rounded-xl border bg-background p-8 text-center shadow-sm sm:p-14 print:rounded-none print:border-0 print:shadow-none"
					data-testid="certificate"
				>
					<OrgLogo organization={c.organization} px={56} />
					<p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
						Certificate of completion
					</p>
					<h1 className="text-balance font-heading font-semibold text-3xl tracking-[-0.02em] sm:text-4xl">
						{c.name}
					</h1>
					<p className="max-w-[46ch] text-pretty text-muted-foreground">
						finished{" "}
						<span className="font-medium text-foreground">{c.title}</span> at{" "}
						{c.organization.name} on{" "}
						{/* fixed locale and zone: the server and the browser render the same text */}
						{new Date(c.issuedAt).toLocaleDateString("en-GB", {
							timeZone: "UTC",
							day: "numeric",
							month: "long",
							year: "numeric",
						})}
						.
					</p>
					<p className="mt-4 text-muted-foreground text-xs tabular-nums">
						Certificate {c.id} · issued with Ekra
					</p>
				</article>
				<div className="mt-4 flex justify-center print:hidden">
					<Button variant="outline" onClick={() => window.print()}>
						Print or save as PDF
					</Button>
				</div>
			</div>
		</main>
	);
}
