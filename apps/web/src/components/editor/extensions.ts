import { isImageSrc } from "@ekra/core";
import { type Extensions, mergeAttributes, Node } from "@tiptap/core";
import {
	Details,
	DetailsContent,
	DetailsSummary,
} from "@tiptap/extension-details";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import Typography from "@tiptap/extension-typography";
import Youtube from "@tiptap/extension-youtube";
import StarterKit from "@tiptap/starter-kit";

// The blocks a content page is made of. The server stores only these node and mark types (checkDoc in
// @ekra/core), so adding an extension here that brings its own type also means allowing it there.

/** Callout kinds: each has its own colour (editor.css) and icon. */
export const CALLOUT_VARIANTS = [
	{ id: "info", label: "Info", icon: "icon-[solar--info-circle-bold]" },
	{ id: "tip", label: "Tip", icon: "icon-[solar--lightbulb-bolt-bold]" },
	{ id: "success", label: "Success", icon: "icon-[solar--check-circle-bold]" },
	{
		id: "warning",
		label: "Warning",
		icon: "icon-[solar--danger-triangle-bold]",
	},
	{ id: "danger", label: "Danger", icon: "icon-[solar--danger-circle-bold]" },
	{ id: "note", label: "Note", icon: "icon-[solar--notes-bold]" },
] as const;

/** A saved kind, or Info for anything else. */
export const calloutVariant = (value: unknown) =>
	CALLOUT_VARIANTS.find((v) => v.id === value) ?? CALLOUT_VARIANTS[0];

/** An icon beside a line of text that stands out. */
export const Callout = Node.create({
	name: "callout",
	group: "block",
	content: "inline*",
	defining: true,
	addAttributes() {
		return {
			variant: {
				default: "info",
				parseHTML: (el) => calloutVariant(el.getAttribute("data-variant")).id,
				renderHTML: (attrs) => ({
					"data-variant": calloutVariant(attrs.variant).id,
				}),
			},
		};
	},
	parseHTML() {
		return [
			{ tag: 'div[data-type="callout"]', contentElement: ".callout-body" },
		];
	},
	renderHTML({ node, HTMLAttributes }) {
		const variant = calloutVariant(node.attrs.variant);
		return [
			"div",
			mergeAttributes(HTMLAttributes, {
				"data-type": "callout",
				class: "callout",
			}),
			[
				"span",
				{
					class: `callout-icon ${variant.icon}`,
					contenteditable: "false",
					"aria-hidden": "true",
				},
			],
			["div", { class: "callout-body" }, 0],
		];
	},
});

// the server keeps only these links, so others never become one
const SAFE_LINK = /^(https?:|mailto:)/i;

/** The page's blocks and marks; `editable` only changes how links and tables behave. */
export function bodyExtensions(editable: boolean): Extensions {
	return [
		StarterKit.configure({
			heading: { levels: [1, 2, 3] },
			link: {
				openOnClick: !editable,
				autolink: true,
				isAllowedUri: (url) => SAFE_LINK.test(url),
			},
			// no forced empty line at the end of the page
			trailingNode: false,
			dropcursor: { color: "var(--brand)", width: 3 },
		}),
		Highlight,
		TaskList,
		TaskItem.configure({ nested: true }),
		Image.extend({
			// a pasted picture from another site would be refused on save
			parseHTML: () => [
				{
					tag: "img[src]",
					getAttrs: (el) => (isImageSrc(el.getAttribute("src")) ? null : false),
				},
			],
		}).configure({ allowBase64: false }),
		Youtube.configure({ nocookie: true, modestBranding: true }),
		TableKit.configure({ table: { resizable: editable } }),
		Details.configure({ persist: true }),
		DetailsSummary,
		DetailsContent,
		Callout,
		// "--" becomes an en dash, quotes curl, (c) becomes ©
		Typography,
	];
}

/** The saved body as Tiptap JSON, or nothing for an empty page. */
export function parseDoc(doc: string | null): object | undefined {
	if (!doc) return undefined;
	try {
		return JSON.parse(doc) as object;
	} catch {
		return undefined;
	}
}
