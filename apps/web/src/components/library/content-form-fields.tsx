import { useQuery } from "@apollo/client/react";
import { Button } from "@ekra/ui/components/button";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import { type KeyboardEvent, useRef, useState } from "react";
import { LIBRARY, type LibraryData } from "@/graphql/library";
import { libraryTags } from "@/lib/library-filter";
import { atLeast, PICTURE_TYPES, uploadPicture } from "@/lib/upload";

/** The server's limits for categories. */
const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 30;
/** Card covers show about 320px wide; twice that stays sharp on dense screens. */
const COVER_WIDTH = 640;

/** Categories: type one and press Enter to add a chip; suggestions come from the rest of the library. */
export function TagInput({
	slug,
	value,
	onChange,
}: {
	slug: string;
	value: string[];
	onChange: (tags: string[]) => void;
}) {
	const [text, setText] = useState("");
	const { data } = useQuery<LibraryData>(LIBRARY, {
		variables: { slug, archived: false },
		fetchPolicy: "cache-first",
	});
	const chosen = new Set(value.map((t) => t.toLowerCase()));
	const full = value.length >= MAX_TAGS;
	const needle = text.trim().toLowerCase();
	const suggestions = libraryTags(data?.library.items ?? [])
		.filter(
			(t) => !chosen.has(t.toLowerCase()) && t.toLowerCase().includes(needle),
		)
		.slice(0, 6);

	function add(raw: string) {
		const tag = raw.trim().slice(0, MAX_TAG_LENGTH);
		setText("");
		if (!tag || full || chosen.has(tag.toLowerCase())) return;
		onChange([...value, tag]);
	}

	function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter" || e.key === ",") {
			e.preventDefault();
			add(text);
		} else if (e.key === "Backspace" && !text && value.length)
			onChange(value.slice(0, -1));
	}

	return (
		<div className="flex flex-col gap-1.5">
			<label className="font-medium text-sm" htmlFor="c-tags">
				Categories{" "}
				<span className="font-normal text-muted-foreground">
					(up to {MAX_TAGS})
				</span>
			</label>
			<div className="flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-input px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
				{value.map((t) => (
					<span
						key={t}
						className="inline-flex h-[22px] items-center gap-1 rounded-[5px] bg-muted pr-0.5 pl-1.5 text-xs"
						data-testid="tag-chip"
					>
						{t}
						<button
							type="button"
							aria-label={`Remove ${t}`}
							onClick={() => onChange(value.filter((x) => x !== t))}
							className="grid size-4 place-items-center rounded-[4px] text-muted-foreground hover:bg-background hover:text-foreground"
						>
							<span
								className="icon-[hugeicons--cancel-01] size-3"
								aria-hidden="true"
							/>
						</button>
					</span>
				))}
				<input
					id="c-tags"
					className="h-[22px] min-w-[120px] flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={onKeyDown}
					onBlur={() => add(text)}
					maxLength={MAX_TAG_LENGTH}
					disabled={full}
					placeholder={
						full ? "That's the most" : "Type a category, press Enter"
					}
					data-testid="tag-input"
				/>
			</div>
			{!full && suggestions.length > 0 && (
				<div className="flex flex-wrap items-center gap-1">
					{suggestions.map((t) => (
						<button
							key={t}
							type="button"
							// keeps the input's blur from adding half-typed text first
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => add(t)}
							className="inline-flex h-[22px] items-center gap-1 rounded-[5px] border border-dashed px-1.5 text-muted-foreground text-xs transition-colors hover:border-solid hover:text-foreground"
						>
							<span
								className="icon-[hugeicons--plus-sign] size-2.5"
								aria-hidden="true"
							/>
							{t}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

/** A cover picture for cards: upload, preview, remove. */
export function CoverPicker({
	slug,
	value,
	onChange,
	onBusy,
}: {
	slug: string;
	value: string | null;
	onChange: (cover: string | null) => void;
	onBusy: (busy: boolean) => void;
}) {
	const fileRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);

	async function upload(file: File) {
		setUploading(true);
		onBusy(true);
		try {
			onChange(atLeast(await uploadPicture(slug, file), COVER_WIDTH));
		} catch (error) {
			toast.error("Couldn't upload that picture", {
				desc: (error as Error).message,
			});
		} finally {
			setUploading(false);
			onBusy(false);
			if (fileRef.current) fileRef.current.value = "";
		}
	}

	return (
		<div className="flex flex-col gap-1.5">
			<span className="font-medium text-sm">
				Cover{" "}
				<span className="font-normal text-muted-foreground">(optional)</span>
			</span>
			<div className="flex items-center gap-3">
				<div
					className={cn(
						"grid h-[60px] w-[108px] shrink-0 place-items-center overflow-hidden rounded-[7px] border bg-muted",
						uploading && "animate-pulse",
					)}
				>
					{value ? (
						<img
							src={value}
							alt="Cover"
							className="size-full object-cover"
							data-testid="cover-preview"
						/>
					) : (
						<span
							className="icon-[solar--gallery-add-linear] size-5 text-muted-foreground"
							aria-hidden="true"
						/>
					)}
				</div>
				<div className="flex flex-wrap gap-1.5">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={uploading}
						onClick={() => fileRef.current?.click()}
						data-testid="cover-upload"
					>
						{uploading ? "Uploading…" : value ? "Replace" : "Upload picture"}
					</Button>
					{value && !uploading && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => onChange(null)}
							data-testid="cover-remove"
						>
							Remove
						</Button>
					)}
				</div>
				<input
					ref={fileRef}
					type="file"
					accept={PICTURE_TYPES}
					className="hidden"
					data-testid="cover-file"
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file) void upload(file);
					}}
				/>
			</div>
		</div>
	);
}
