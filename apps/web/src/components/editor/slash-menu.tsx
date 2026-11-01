import { cn } from "@ekra/ui/lib/utils";
import { type ChainedCommands, Extension, ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import {
	type ForwardedRef,
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";

// The "/" menu: type / in the body to pick a block, filter by typing, then Enter or click.
// The typed "/query" is removed before the block is applied.

/** Blocks that need something from outside the editor (a file, an address) ask the page for it. */
export const INSERT_EVENT = "ekra-editor-insert";
export type InsertKind = "image" | "youtube";
const requestInsert = (kind: InsertKind) =>
	window.dispatchEvent(new CustomEvent(INSERT_EVENT, { detail: kind }));

type Command = {
	/** section in the menu; Basic blocks when left out */
	group?: "Media" | "Advanced";
	title: string;
	hint: string;
	icon: string;
	/** the markdown shortcut that does the same, shown on the right */
	keys?: string;
	/** other words people type for it */
	alias?: string;
	run: (chain: ChainedCommands) => ChainedCommands;
};

export const SLASH_COMMANDS: Command[] = [
	{
		title: "Text",
		alias: "paragraph plain",
		hint: "Plain writing",
		icon: "icon-[hugeicons--text]",
		run: (c) => c.setParagraph(),
	},
	{
		title: "Heading 1",
		alias: "h1 title",
		hint: "Big section heading",
		icon: "icon-[hugeicons--heading-01]",
		keys: "#",
		run: (c) => c.setHeading({ level: 1 }),
	},
	{
		title: "Heading 2",
		alias: "h2 subtitle",
		hint: "Medium section heading",
		icon: "icon-[hugeicons--heading-02]",
		keys: "##",
		run: (c) => c.setHeading({ level: 2 }),
	},
	{
		title: "Heading 3",
		alias: "h3",
		hint: "Small section heading",
		icon: "icon-[hugeicons--heading-03]",
		keys: "###",
		run: (c) => c.setHeading({ level: 3 }),
	},
	{
		title: "Bulleted list",
		alias: "bullet ul unordered",
		hint: "A simple list",
		icon: "icon-[hugeicons--left-to-right-list-bullet]",
		keys: "-",
		run: (c) => c.toggleBulletList(),
	},
	{
		title: "Numbered list",
		alias: "ordered ol number",
		hint: "A list with numbers",
		icon: "icon-[hugeicons--left-to-right-list-number]",
		keys: "1.",
		run: (c) => c.toggleOrderedList(),
	},
	{
		title: "To-do list",
		alias: "todo task checkbox check",
		hint: "Track tasks with checkboxes",
		icon: "icon-[hugeicons--checkmark-square-02]",
		keys: "[]",
		run: (c) => c.toggleTaskList(),
	},
	{
		title: "Quote",
		alias: "blockquote",
		hint: "Call out a quote",
		icon: "icon-[hugeicons--quote-down]",
		keys: '"',
		run: (c) => c.toggleBlockquote(),
	},
	{
		title: "Code",
		alias: "codeblock snippet",
		hint: "A block of code",
		icon: "icon-[hugeicons--source-code]",
		keys: "```",
		run: (c) => c.toggleCodeBlock(),
	},
	{
		title: "Divider",
		alias: "line hr separator rule",
		hint: "Separate sections",
		icon: "icon-[hugeicons--solid-line-01]",
		keys: "---",
		run: (c) => c.setHorizontalRule(),
	},
	{
		group: "Media",
		title: "Image",
		alias: "picture photo upload",
		hint: "Upload an image",
		icon: "icon-[hugeicons--image-01]",
		run: (c) => {
			requestInsert("image");
			return c;
		},
	},
	{
		group: "Media",
		title: "YouTube",
		alias: "video",
		hint: "Embed a YouTube video",
		icon: "icon-[hugeicons--youtube]",
		run: (c) => {
			requestInsert("youtube");
			return c;
		},
	},
	{
		group: "Advanced",
		title: "Table",
		alias: "grid rows columns",
		hint: "A simple table",
		icon: "icon-[hugeicons--table-01]",
		run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
	},
	{
		group: "Advanced",
		title: "Callout",
		alias: "note tip info warning",
		hint: "Make writing stand out",
		icon: "icon-[hugeicons--bulb]",
		run: (c) => c.setNode("callout"),
	},
	{
		group: "Advanced",
		title: "Toggle list",
		alias: "toggle details collapse accordion",
		hint: "Hide content inside",
		icon: "icon-[hugeicons--arrow-right-01]",
		run: (c) => c.setDetails(),
	},
];

/** Commands whose name starts with the typed text first, then ones that contain it. */
export function filterCommands(query: string) {
	const q = query.trim().toLowerCase();
	if (!q) return SLASH_COMMANDS;
	const starts = SLASH_COMMANDS.filter((c) =>
		c.title.toLowerCase().startsWith(q),
	);
	const has = SLASH_COMMANDS.filter(
		(c) =>
			!starts.includes(c) &&
			`${c.title} ${c.hint} ${c.alias ?? ""}`.toLowerCase().includes(q),
	);
	return [...starts, ...has];
}

type ListHandle = { onKeyDown: (event: KeyboardEvent) => boolean };
type ListProps = SuggestionProps<Command, Command>;

/** Arrow keys, Enter and Tab for the list; `list` holds rows marked data-i. */
function useListNav<T>(
	items: T[],
	command: (item: T) => void,
	ref: ForwardedRef<ListHandle>,
) {
	const [index, setIndex] = useState(0);
	const list = useRef<HTMLDivElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: back to the top whenever the filter changes
	useEffect(() => setIndex(0), [items]);
	useEffect(() => {
		list.current
			?.querySelector(`[data-i="${index}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [index]);
	useImperativeHandle(ref, () => ({
		onKeyDown: (event) => {
			if (!items.length) return false;
			if (event.key === "ArrowDown") {
				setIndex((i) => (i + 1) % items.length);
				return true;
			}
			if (event.key === "ArrowUp") {
				setIndex((i) => (i - 1 + items.length) % items.length);
				return true;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				const item = items[index];
				if (item) command(item);
				return true;
			}
			return false;
		},
	}));
	return { index, setIndex, list };
}

const SlashList = forwardRef<ListHandle, ListProps>(function SlashList(
	{ items, command },
	ref,
) {
	const { index, setIndex, list } = useListNav(items, command, ref);

	return (
		<div
			className="flex w-[290px] flex-col overflow-hidden rounded-[10px] bg-popover text-base text-popover-foreground shadow-[0_12px_32px_-8px_rgba(28,25,20,0.16),0_2px_6px_-2px_rgba(28,25,20,0.06),0_0_0_1px_var(--border)] dark:shadow-[0_16px_40px_-10px_rgba(0,0,0,0.6),0_0_0_1px_var(--border)]"
			role="listbox"
			aria-label="Blocks"
			data-testid="slash-menu"
		>
			<div
				className="max-h-[calc(var(--slash-max,340px)-37px)] overflow-y-auto p-1"
				ref={list}
			>
				{items.length ? (
					items.map((item, i) => [
						(i === 0 || items[i - 1]?.group !== item.group) && (
							<div
								key={`h-${item.group ?? "basic"}`}
								className="px-2 pt-2 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.06em]"
							>
								{item.group ?? "Basic blocks"}
							</div>
						),
						<button
							key={item.title}
							type="button"
							role="option"
							aria-selected={i === index}
							data-i={i}
							title={item.hint}
							className={cn(
								"flex min-h-[30px] w-full items-center gap-[9px] whitespace-nowrap rounded-[6px] px-2 text-left",
								i === index && "bg-muted",
							)}
							onMouseEnter={() => setIndex(i)}
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => command(item)}
						>
							<span
								className={cn(
									item.icon,
									"size-4 shrink-0 text-muted-foreground",
								)}
								aria-hidden="true"
							/>
							<span className="min-w-0 grow truncate">{item.title}</span>
							{item.keys && (
								<span className="font-mono text-[11px] text-muted-foreground">
									{item.keys}
								</span>
							)}
						</button>,
					])
				) : (
					<div className="px-2.5 py-2 text-muted-foreground">
						No matching blocks
					</div>
				)}
			</div>
			<div className="flex items-center gap-2 border-t px-3 py-2 text-muted-foreground text-sm">
				<span className="grow">Close menu</span>
				<span className="font-mono text-[11px]">esc</span>
			</div>
		</div>
	);
});

const GAP = 6;
const EDGE = 8;

/**
 * Sits the menu under the cursor, or above it when there's more room there, and caps its
 * height to the space available. Runs after the menu has drawn, so it knows its own size.
 */
function place(
	el: HTMLElement,
	rect: (() => DOMRect | null) | null | undefined,
) {
	requestAnimationFrame(() => {
		const box = rect?.();
		if (!box) return;
		const below = window.innerHeight - box.bottom - GAP - EDGE;
		const above = box.top - GAP - EDGE;
		const up = below < Math.min(el.offsetHeight, 240) && above > below;
		const max = Math.max(160, Math.min(380, up ? above : below));
		el.style.setProperty("--slash-max", `${max}px`);
		const height = Math.min(el.offsetHeight, max);
		const left = Math.max(
			EDGE,
			Math.min(box.left, window.innerWidth - el.offsetWidth - EDGE),
		);
		Object.assign(el.style, {
			left: `${left}px`,
			top: `${up ? box.top - GAP - height : box.bottom + GAP}px`,
		});
	});
}

export const SlashCommands = Extension.create({
	name: "slashCommands",
	addProseMirrorPlugins() {
		return [
			Suggestion<Command, Command>({
				editor: this.editor,
				char: "/",
				// not inside code, where "/" is just a character
				allow: ({ editor }) => !editor.isActive("codeBlock"),
				items: ({ query }) => filterCommands(query),
				command: ({ editor, range, props }) => {
					props.run(editor.chain().focus().deleteRange(range)).run();
				},
				render: () => {
					let menu: ReactRenderer<ListHandle, ListProps> | undefined;
					const close = () => {
						menu?.destroy();
						menu?.element.remove();
						menu = undefined;
					};
					return {
						onStart: (props) => {
							menu = new ReactRenderer(SlashList, {
								props,
								editor: props.editor,
							});
							Object.assign((menu.element as HTMLElement).style, {
								position: "fixed",
								top: "0",
								left: "0",
								zIndex: "80",
							});
							document.body.appendChild(menu.element);
							place(menu.element as HTMLElement, props.clientRect);
						},
						onUpdate: (props) => {
							if (!menu) return;
							menu.updateProps(props);
							place(menu.element as HTMLElement, props.clientRect);
						},
						onKeyDown: ({ event }) => {
							if (event.key === "Escape" && menu) {
								close();
								return true;
							}
							return menu?.ref?.onKeyDown(event) ?? false;
						},
						onExit: close,
					};
				},
			}),
		];
	},
});
