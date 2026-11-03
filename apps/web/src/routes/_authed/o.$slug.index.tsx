import { useMutation, useQuery } from "@apollo/client/react";
import { buttonVariants } from "@ekra/ui/components/button";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { KindIcon } from "@/components/library/bits";
import {
	type Certificate,
	CLAIM_CERTIFICATE,
	MY_LEARNING,
	type MyEnrollment,
} from "@/graphql/learning";
import { STATUS_LABEL } from "@/lib/assignees";
import { KINDS } from "@/lib/content-kinds";
import { prime, reloadOnEnter } from "@/lib/routing";

type Data = { myLearning: MyEnrollment[]; myCertificates: Certificate[] };

export const Route = createFileRoute("/_authed/o/$slug/")({
	shouldReload: reloadOnEnter,
	loader: ({ context, params }) =>
		prime(context.apolloClient, {
			query: MY_LEARNING,
			variables: { slug: params.slug },
		}),
	head: ({ match }) => ({
		meta: [{ title: `${match.context.membership.organization.name} · Ekra` }],
	}),
	component: Home,
});

const STATUS_DOT: Record<MyEnrollment["status"], string> = {
	not_started: "bg-muted-foreground/50",
	in_progress: "bg-tint-amber",
	overdue: "bg-destructive",
	completed: "bg-tint-green",
};
const CERTIFIED = new Set(["course", "path", "quiz"]);
const day = (iso: string) =>
	new Date(iso).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});

function Home() {
	const { viewer, membership } = Route.useRouteContext();
	const { slug } = Route.useParams();
	const { data } = useQuery<Data>(MY_LEARNING, { variables: { slug } });
	const mine = data?.myLearning ?? [];
	const certificates = new Map(
		(data?.myCertificates ?? []).map((c) => [c.contentId, c]),
	);
	const open = mine.filter((e) => e.status !== "completed");
	const done = mine.filter((e) => e.status === "completed");

	return (
		<main className="mx-auto w-full max-w-[960px] px-4 pt-5 pb-24 sm:px-6 sm:pt-7">
			<h1 className="m-0 font-semibold text-xl leading-[1.2] tracking-[-0.022em] sm:text-2xl">
				Welcome, {viewer.name.split(" ")[0]}
			</h1>
			<p className="mt-1 text-muted-foreground">
				{membership.organization.name}
			</p>

			<Section title="My learning" testId="my-learning">
				{!data ? (
					<p className="px-3.5 py-4 text-muted-foreground text-sm">Loading…</p>
				) : open.length ? (
					open.map((e) => (
						<Row key={e.id} slug={slug} e={e} certificate={undefined} />
					))
				) : (
					<p className="px-3.5 py-4 text-muted-foreground text-sm">
						{mine.length
							? "You've finished everything you were given."
							: "Nothing to take yet."}{" "}
						<Link
							to="/o/$slug/library"
							params={{ slug }}
							className="text-foreground underline underline-offset-2"
						>
							Browse the library
						</Link>
					</p>
				)}
			</Section>

			{done.length > 0 && (
				<Section title="Completed" testId="completed">
					{done.map((e) => (
						<Row
							key={e.id}
							slug={slug}
							e={e}
							certificate={certificates.get(e.content.id)}
						/>
					))}
				</Section>
			)}
		</main>
	);
}

function Section({
	title,
	testId,
	children,
}: {
	title: string;
	testId: string;
	children: React.ReactNode;
}) {
	return (
		<section className="mt-7" data-testid={testId}>
			<h2 className="mb-2 font-semibold text-sm">{title}</h2>
			<div className="overflow-hidden rounded-[10px] border">{children}</div>
		</section>
	);
}

function Row({
	slug,
	e,
	certificate,
}: {
	slug: string;
	e: MyEnrollment;
	certificate: Certificate | undefined;
}) {
	const label = STATUS_LABEL[e.status];
	const dot = STATUS_DOT[e.status];
	return (
		<div
			className="flex min-h-[56px] items-center gap-3 border-border/60 border-t px-3.5 py-2 first:border-t-0"
			data-testid="learning-row"
		>
			<KindIcon kind={e.content.kind} decorative />
			<div className="min-w-0 flex-1">
				<Link
					to="/o/$slug/library/$id"
					params={{ slug, id: e.content.id }}
					className="block truncate font-medium hover:underline"
				>
					{e.content.title}
				</Link>
				<div className="truncate text-muted-foreground text-xs">
					{KINDS[e.content.kind].label}
					{e.dueAt && ` · due ${day(e.dueAt)}`}
					<span className="sm:hidden">
						{" · "}
						{label}
						{e.status !== "completed" && ` · ${e.percent}%`}
					</span>
				</div>
			</div>
			<div className="hidden w-32 items-center gap-2 sm:flex">
				<div
					className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
					role="progressbar"
					aria-valuenow={e.percent}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label={`${e.content.title} progress`}
				>
					<div
						className="h-full rounded-full bg-brand"
						style={{ width: `${e.percent}%` }}
					/>
				</div>
				<span className="w-8 text-right text-muted-foreground text-xs tabular-nums">
					{e.percent}%
				</span>
			</div>
			<span
				className="hidden h-5 w-[104px] items-center sm:inline-flex gap-[5px] whitespace-nowrap font-medium text-xs"
				data-testid="learning-status"
			>
				<i className={cn("size-1.5 rounded-full", dot)} />
				{label}
			</span>
			{e.status === "completed" && CERTIFIED.has(e.content.kind) && (
				<CertificateButton
					slug={slug}
					contentId={e.content.id}
					certificate={certificate}
				/>
			)}
		</div>
	);
}

function CertificateButton({
	slug,
	contentId,
	certificate,
}: {
	slug: string;
	contentId: string;
	certificate: Certificate | undefined;
}) {
	const navigate = useNavigate();
	const [claim, { loading }] = useMutation<{
		claimCertificate: { id: string };
	}>(CLAIM_CERTIFICATE, { refetchQueries: [MY_LEARNING] });
	const look = buttonVariants({ variant: "outline", size: "sm" });
	if (certificate)
		return (
			<Link
				to="/certificates/$id"
				params={{ id: certificate.id }}
				className={look}
			>
				Certificate
			</Link>
		);
	return (
		<button
			type="button"
			className={look}
			disabled={loading}
			onClick={async () => {
				try {
					const { data } = await claim({ variables: { slug, contentId } });
					if (data)
						await navigate({
							to: "/certificates/$id",
							params: { id: data.claimCertificate.id },
						});
				} catch (error) {
					toast.error("Couldn't get your certificate", {
						desc: error instanceof Error ? error.message : undefined,
					});
				}
			}}
		>
			{loading ? "Getting it…" : "Get certificate"}
		</button>
	);
}
