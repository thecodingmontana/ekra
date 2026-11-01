import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDoc, DocError } from "./doc.ts";
import { diffWords } from "./text-diff.ts";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (text: string, marks?: unknown[]) => ({
	type: "paragraph",
	content: [{ type: "text", text, ...(marks && { marks }) }],
});

test("a normal page is kept, with its plain text", () => {
	const page = doc(
		{
			type: "heading",
			attrs: { level: 2 },
			content: [{ type: "text", text: "Welcome" }],
		},
		p("Read this", [{ type: "link", attrs: { href: "https://ekra.app" } }]),
		{ type: "image", attrs: { src: "/api/media/org1/abc/1280-webp" } },
		{
			type: "youtube",
			attrs: { src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
		},
	);
	const { doc: clean, text } = checkDoc(page);
	assert.deepEqual(clean, page);
	assert.equal(text, "Welcome\nRead this");
});

test("anything the editor can't make is refused", () => {
	const refused = (d: unknown, why: RegExp) =>
		assert.throws(
			() => checkDoc(d),
			(e) => e instanceof DocError && why.test(e.message),
		);
	refused(doc({ type: "script", content: [] }), /Unsupported block/);
	refused(
		doc(p("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])),
		/Links must/,
	);
	refused(doc(p("x", [{ type: "font", attrs: {} }])), /Unsupported style/);
	refused(
		doc({ type: "image", attrs: { src: "https://evil.example/x.png" } }),
		/image/,
	);
	refused(
		doc({ type: "image", attrs: { src: "/api/media/../../etc/passwd" } }),
		/image/,
	);
	refused(
		doc({ type: "youtube", attrs: { src: "https://evil.example/embed/x" } }),
		/youtube/,
	);
	refused(doc({ type: "paragraph", attrs: { onclick: { x: 1 } } }), /Bad page/);
	refused({ type: "paragraph" }, /Bad page/);
	let deep: unknown = p("x");
	for (let i = 0; i < 50; i++) deep = { type: "blockquote", content: [deep] };
	refused(doc(deep), /nested too deeply/);
	refused(doc(p("x".repeat(600_000))), /too long/);
});

test("a callout ends its line in the plain text", () => {
	const page = doc(
		{ type: "callout", content: [{ type: "text", text: "Mind the step." }] },
		p("Then go on."),
	);
	assert.equal(checkDoc(page).text, "Mind the step.\nThen go on.");
});

test("table column widths (lists of numbers) are allowed", () => {
	const table = doc({
		type: "table",
		content: [
			{
				type: "tableRow",
				content: [
					{
						type: "tableCell",
						attrs: { colwidth: [120, 80] },
						content: [p("a")],
					},
				],
			},
		],
	});
	assert.doesNotThrow(() => checkDoc(table));
});

test("diffWords shows what was added and removed", () => {
	assert.deepEqual(diffWords("the quick fox", "the slow fox jumps"), [
		{ op: "same", text: "the " },
		{ op: "del", text: "quick" },
		{ op: "add", text: "slow" },
		{ op: "same", text: " fox" },
		{ op: "add", text: " jumps" },
	]);
	assert.deepEqual(diffWords("same", "same"), [{ op: "same", text: "same" }]);
	assert.deepEqual(diffWords("", "new"), [{ op: "add", text: "new" }]);
	const big = "w ".repeat(4000);
	assert.deepEqual(
		diffWords(big, `${big}x`).map((d) => d.op),
		["del", "add"],
		"a huge text says it all changed rather than taking seconds",
	);
});
