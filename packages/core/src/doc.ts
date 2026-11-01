/**
 * A page's body is Tiptap JSON. The server only stores documents built from the blocks and marks the editor offers,
 * so a hand-made request can't smuggle in scripts, odd links or pictures from elsewhere.
 */

export const MAX_DOC_BYTES = 500_000;

const NODES = new Set([
	"doc",
	"paragraph",
	"text",
	"heading",
	"bulletList",
	"orderedList",
	"listItem",
	"taskList",
	"taskItem",
	"blockquote",
	"codeBlock",
	"horizontalRule",
	"hardBreak",
	"image",
	"youtube",
	"callout",
	"table",
	"tableRow",
	"tableHeader",
	"tableCell",
	"details",
	"detailsSummary",
	"detailsContent",
]);
const MARKS = new Set([
	"bold",
	"italic",
	"underline",
	"strike",
	"code",
	"highlight",
	"link",
	"textStyle",
]);
// blocks that end a line in the plain-text copy
const LINES = new Set(["paragraph", "heading", "codeBlock", "hardBreak"]);
const SAFE_LINK = /^(https?:|mailto:)/i;

/** Pictures come only from Ekra's own image pipeline (never a raw upload or another site). */
export const isImageSrc = (src: unknown) =>
	typeof src === "string" &&
	src.length <= 500 &&
	/^\/api\/media\/[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(src) &&
	!src.includes("..");

/** A YouTube watch, short, live or embed address. */
export function isYoutubeSrc(src: unknown) {
	if (typeof src !== "string" || src.length > 500) return false;
	let url: URL;
	try {
		url = new URL(src);
	} catch {
		return false;
	}
	if (url.protocol !== "https:") return false;
	const host = url.hostname.replace(/^(www|m)\./, "");
	if (host === "youtu.be") return /^\/[\w-]+$/.test(url.pathname);
	if (host !== "youtube.com" && host !== "youtube-nocookie.com") return false;
	return (
		(url.pathname === "/watch" &&
			/^[\w-]+$/.test(url.searchParams.get("v") ?? "")) ||
		/^\/(embed|shorts|live)\/[\w-]+$/.test(url.pathname)
	);
}

const SOURCES: Record<string, (src: unknown) => boolean> = {
	image: isImageSrc,
	youtube: isYoutubeSrc,
};

export type DocNode = {
	type: string;
	text?: string;
	attrs?: Record<string, unknown>;
	marks?: { type: string; attrs?: Record<string, unknown> }[];
	content?: DocNode[];
};

export class DocError extends Error {}

const scalar = (v: unknown) =>
	v === null || ["string", "number", "boolean"].includes(typeof v);

/** Plain attribute values only: scalars, or lists of numbers (table column widths). */
function plain(attrs: unknown): Record<string, unknown> | undefined {
	if (attrs == null) return undefined;
	if (typeof attrs !== "object" || Array.isArray(attrs))
		throw new DocError("Bad page content");
	for (const v of Object.values(attrs))
		if (
			!scalar(v) &&
			!(Array.isArray(v) && v.every((x) => typeof x === "number"))
		)
			throw new DocError("Bad page content");
	return attrs as Record<string, unknown>;
}

function walk(node: unknown, out: string[], depth: number): DocNode {
	if (depth > 40) throw new DocError("The page is nested too deeply");
	if (!node || typeof node !== "object") throw new DocError("Bad page content");
	const n = node as DocNode;
	if (!NODES.has(n.type)) throw new DocError(`Unsupported block: ${n.type}`);
	if (n.type === "text") {
		if (typeof n.text !== "string") throw new DocError("Bad page content");
		out.push(n.text);
	}
	if (n.marks !== undefined && !Array.isArray(n.marks))
		throw new DocError("Bad page content");
	const marks = (n.marks ?? []).map((m) => {
		if (!MARKS.has(m?.type))
			throw new DocError(`Unsupported style: ${m?.type}`);
		const attrs = plain(m.attrs);
		if (m.type === "link" && !SAFE_LINK.test(String(attrs?.href ?? "")))
			throw new DocError("Links must start with http, https or mailto");
		return attrs ? { type: m.type, attrs } : { type: m.type };
	});
	if (n.content !== undefined && !Array.isArray(n.content))
		throw new DocError("Bad page content");
	const content = n.content?.map((c) => walk(c, out, depth + 1));
	if (LINES.has(n.type)) out.push("\n");
	const attrs = plain(n.attrs);
	const allowed = SOURCES[n.type];
	if (allowed && !allowed(attrs?.src))
		throw new DocError(`That ${n.type} can't be shown on a page`);
	return {
		type: n.type,
		...(n.text !== undefined && { text: n.text }),
		...(attrs && { attrs }),
		...(marks.length > 0 && { marks }),
		...(content && { content }),
	};
}

/** The document rebuilt from allowed parts, plus its plain text. Throws a DocError that explains itself. */
export function checkDoc(doc: unknown): { doc: DocNode; text: string } {
	if (JSON.stringify(doc ?? null).length > MAX_DOC_BYTES)
		throw new DocError("This page is too long to save");
	const out: string[] = [];
	const clean = walk(doc, out, 0);
	if (clean.type !== "doc") throw new DocError("Bad page content");
	return {
		doc: clean,
		text: out
			.join("")
			.replace(/\n{3,}/g, "\n\n")
			.trim(),
	};
}
