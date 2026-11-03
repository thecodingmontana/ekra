import { useQuery } from "@apollo/client/react";
import { Button } from "@ekra/ui/components/button";
import { InputWithIcon } from "@ekra/ui/components/input-with-icon";
import { Modal, ModalBody } from "@ekra/ui/components/modal";
import { cn } from "@ekra/ui/lib/utils";
import { useState } from "react";
import { KindIcon, StatusPill } from "@/components/library/bits";
import {
	type ContentItem,
	type ContentKind,
	LIBRARY,
	type LibraryData,
} from "@/graphql/library";
import { KINDS } from "@/lib/content-kinds";
import { pickable, STEP_KINDS } from "@/lib/path-outline";

/**
 * Picks library items of the given kinds: search, and filter by kind when there are several. It stays open so
 * several can be added (the caller closes it to take one); excluded items, such as those already added, aren't listed.
 */
export function LibraryPicker({
	slug,
	open,
	onOpenChange,
	onPick,
	kinds = STEP_KINDS,
	excludeIds = new Set(),
	title,
	sub,
	empty,
}: {
	slug: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onPick: (item: ContentItem) => Promise<unknown>;
	kinds?: readonly ContentKind[];
	excludeIds?: ReadonlySet<string>;
	title: string;
	sub: string;
	/** shown when the library has nothing left to pick */
	empty: string;
}) {
	const { data } = useQuery<LibraryData>(LIBRARY, {
		variables: { slug, archived: false },
		skip: !open,
	});
	const [kind, setKind] = useState<ContentKind | "all">("all");
	const [q, setQ] = useState("");
	const [adding, setAdding] = useState<string | null>(null);
	const items = pickable(data?.library.items ?? [], excludeIds, kinds, kind, q);

	const pick = async (item: ContentItem) => {
		setAdding(item.id);
		await onPick(item);
		setAdding(null);
	};

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={title}
			sub={sub}
			footer={<Button onClick={() => onOpenChange(false)}>Done</Button>}
		>
			<ModalBody className="flex flex-col gap-3 pb-4">
				<InputWithIcon
					icon="icon-[solar--magnifer-linear]"
					placeholder="Search the library"
					aria-label="Search the library"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					data-testid="picker-search"
				/>
				{kinds.length > 1 && (
					<div className="flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5 text-sm">
						{(["all", ...kinds] as const).map((k) => (
							<button
								key={k}
								type="button"
								aria-pressed={kind === k}
								onClick={() => setKind(k)}
								className={cn(
									"inline-flex h-7 shrink-0 items-center rounded-md px-2.5 font-medium transition-colors",
									kind === k
										? "bg-background text-foreground shadow-xs"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{k === "all" ? "All" : KINDS[k].plural}
							</button>
						))}
					</div>
				)}
				{data && items.length === 0 && (
					<p className="m-0 py-6 text-center text-muted-foreground text-sm">
						{q.trim() || kind !== "all"
							? `Nothing matches. Try another search${kinds.length > 1 ? " or kind" : ""}.`
							: empty}
					</p>
				)}
				<ul className="m-0 flex max-h-[360px] list-none flex-col gap-1 overflow-y-auto p-0">
					{items.map((item) => (
						<li key={item.id}>
							<button
								type="button"
								disabled={adding !== null}
								className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted disabled:opacity-60"
								onClick={() => void pick(item)}
								data-testid="pick-content"
							>
								<KindIcon kind={item.kind} decorative />
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="truncate font-medium">{item.title}</span>
									<span className="text-muted-foreground text-xs">
										{KINDS[item.kind].label}
									</span>
								</span>
								<StatusPill item={item} />
								<span
									className={cn(
										adding === item.id
											? "icon-[solar--refresh-linear] animate-spin"
											: "icon-[solar--add-circle-linear]",
										"size-4 shrink-0 text-muted-foreground",
									)}
									aria-hidden="true"
								/>
							</button>
						</li>
					))}
				</ul>
			</ModalBody>
		</Modal>
	);
}
