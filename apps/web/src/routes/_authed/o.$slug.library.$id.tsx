import { useMutation, useQuery } from "@apollo/client/react";
import { ago } from "@ekra/core";
import { Av } from "@ekra/ui/components/av";
import { Button } from "@ekra/ui/components/button";
import { cn } from "@ekra/ui/lib/utils";
import {
	createFileRoute,
	Link,
	notFound,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { CourseArea } from "@/components/course/course-area";
import { BodyEditor } from "@/components/editor/body-editor";
import { ReadOnlyBody } from "@/components/editor/read-only-body";
import { VersionHistory } from "@/components/editor/version-history";
import { KindIcon, StatusPill } from "@/components/library/bits";
import { ContentFormModal } from "@/components/library/content-form-modal";
import {
	ContentMenu,
	useContentActions,
} from "@/components/library/content-menu";
import { QuizPage } from "@/components/quiz/quiz-page";
import {
	CONTENT,
	type ContentData,
	type ContentItem,
	LIBRARY,
	type LibraryData,
	VIEW_CONTENT,
} from "@/graphql/library";
import { KINDS } from "@/lib/content-kinds";
import { prime, reloadOnEnter } from "@/lib/routing";

export const Route = createFileRoute("/_authed/o/$slug/library/$id")({
	shouldReload: reloadOnEnter,
	loader: async ({ context, params }) => {
		const [{ data }] = await Promise.all([
			prime<ContentData, { slug: string; id: string }>(context.apolloClient, {
				query: CONTENT,
				variables: params,
			}),
			prime(context.apolloClient, {
				query: LIBRARY,
				variables: { slug: params.slug, archived: false },
			}),
		]);
		if (!data?.content) throw notFound();
		// a folder is browsed in the library; only an archived one has its own page
		if (data.content.kind === "folder" && !data.content.archivedAt)
			throw redirect({
				to: "/o/$slug/library",
				params: { slug: params.slug },
				search: { folder: params.id },
			});
		return { title: data.content.title };
	},
	head: ({ loaderData, match }) => ({
		meta: [
			{
				title: `${loaderData?.title ?? "Content"} · ${match.context.membership.organization.name}`,
			},
		],
	}),
	component: ContentPage,
});

function ContentPage() {
	const { slug, id } = Route.useParams();
	const navigate = useNavigate();
	const { data } = useQuery<ContentData>(CONTENT, { variables: { slug, id } });
	const { data: lib } = useQuery<LibraryData>(LIBRARY, {
		variables: { slug, archived: false },
	});
	const [view] = useMutation(VIEW_CONTENT);
	const act = useContentActions(slug);
	const [editing, setEditing] = useState(false);
	const [history, setHistory] = useState(false);
	const [bodyKey, setBodyKey] = useState(0);

	// opening it puts it on top of your Recent list
	// biome-ignore lint/correctness/useExhaustiveDependencies: once per content
	useEffect(() => {
		void view({ variables: { slug, id } }).catch(() => {});
	}, [slug, id]);

	const item = data?.content;
	if (!item) return null;
	const canManage = lib?.library.canManage ?? false;
	const items = lib?.library.items ?? [];
	const folders = items.filter((i) => i.kind === "folder");
	const byId = new Map(items.map((i) => [i.id, i]));
	const trail: ContentItem[] = [];
	for (
		let at = item.parentId ? byId.get(item.parentId) : undefined;
		at && trail.length < 20;
		at = at.parentId ? byId.get(at.parentId) : undefined
	)
		trail.unshift(at);
	const k = KINDS[item.kind];
	const archived = !!item.archivedAt;
	const toLibrary = () =>
		navigate({
			to: "/o/$slug/library",
			params: { slug },
			search: item.parentId ? { folder: item.parentId } : {},
		});

	return (
		<main className="mx-auto w-full max-w-[1160px] px-4 pt-5 pb-24 sm:px-6 sm:pt-7">
			<nav
				className="mb-5 flex min-w-0 items-center gap-2 text-muted-foreground text-sm"
				aria-label="Where you are"
			>
				<Link
					to="/o/$slug/library"
					params={{ slug }}
					search={archived ? { show: "archived" } : {}}
					className="whitespace-nowrap transition-colors hover:text-foreground"
					data-testid="crumb-library"
				>
					{archived ? "Archived" : "Library"}
				</Link>
				{!archived &&
					trail.map((f) => (
						<span key={f.id} className="flex min-w-0 items-center gap-2">
							<Sep />
							<Link
								to="/o/$slug/library"
								params={{ slug }}
								search={{ folder: f.id }}
								className="truncate transition-colors hover:text-foreground"
							>
								{f.title}
							</Link>
						</span>
					))}
				<Sep />
				<span className="truncate font-medium text-foreground">
					{item.title}
				</span>
			</nav>

			{archived && (
				<div className="mb-5 flex flex-wrap items-center gap-3 rounded-[10px] border border-tint-amber/30 bg-tint-amber/8 px-3.5 py-2.5 text-sm">
					<span
						className="icon-[solar--archive-linear] size-4 text-tint-amber"
						aria-hidden="true"
					/>
					<span className="flex-1">
						This {k.label.toLowerCase()} is archived: it's out of the library
						and learners can't see it.
					</span>
					{canManage && (
						<Button
							size="sm"
							variant="outline"
							onClick={() => act.archive(item, false)}
						>
							Restore
						</Button>
					)}
				</div>
			)}

			<header className="mb-6 flex flex-wrap items-start gap-3.5">
				<KindIcon kind={item.kind} size={40} />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h1
							className="m-0 min-w-0 break-words font-semibold text-xl leading-[1.2] tracking-[-0.022em] sm:text-2xl"
							data-testid="content-heading"
						>
							{item.title}
						</h1>
						<StatusPill item={item} />
					</div>
					<p className="mt-1 text-muted-foreground">
						{k.label}
						{item.author && ` · made by ${item.author.name}`}
						<span suppressHydrationWarning>
							{" "}
							· updated {ago(item.updatedAt)}
						</span>
					</p>
				</div>
				<div className="flex w-full items-center gap-1.5 sm:w-auto">
					<Button
						variant="ghost"
						size="icon"
						aria-label={
							item.isFavorite ? "Remove from favorites" : "Add to favorites"
						}
						aria-pressed={item.isFavorite}
						onClick={() => act.favorite(item)}
						data-testid="favorite"
						className={cn(
							item.isFavorite ? "text-tint-amber" : "text-muted-foreground",
						)}
					>
						<span
							className={cn(
								item.isFavorite
									? "icon-[solar--star-bold]"
									: "icon-[solar--star-linear]",
								"size-4",
							)}
							aria-hidden="true"
						/>
					</Button>
					{canManage && !archived && (
						<>
							{!["folder", "course", "quiz"].includes(item.kind) && (
								<Button
									variant="outline"
									onClick={() => setHistory(true)}
									data-testid="history"
								>
									<span
										className="icon-[solar--history-linear] size-3.5"
										aria-hidden="true"
									/>
									History
								</Button>
							)}
							<Button variant="outline" onClick={() => setEditing(true)}>
								<span
									className="icon-[solar--pen-linear] size-3.5"
									aria-hidden="true"
								/>
								Edit details
							</Button>
							{item.isTemplate ? (
								<Button onClick={() => act.duplicate(item)}>
									<span
										className="icon-[solar--copy-linear] size-3.5"
										aria-hidden="true"
									/>
									Use template
								</Button>
							) : (
								<Button
									variant={item.status === "published" ? "outline" : "default"}
									onClick={() => act.publish(item)}
									data-testid="publish"
								>
									{item.status === "published" ? "Unpublish" : "Publish"}
								</Button>
							)}
						</>
					)}
					<ContentMenu
						slug={slug}
						item={item}
						canManage={canManage}
						folders={folders}
						onArchived={toLibrary}
					/>
				</div>
			</header>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
				<section className="flex min-w-0 flex-col gap-4">
					{item.description ? (
						<p className="m-0 whitespace-pre-line text-[14px] leading-[1.6]">
							{item.description}
						</p>
					) : (
						canManage && (
							<p className="m-0 text-muted-foreground">
								No description yet.{" "}
								<button
									type="button"
									className="text-foreground underline underline-offset-2"
									onClick={() => setEditing(true)}
								>
									Add one
								</button>{" "}
								so people know what it covers.
							</p>
						)
					)}
					{item.kind === "folder" ? (
						<Empty
							icon={k.icon}
							title="Restore this folder to see what's inside"
							body="Archived folders can't be opened. Restoring it puts it and its content back in the library."
						/>
					) : item.kind === "course" ? (
						<CourseArea
							slug={slug}
							id={item.id}
							cover={item.cover}
							canManage={canManage && !archived}
						/>
					) : item.kind === "quiz" ? (
						<QuizPage
							slug={slug}
							id={item.id}
							title={item.title}
							canManage={canManage && !archived}
						/>
					) : canManage && !archived ? (
						<BodyEditor key={bodyKey} slug={slug} item={item} />
					) : item.doc ? (
						<ReadOnlyBody key={item.bodyUpdatedAt} doc={item.doc} />
					) : (
						<Empty
							icon={k.icon}
							title="Nothing to read here yet"
							body={
								canManage
									? "Restore it to write its page."
									: "Its trainers are still putting it together. Check back soon."
							}
						/>
					)}
				</section>

				<aside className="h-fit rounded-[10px] border bg-card">
					<h2 className="m-0 border-b px-3.5 py-2.5 font-semibold text-sm">
						Details
					</h2>
					<dl className="m-0 flex flex-col px-3.5 py-1 text-sm">
						<Detail label="Kind">
							<span className="flex items-center gap-1.5">
								<span
									className={cn(k.icon, "size-3.5 text-muted-foreground")}
									aria-hidden="true"
								/>
								{k.label}
							</span>
						</Detail>
						{item.kind !== "folder" && (
							<Detail label="Status">
								{item.isTemplate
									? "Template, learners never see it"
									: item.status === "published"
										? "Published, learners can see it"
										: "Draft, only your team sees it"}
							</Detail>
						)}
						<Detail label="Folder">
							{trail.at(-1)?.title ?? "Top of the library"}
						</Detail>
						{item.author && (
							<Detail label="Made by">
								<span className="flex min-w-0 items-center gap-1.5">
									<Av
										name={item.author.name}
										image={item.author.image}
										size="sm"
									/>
									<span className="truncate">{item.author.name}</span>
								</span>
							</Detail>
						)}
						<Detail label="Created">
							<span suppressHydrationWarning>{ago(item.createdAt)}</span>
						</Detail>
						<Detail label="Updated">
							<span suppressHydrationWarning>{ago(item.updatedAt)}</span>
						</Detail>
					</dl>
				</aside>
			</div>

			{canManage &&
				!archived &&
				!["folder", "course", "quiz"].includes(item.kind) && (
					<VersionHistory
						slug={slug}
						id={item.id}
						doc={item.doc}
						open={history}
						onOpenChange={setHistory}
						// the editor starts again from the restored body
						onRestored={() => setBodyKey((n) => n + 1)}
					/>
				)}
			{canManage && (
				<ContentFormModal
					open={editing}
					onOpenChange={setEditing}
					slug={slug}
					item={item}
				/>
			)}
		</main>
	);
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex items-center gap-3 border-border/60 border-b py-2.5 last:border-b-0">
			<dt className="w-[72px] shrink-0 text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 flex-1">{children}</dd>
		</div>
	);
}

function Empty({
	icon,
	title,
	body,
}: {
	icon: string;
	title: string;
	body: string;
}) {
	return (
		<div className="flex flex-col items-center gap-1.5 rounded-[10px] border border-dashed px-6 py-14 text-center">
			<span className="mb-1 text-muted-foreground/70">
				<span className={cn(icon, "size-[22px]")} aria-hidden="true" />
			</span>
			<h2 className="m-0 font-semibold text-md">{title}</h2>
			<p className="m-0 max-w-[380px] text-muted-foreground text-sm">{body}</p>
		</div>
	);
}

function Sep() {
	return (
		<span
			className="icon-[solar--alt-arrow-right-linear] size-3 shrink-0 opacity-60"
			aria-hidden="true"
		/>
	);
}
