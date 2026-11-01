import { EditorContent, useEditor } from "@tiptap/react";
import { bodyExtensions, parseDoc } from "./extensions";
import "./editor.css";

/** A body shown to read: the editor's blocks without editing, menus or toolbars. */
export function ReadOnlyBody({ doc }: { doc: string }) {
	const editor = useEditor({
		immediatelyRender: false,
		editable: false,
		content: parseDoc(doc),
		extensions: bodyExtensions(false),
	});
	return (
		<div className="ekra-doc" data-testid="body-read">
			<EditorContent editor={editor} />
		</div>
	);
}
