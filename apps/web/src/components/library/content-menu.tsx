import { useMutation } from "@apollo/client/react";
import { Button } from "@ekra/ui/components/button";
import {
	Menu,
	MenuContent,
	MenuItem,
	MenuSeparator,
	MenuTrigger,
} from "@ekra/ui/components/menu";
import { ConfirmModal, Modal, ModalBody } from "@ekra/ui/components/modal";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	ARCHIVE_CONTENT,
	type ContentItem,
	DELETE_CONTENT,
	DUPLICATE_CONTENT,
	FAVORITE_CONTENT,
	UPDATE_CONTENT,
} from "@/graphql/library";
import { KINDS } from "@/lib/content-kinds";
import { KindIcon } from "./bits";
import { ContentFormModal, REFETCH } from "./content-form-modal";

/** The library's actions on one piece of content, each with its toast. */
export function useContentActions(slug: string) {
	const navigate = useNavigate();
	const [favorite] = useMutation(FAVORITE_CONTENT);
	const [update] = useMutation(UPDATE_CONTENT, REFETCH);
	const [archive] = useMutation(ARCHIVE_CONTENT, REFETCH);
	const [remove] = useMutation(DELETE_CONTENT, REFETCH);
	const [duplicate] = useMutation<{ duplicateContent: ContentItem }>(
		DUPLICATE_CONTENT,
		REFETCH,
	);
	const open = (item: ContentItem) =>
		navigate({
			to: "/o/$slug/library/$id",
			params: { slug, id: item.id },
		});

	return {
		open,
		favorite: (item: ContentItem) =>
			favorite({
				variables: { slug, id: item.id, favorite: !item.isFavorite },
				optimisticResponse: {
					favoriteContent: {
						__typename: "ContentItem",
						id: item.id,
						isFavorite: !item.isFavorite,
					},
				},
			}).catch(() => toast.error("Couldn't update your favorites")),
		publish: (item: ContentItem) => {
			const next = item.status === "published" ? "draft" : "published";
			return toast.promise(
				update({ variables: { slug, id: item.id, input: { status: next } } }),
				{
					loading: next === "published" ? "Publishing…" : "Unpublishing…",
					success:
						next === "published"
							? `${item.title} is published: learners can see it`
							: `${item.title} is back to draft`,
					error: "Couldn't change it",
				},
			);
		},
		move: (item: ContentItem, parentId: string | null) =>
			toast.promise(
				update({ variables: { slug, id: item.id, input: { parentId } } }),
				{ loading: "Moving…", success: "Moved", error: "Couldn't move it" },
			),
		template: (item: ContentItem) =>
			toast.promise(
				update({
					variables: {
						slug,
						id: item.id,
						input: { isTemplate: !item.isTemplate },
					},
				}),
				{
					loading: "Saving…",
					success: item.isTemplate
						? "Removed from templates"
						: "Saved as a template",
					error: "Couldn't change it",
				},
			),
		duplicate: async (item: ContentItem) => {
			const { data } = await toast.promise(
				duplicate({ variables: { slug, id: item.id } }),
				{
					loading: item.isTemplate ? "Creating from template…" : "Copying…",
					success: (r) =>
						`Created ${r.data?.duplicateContent.title ?? "a copy"}`,
					error: "Couldn't copy it",
				},
			);
			if (data && item.isTemplate) open(data.duplicateContent);
		},
		archive: (item: ContentItem, archived: boolean) =>
			toast.promise(archive({ variables: { slug, id: item.id, archived } }), {
				loading: archived ? "Archiving…" : "Restoring…",
				success: archived
					? `${item.title} archived`
					: `${item.title} is back in the library`,
				error: archived ? "Couldn't archive it" : "Couldn't restore it",
			}),
		remove: (item: ContentItem) =>
			toast.promise(remove({ variables: { slug, id: item.id } }), {
				loading: "Deleting…",
				success: `${item.title} deleted`,
				error: "Couldn't delete it",
			}),
	};
}

type Dialog = "edit" | "move" | "archive" | "delete" | null;

/** The ⋯ menu on a card, a row or the content page. */
export function ContentMenu({
	slug,
	item,
	canManage,
	folders,
	className,
	onArchived,
}: {
	slug: string;
	item: ContentItem;
	canManage: boolean;
	/** the library's folders, for "Move to" */
	folders: ContentItem[];
	className?: string;
	/** after archiving (the content page goes back to the library) */
	onArchived?: () => void;
}) {
	const act = useContentActions(slug);
	const [dialog, setDialog] = useState<Dialog>(null);
	const archived = !!item.archivedAt;
	const label = KINDS[item.kind].label.toLowerCase();

	return (
		<>
			<Menu>
				<MenuTrigger
					render={
						<Button
							variant="ghost"
							size="icon-sm"
							className={cn("text-muted-foreground", className)}
							aria-label={`Actions for ${item.title}`}
							data-testid="content-menu"
						/>
					}
				>
					<span
						className="icon-[solar--menu-dots-bold] size-4"
						aria-hidden="true"
					/>
				</MenuTrigger>
				<MenuContent width={220}>
					{archived ? (
						<>
							<MenuItem
								icon="icon-[solar--archive-up-minimalistic-linear]"
								onSelect={() => act.archive(item, false)}
							>
								Restore
							</MenuItem>
							<MenuItem
								icon="icon-[solar--trash-bin-minimalistic-linear]"
								danger
								onSelect={() => setDialog("delete")}
							>
								Delete forever
							</MenuItem>
						</>
					) : (
						<>
							{item.kind !== "folder" && (
								<MenuItem
									icon="icon-[solar--eye-linear]"
									onSelect={() => act.open(item)}
								>
									Open
								</MenuItem>
							)}
							<MenuItem
								icon={
									item.isFavorite
										? "icon-[solar--star-bold]"
										: "icon-[solar--star-linear]"
								}
								onSelect={() => act.favorite(item)}
							>
								{item.isFavorite ? "Remove from favorites" : "Add to favorites"}
							</MenuItem>
							{canManage && (
								<>
									<MenuSeparator />
									<MenuItem
										icon="icon-[solar--pen-linear]"
										onSelect={() => setDialog("edit")}
									>
										Edit details
									</MenuItem>
									{item.kind !== "folder" && (
										<MenuItem
											icon={
												item.status === "published"
													? "icon-[solar--eye-closed-linear]"
													: "icon-[solar--upload-minimalistic-linear]"
											}
											onSelect={() => act.publish(item)}
										>
											{item.status === "published" ? "Unpublish" : "Publish"}
										</MenuItem>
									)}
									<MenuItem
										icon="icon-[solar--move-to-folder-linear]"
										onSelect={() => setDialog("move")}
									>
										Move to…
									</MenuItem>
									{item.kind !== "folder" && (
										<>
											<MenuItem
												icon="icon-[solar--copy-linear]"
												onSelect={() => act.duplicate(item)}
											>
												{item.isTemplate ? "Use template" : "Duplicate"}
											</MenuItem>
											<MenuItem
												icon="icon-[solar--layers-linear]"
												onSelect={() => act.template(item)}
											>
												{item.isTemplate
													? "Remove from templates"
													: "Save as template"}
											</MenuItem>
										</>
									)}
									<MenuSeparator />
									<MenuItem
										icon="icon-[solar--archive-linear]"
										onSelect={() => setDialog("archive")}
									>
										Archive
									</MenuItem>
								</>
							)}
						</>
					)}
				</MenuContent>
			</Menu>
			{canManage && (
				<>
					<ContentFormModal
						open={dialog === "edit"}
						onOpenChange={(o) => setDialog(o ? "edit" : null)}
						slug={slug}
						item={item}
					/>
					<MoveModal
						open={dialog === "move"}
						onOpenChange={(o) => setDialog(o ? "move" : null)}
						item={item}
						folders={folders}
						onMove={(parentId) => act.move(item, parentId)}
					/>
					<ConfirmModal
						open={dialog === "archive"}
						onOpenChange={(o) => setDialog(o ? "archive" : null)}
						title={`Archive this ${label}?`}
						body={
							item.kind === "folder"
								? `${item.title} leaves the library; what's inside it moves to the top. You can restore it from Archived.`
								: `${item.title} leaves the library and learners stop seeing it. You can restore it from Archived.`
						}
						ok="Archive"
						onConfirm={async () => {
							await act.archive(item, true);
							onArchived?.();
						}}
					/>
					<ConfirmModal
						open={dialog === "delete"}
						onOpenChange={(o) => setDialog(o ? "delete" : null)}
						title={`Delete this ${label} forever?`}
						body={`${item.title} and everyone's progress in it are deleted. This can't be undone.`}
						ok="Delete forever"
						danger
						typeName={item.title.length <= 40 ? item.title : undefined}
						onConfirm={() => act.remove(item)}
					/>
				</>
			)}
		</>
	);
}

/** Pick the folder to move content into, or the top of the library. */
function MoveModal({
	open,
	onOpenChange,
	item,
	folders,
	onMove,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	item: ContentItem;
	folders: ContentItem[];
	onMove: (parentId: string | null) => Promise<unknown>;
}) {
	const [busy, setBusy] = useState(false);
	// a folder can't go into itself or anything inside it
	const inside = new Set<string>([item.id]);
	let grew = true;
	while (grew) {
		grew = false;
		for (const f of folders)
			if (f.parentId && inside.has(f.parentId) && !inside.has(f.id)) {
				inside.add(f.id);
				grew = true;
			}
	}
	const targets = folders.filter((f) => !inside.has(f.id));
	const pick = async (parentId: string | null) => {
		setBusy(true);
		try {
			await onMove(parentId);
			onOpenChange(false);
		} catch {
			// the toast said why; stay open to pick again
		} finally {
			setBusy(false);
		}
	};
	const row =
		"flex min-h-[38px] w-full items-center gap-2.5 rounded-md px-2.5 text-left transition-colors hover:bg-muted disabled:opacity-50";

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			busy={busy}
			size="sm"
			title={`Move ${item.title}`}
			sub="Pick where it goes in the library."
		>
			<ModalBody className="gap-0.5 pt-2">
				<button
					type="button"
					className={row}
					disabled={busy || !item.parentId}
					onClick={() => pick(null)}
				>
					<span
						className="icon-[solar--library-linear] size-4 text-muted-foreground"
						aria-hidden="true"
					/>
					<span className="flex-1">Top of the library</span>
					{!item.parentId && (
						<span className="text-muted-foreground text-xs">Here now</span>
					)}
				</button>
				{targets.map((f) => (
					<button
						key={f.id}
						type="button"
						className={row}
						disabled={busy || f.id === item.parentId}
						onClick={() => pick(f.id)}
					>
						<KindIcon kind="folder" decorative />
						<span className="flex-1 truncate">{f.title}</span>
						{f.id === item.parentId && (
							<span className="text-muted-foreground text-xs">Here now</span>
						)}
					</button>
				))}
				{!targets.length && (
					<p className="px-2.5 py-3 text-muted-foreground text-sm">
						No folders yet. Create one with New → Folder.
					</p>
				)}
			</ModalBody>
		</Modal>
	);
}
