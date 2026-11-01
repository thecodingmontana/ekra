import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDoc } from "@ekra/core";
import { getSchema } from "@tiptap/core";
import { bodyExtensions } from "./extensions.ts";

// sources the server accepts, for the blocks that must point at one
const ATTRS: Record<string, Record<string, unknown>> = {
	image: { src: "/api/media/org/img/1280-webp" },
	youtube: { src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
};

for (const editable of [true, false]) {
	test(`every block and style the ${editable ? "editor" : "reader"} knows can be saved`, () => {
		const schema = getSchema(bodyExtensions(editable));
		for (const name of Object.keys(schema.nodes)) {
			if (name === "doc") continue;
			const node =
				name === "text"
					? { type: "text", text: "x" }
					: // with every attribute at its default, so odd attribute values fail too
						{
							type: name,
							attrs: schema.nodes[name]?.create(ATTRS[name]).attrs,
						};
			assert.doesNotThrow(
				() => checkDoc({ type: "doc", content: [node] }),
				`block ${name}`,
			);
		}
		for (const name of Object.keys(schema.marks))
			assert.doesNotThrow(
				() =>
					checkDoc({
						type: "doc",
						content: [
							{
								type: "text",
								text: "x",
								marks: [
									{
										type: name,
										attrs: name === "link" ? { href: "https://x.io" } : {},
									},
								],
							},
						],
					}),
				`style ${name}`,
			);
	});
}
