import { CombinedGraphQLErrors } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { isYoutubeSrc } from "@ekra/core";
import { Button } from "@ekra/ui/components/button";
import { Input } from "@ekra/ui/components/input";
import { Modal, ModalBody } from "@ekra/ui/components/modal";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import FileHandler from "@tiptap/extension-file-handler";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import {
	type Editor,
	EditorContent,
	useEditor,
	useEditorState,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEffect, useRef, useState } from "react";
import {
	type ContentDetail,
	SAVE_CONTENT_BODY,
	type SaveContentBodyData,
} from "@/graphql/library";
import { PICTURE_TYPES, uploadPicture } from "@/lib/upload";
import { bodyExtensions, parseDoc } from "./extensions";
import { INSERT_EVENT, type InsertKind, SlashCommands } from "./slash-menu";
import "./editor.css";

// The body of a piece of content, for the people who make it. Changes save on their own a moment
// after you stop typing; a newer save by someone else is never overwritten.

const SAVE_MS = 800;
type Status = "saved" | "saving" | "conflict" | "error";

function useAutosave(slug: string, item: ContentDetail) {
	const [save] = useMutation<SaveContentBodyData>(SAVE_CONTENT_BODY);
	const pending = useRef<string | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const base = useRef(item.bodyUpdatedAt);
	// one save at a time, in order, so a slow save can't land after a newer one
	const inflight = useRef<Promise<void>>(Promise.resolve());
	const [status, setStatus] = useState<Status>("saved");

	const send = async () => {
		const doc = pending.current;
		if (doc === null) return;
		pending.current = null;
		setStatus("saving");
		try {
			const { data } = await save({
				variables: {
					slug,
					id: item.id,
					doc,
					baseBodyUpdatedAt: base.current,
				},
				// the cached body follows the save, so reopening the page starts from it
				update: (cache) =>
					cache.modify({
						id: cache.identify({ __typename: "ContentItem", id: item.id }),
						fields: { doc: () => doc },
					}),
			});
			if (data) base.current = data.saveContentBody.bodyUpdatedAt;
			setStatus(pending.current === null ? "saved" : "saving");
		} catch (error) {
			const code = CombinedGraphQLErrors.is(error)
				? error.errors[0]?.extensions?.code
				: undefined;
			if (code === "CONFLICT") return setStatus("conflict");
			setStatus("error");
			// keep the edits; the next change (or leaving the page) sends them again
			pending.current ??= doc;
			toast.error("Couldn't save the page", {
				desc: (error as Error).message,
			});
		}
	};
	const flush = () => {
		clearTimeout(timer.current);
		inflight.current = inflight.current.then(send);
		return inflight.current;
	};
	const queue = (doc: string) => {
		pending.current = doc;
		setStatus("saving");
		clearTimeout(timer.current);
		timer.current = setTimeout(() => void flush(), SAVE_MS);
	};
	// leaving the page, or closing the tab, saves what's waiting
	// biome-ignore lint/correctness/useExhaustiveDependencies: register once; flush reads refs
	useEffect(() => {
		const onHide = () => void flush();
		window.addEventListener("pagehide", onHide);
		return () => {
			window.removeEventListener("pagehide", onHide);
			void flush();
		};
	}, []);
	return { queue, status };
}

function addImage(editor: Editor, slug: string, file: File, at: number) {
	void toast
		.promise(uploadPicture(slug, file), {
			loading: "Uploading image…",
			success: "Image added",
			error: "Couldn't add the image",
		})
		.then(({ src, width, height }) =>
			editor
				.chain()
				.focus()
				.insertContentAt(Math.min(at, editor.state.doc.content.size), {
					type: "image",
					attrs: { src, width, height },
				})
				.run(),
		)
		.catch(() => {});
}

const isImage = (file: File) => PICTURE_TYPES.split(",").includes(file.type);

export function BodyEditor({
	slug,
	item,
}: {
	slug: string;
	item: ContentDetail;
}) {
	const { queue, status } = useAutosave(slug, item);
	const editable = status !== "conflict";
	const [youtube, setYoutube] = useState(false);
	const editor = useEditor({
		immediatelyRender: false,
		content: parseDoc(item.doc),
		extensions: [
			...bodyExtensions(true),
			Placeholder.configure({
				placeholder: "Write something, or type / for blocks",
			}),
			SlashCommands,
			CharacterCount,
			// pictures pasted or dropped onto the page upload into it
			FileHandler.configure({
				onPaste: (ed, files, html) => {
					// pasted web content brings its own images
					if (html) return;
					for (const file of files.filter(isImage))
						addImage(ed, slug, file, ed.state.selection.anchor);
				},
				onDrop: (ed, files, pos) => {
					for (const file of files.filter(isImage))
						addImage(ed, slug, file, pos);
				},
			}),
		],
		// only real changes save (switching editing on or off also counts as an "update")
		onUpdate: ({ editor: ed, transaction }) => {
			if (transaction.docChanged) queue(JSON.stringify(ed.getJSON()));
		},
	});
	useEffect(() => {
		// false: don't announce it as an edit, or opening a page would save it
		editor?.setEditable(editable, false);
	}, [editor, editable]);
	// the Image and YouTube blocks from the "/" menu
	useEffect(() => {
		if (!editor) return;
		const insert = (e: Event) => {
			const kind = (e as CustomEvent<InsertKind>).detail;
			if (kind === "youtube") return setYoutube(true);
			const input = document.createElement("input");
			input.type = "file";
			input.accept = PICTURE_TYPES;
			input.onchange = () => {
				const file = input.files?.[0];
				if (file) addImage(editor, slug, file, editor.state.selection.anchor);
			};
			input.click();
		};
		window.addEventListener(INSERT_EVENT, insert);
		return () => window.removeEventListener(INSERT_EVENT, insert);
	}, [editor, slug]);
	const words =
		useEditorState({
			editor,
			selector: ({ editor: e }) =>
				(e?.storage.characterCount?.words() as number | undefined) ?? 0,
		}) ?? 0;

	return (
		<div className="ekra-doc" data-testid="body-editor">
			{status === "conflict" && (
				<div
					className="mb-4 flex flex-wrap items-center gap-2.5 rounded-[10px] border border-tint-amber/30 bg-tint-amber/8 px-3 py-2.5 text-sm"
					role="alert"
				>
					<span
						className="icon-[solar--danger-triangle-linear] size-4 text-tint-amber"
						aria-hidden="true"
					/>
					<span className="flex-1">
						Someone else changed this page. Reload to see their version; your
						last changes weren't saved.
					</span>
					<Button
						size="sm"
						variant="outline"
						onClick={() => window.location.reload()}
					>
						Reload
					</Button>
				</div>
			)}
			{editor && editable && <SelectionMenu editor={editor} />}
			{editor && editable && <BlockToolbar editor={editor} />}
			{/* the editor starts just after the page renders; hold its place meanwhile */}
			{!editor && (
				<div className="flex flex-col gap-3 pt-1.5" aria-busy="true">
					<span className="sr-only">Loading page</span>
					{[94, 100, 82, 0, 68, 90, 56].map((w, i) =>
						w ? (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder lines
								key={i}
								className="block h-[13px] animate-pulse rounded bg-muted"
								style={{ width: `${w}%` }}
							/>
						) : (
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder lines
							<span key={i} className="h-2" />
						),
					)}
				</div>
			)}
			<EditorContent editor={editor} />
			{editor && (
				<p
					className="mt-6 text-muted-foreground/80 text-xs"
					data-testid="body-status"
				>
					{words > 0 &&
						`${words} ${words === 1 ? "word" : "words"} · ${Math.max(1, Math.round(words / 230))} min read · `}
					{status === "saving"
						? "Saving…"
						: status === "error"
							? "Not saved"
							: status === "conflict"
								? "Not saved"
								: "Saved"}
				</p>
			)}
			{editor && (
				<YoutubeModal
					open={youtube}
					onOpenChange={setYoutube}
					onAdd={(src) => editor.chain().focus().setYoutubeVideo({ src }).run()}
				/>
			)}
		</div>
	);
}

function YoutubeModal({
	open,
	onOpenChange,
	onAdd,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAdd: (src: string) => void;
}) {
	const [url, setUrl] = useState("");
	const valid = isYoutubeSrc(url.trim());
	return (
		<Modal
			open={open}
			onOpenChange={(o) => {
				if (!o) setUrl("");
				onOpenChange(o);
			}}
			title="Embed a YouTube video"
			size="sm"
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (!valid) return;
					onAdd(url.trim());
					setUrl("");
					onOpenChange(false);
				}}
			>
				<ModalBody>
					<Input
						autoFocus
						aria-label="YouTube address"
						placeholder="https://www.youtube.com/watch?v=…"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						aria-invalid={url.trim() !== "" && !valid}
					/>
					{url.trim() !== "" && !valid && (
						<p className="m-0 text-destructive text-sm">
							Paste a youtube.com or youtu.be address.
						</p>
					)}
				</ModalBody>
				<div className="flex justify-end gap-2 border-t px-4 py-3">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button type="submit" disabled={!valid}>
						Embed video
					</Button>
				</div>
			</form>
		</Modal>
	);
}

/** One toolbar button that keeps the editor's selection while you press it. */
function ToolButton({
	label,
	icon,
	on = false,
	onClick,
}: {
	label: string;
	icon: string;
	on?: boolean;
	onClick: () => void;
}) {
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label={label}
			aria-pressed={on}
			title={label}
			className={cn(
				"text-muted-foreground",
				on && "bg-muted text-foreground hover:bg-muted",
			)}
			onMouseDown={(e) => e.preventDefault()}
			onClick={onClick}
		>
			<span className={cn(icon, "size-4")} aria-hidden="true" />
		</Button>
	);
}

const Sep = () => <span className="mx-[3px] h-[18px] w-px bg-border" />;

/** The toolbar over selected text: headings, bold/italic/underline/strike/code, highlight, link. */
function SelectionMenu({ editor }: { editor: Editor }) {
	const [linking, setLinking] = useState(false);
	const [href, setHref] = useState("");
	const on = useEditorState({
		editor,
		selector: ({ editor: e }) => ({
			bold: e.isActive("bold"),
			italic: e.isActive("italic"),
			underline: e.isActive("underline"),
			strike: e.isActive("strike"),
			code: e.isActive("code"),
			highlight: e.isActive("highlight"),
			link: e.isActive("link"),
			h1: e.isActive("heading", { level: 1 }),
			h2: e.isActive("heading", { level: 2 }),
			h3: e.isActive("heading", { level: 3 }),
		}),
	});
	const chain = () => editor.chain().focus();

	return (
		<BubbleMenu
			editor={editor}
			options={{ placement: "top" }}
			className="ekra-bubble"
			// selected text only: a picked image or video gets the block toolbar instead
			shouldShow={({ editor: e, view, state }) =>
				e.isEditable &&
				view.hasFocus() &&
				!state.selection.empty &&
				!(state.selection instanceof NodeSelection)
			}
		>
			{linking ? (
				<form
					className="flex items-center gap-1"
					onSubmit={(e) => {
						e.preventDefault();
						const url = href.trim();
						if (!url) chain().unsetLink().run();
						else
							chain()
								.extendMarkRange("link")
								.setLink({
									href: /^(https?:|mailto:)/i.test(url)
										? url
										: `https://${url}`,
								})
								.run();
						setLinking(false);
					}}
				>
					<Input
						className="h-[26px] w-[220px]"
						placeholder="Paste a link"
						aria-label="Link address"
						value={href}
						autoFocus
						onChange={(e) => setHref(e.target.value)}
						onKeyDown={(e) => e.key === "Escape" && setLinking(false)}
					/>
					<Button type="submit" size="sm">
						Link
					</Button>
				</form>
			) : (
				<>
					<ToolButton
						label="Heading 1"
						icon="icon-[hugeicons--heading-01]"
						on={on.h1}
						onClick={() => chain().toggleHeading({ level: 1 }).run()}
					/>
					<ToolButton
						label="Heading 2"
						icon="icon-[hugeicons--heading-02]"
						on={on.h2}
						onClick={() => chain().toggleHeading({ level: 2 }).run()}
					/>
					<ToolButton
						label="Heading 3"
						icon="icon-[hugeicons--heading-03]"
						on={on.h3}
						onClick={() => chain().toggleHeading({ level: 3 }).run()}
					/>
					<Sep />
					<ToolButton
						label="Bold"
						icon="icon-[solar--text-bold-linear]"
						on={on.bold}
						onClick={() => chain().toggleBold().run()}
					/>
					<ToolButton
						label="Italic"
						icon="icon-[solar--text-italic-linear]"
						on={on.italic}
						onClick={() => chain().toggleItalic().run()}
					/>
					<ToolButton
						label="Underline"
						icon="icon-[solar--text-underline-linear]"
						on={on.underline}
						onClick={() => chain().toggleUnderline().run()}
					/>
					<ToolButton
						label="Strikethrough"
						icon="icon-[solar--text-cross-linear]"
						on={on.strike}
						onClick={() => chain().toggleStrike().run()}
					/>
					<ToolButton
						label="Code"
						icon="icon-[solar--code-linear]"
						on={on.code}
						onClick={() => chain().toggleCode().run()}
					/>
					<ToolButton
						label="Highlight"
						icon="icon-[hugeicons--highlighter]"
						on={on.highlight}
						onClick={() => chain().toggleHighlight().run()}
					/>
					<ToolButton
						label="Link"
						icon="icon-[solar--link-linear]"
						on={on.link}
						onClick={() => {
							setHref(editor.getAttributes("link").href ?? "");
							setLinking(true);
						}}
					/>
				</>
			)}
		</BubbleMenu>
	);
}

/** The picked top-level block (an image, a video, a divider), if any. */
function picked(editor: Editor) {
	const { selection } = editor.state;
	return selection instanceof NodeSelection && selection.$from.depth === 0
		? { pos: selection.from, node: selection.node }
		: null;
}

/** Swaps a top-level block with the one above (-1) or below (1), keeping your place in it. */
function moveBlock(editor: Editor, pos: number, dir: -1 | 1) {
	const { doc, selection } = editor.state;
	let offset = 0;
	let index = -1;
	for (let i = 0; i < doc.childCount; i++) {
		if (offset === pos) index = i;
		offset += doc.child(i).nodeSize;
	}
	const node = doc.maybeChild(index);
	const other = doc.maybeChild(index + dir);
	if (!node || !other) return;
	const from = dir < 0 ? pos - other.nodeSize : pos;
	const to = from + node.nodeSize + other.nodeSize;
	const tr = editor.state.tr.replaceWith(
		from,
		to,
		dir < 0 ? [node, other] : [other, node],
	);
	const moved = dir < 0 ? from : from + other.nodeSize;
	if (selection instanceof NodeSelection && selection.from === pos)
		tr.setSelection(NodeSelection.create(tr.doc, moved));
	else if (selection.from > pos && selection.from < pos + node.nodeSize)
		tr.setSelection(
			TextSelection.create(tr.doc, moved + (selection.from - pos)),
		);
	editor.view.dispatch(tr.scrollIntoView());
}

/** A small toolbar over a picked block: move it up or down, or delete it. */
function BlockToolbar({ editor }: { editor: Editor }) {
	const block = useEditorState({
		editor,
		selector: ({ editor: e }) => {
			const b = picked(e);
			return b
				? {
						pos: b.pos,
						first: b.pos === 0,
						last: b.pos + b.node.nodeSize === e.state.doc.content.size,
					}
				: null;
		},
	});
	return (
		<BubbleMenu
			editor={editor}
			pluginKey="blockToolbar"
			className="ekra-bubble"
			shouldShow={({ editor: e, view }) =>
				e.isEditable && view.hasFocus() && !!picked(e)
			}
			getReferencedVirtualElement={() => {
				const b = picked(editor);
				const el = b && editor.view.nodeDOM(b.pos);
				return el instanceof HTMLElement
					? { getBoundingClientRect: () => el.getBoundingClientRect() }
					: null;
			}}
			options={{ placement: "top-end", offset: 6 }}
		>
			{block && !block.first && (
				<ToolButton
					label="Move up"
					icon="icon-[solar--arrow-up-linear]"
					onClick={() => moveBlock(editor, block.pos, -1)}
				/>
			)}
			{block && !block.last && (
				<ToolButton
					label="Move down"
					icon="icon-[solar--arrow-down-linear]"
					onClick={() => moveBlock(editor, block.pos, 1)}
				/>
			)}
			<ToolButton
				label="Delete"
				icon="icon-[solar--trash-bin-trash-linear]"
				onClick={() => editor.chain().focus().deleteSelection().run()}
			/>
		</BubbleMenu>
	);
}
