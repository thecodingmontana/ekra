import { useMutation, useQuery } from "@apollo/client/react";
import { ago, checkDoc, diffWords } from "@ekra/core";
import { Av } from "@ekra/ui/components/av";
import { Button } from "@ekra/ui/components/button";
import { ConfirmModal, Modal } from "@ekra/ui/components/modal";
import { Spinner } from "@ekra/ui/components/spinner";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import { useState } from "react";
import {
	CONTENT_VERSIONS,
	type ContentVersionsData,
	RESTORE_CONTENT_VERSION,
} from "@/graphql/library";

/** The body's plain text, made the way the server makes a version's, so unchanged text diffs as the same. */
function bodyText(doc: string | null) {
	if (!doc) return "";
	try {
		return checkDoc(JSON.parse(doc)).text;
	} catch {
		return "";
	}
}

/** Earlier versions of a body: what changed since each, and putting one back. */
export function VersionHistory({
	slug,
	id,
	doc,
	open,
	onOpenChange,
	onRestored,
}: {
	slug: string;
	id: string;
	/** the current body, to compare a version against */
	doc: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onRestored: () => void;
}) {
	const { data, loading } = useQuery<ContentVersionsData>(CONTENT_VERSIONS, {
		variables: { slug, id },
		skip: !open,
		fetchPolicy: "network-only",
	});
	const [restore] = useMutation(RESTORE_CONTENT_VERSION);
	const [pickedId, setPickedId] = useState<string | null>(null);
	const [confirming, setConfirming] = useState(false);
	const versions = data?.contentVersions ?? [];
	const picked = versions.find((v) => v.id === pickedId) ?? versions[0];
	const parts = picked ? diffWords(picked.bodyText, bodyText(doc)) : [];
	const same = parts.every((p) => p.op === "same");

	return (
		<>
			<Modal
				open={open}
				onOpenChange={(o) => {
					if (!o) setPickedId(null);
					onOpenChange(o);
				}}
				title="Version history"
				sub="Each version is one sitting of changes. Pick one to see what changed since."
				size="lg"
				footer={
					<>
						<span className="text-muted-foreground text-sm">
							Restoring keeps the current body in the history.
						</span>
						<Button
							className="ml-auto"
							disabled={!picked || same}
							onClick={() => setConfirming(true)}
							data-testid="restore-version"
						>
							<span
								className="icon-[solar--restart-linear] size-3.5"
								aria-hidden="true"
							/>
							Restore this version
						</Button>
					</>
				}
			>
				<div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden px-4 py-3.5 sm:h-[60vh] sm:grid-cols-[220px_minmax(0,1fr)] sm:grid-rows-1">
					{loading && !data ? (
						<div className="col-span-full grid place-items-center py-10">
							<Spinner />
						</div>
					) : versions.length === 0 ? (
						<p className="col-span-full m-0 py-10 text-center text-muted-foreground">
							No versions yet. One is kept each time the page is saved.
						</p>
					) : (
						<>
							<ul
								className="m-0 flex max-h-[30vh] list-none flex-col gap-0.5 overflow-y-auto p-0 sm:max-h-none"
								aria-label="Versions"
							>
								{versions.map((v, i) => (
									<li key={v.id}>
										<button
											type="button"
											aria-current={v.id === picked?.id}
											onClick={() => setPickedId(v.id)}
											className={cn(
												"flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left transition-colors hover:bg-muted",
												v.id === picked?.id && "bg-muted",
											)}
											data-testid="version"
										>
											<Av
												name={v.author?.name ?? "Someone"}
												image={v.author?.image}
												size="md"
											/>
											<span className="flex min-w-0 flex-col">
												<span className="truncate font-medium text-sm">
													{v.author?.name ?? "Someone"}
												</span>
												<span
													className="text-muted-foreground text-xs"
													suppressHydrationWarning
												>
													{ago(v.updatedAt)}
													{i === 0 && " · latest"}
												</span>
											</span>
										</button>
									</li>
								))}
							</ul>
							<div
								className="min-h-0 overflow-y-auto whitespace-pre-wrap break-words rounded-[10px] border bg-card px-3.5 py-3 text-[14px] leading-[1.65]"
								data-testid="version-diff"
							>
								{same ? (
									<p className="m-0 text-muted-foreground">
										Nothing changed since this version.
									</p>
								) : (
									parts.map((p, i) =>
										p.op === "same" ? (
											// biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
											<span key={i}>{p.text}</span>
										) : p.op === "del" ? (
											<del
												// biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
												key={i}
												className="rounded-[3px] bg-tint-red/13 text-tint-red"
											>
												{p.text}
											</del>
										) : (
											<ins
												// biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
												key={i}
												className="rounded-[3px] bg-tint-green/13 text-tint-green no-underline"
											>
												{p.text}
											</ins>
										),
									)
								)}
							</div>
						</>
					)}
				</div>
			</Modal>
			<ConfirmModal
				open={confirming}
				onOpenChange={setConfirming}
				title="Restore this version?"
				body={
					picked &&
					`The page goes back to how ${picked.author?.name ?? "someone"} left it ${ago(picked.updatedAt)}. The current body stays in the history, so you can switch back.`
				}
				ok="Restore"
				icon="icon-[solar--restart-linear]"
				onConfirm={async () => {
					if (!picked) return;
					try {
						await restore({
							variables: { slug, id, versionId: picked.id },
						});
					} catch (error) {
						toast.error("Couldn't restore that version", {
							desc: (error as Error).message,
						});
						throw error;
					}
					toast.success("Version restored");
					setPickedId(null);
					onOpenChange(false);
					onRestored();
				}}
			/>
		</>
	);
}
