import { cn } from "@ekra/ui/lib/utils";
import { useRef, useState } from "react";

/** A title edited in place: Enter or leaving the field saves it, Esc puts it back. */
export function InlineTitle({
	value,
	label,
	onSave,
	onDone,
	className,
}: {
	value: string;
	label: string;
	onSave: (title: string) => unknown;
	onDone: () => void;
	className?: string;
}) {
	const [text, setText] = useState(value);
	// Esc closes the field, and removing a focused field can also fire blur: finish once
	const finished = useRef(false);
	const finish = (save: boolean) => {
		if (finished.current) return;
		finished.current = true;
		const title = text.trim();
		if (save && title && title !== value) void onSave(title);
		onDone();
	};
	return (
		<input
			// biome-ignore lint/a11y/noAutofocus: opened on purpose by Rename or Add
			autoFocus
			aria-label={label}
			value={text}
			maxLength={200}
			onFocus={(e) => e.currentTarget.select()}
			onChange={(e) => setText(e.target.value)}
			onBlur={() => finish(true)}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					finish(true);
				}
				if (e.key === "Escape") finish(false);
			}}
			className={cn(
				"h-7 w-full min-w-0 rounded-md border border-input bg-background px-2 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
				className,
			)}
			data-testid="inline-title"
		/>
	);
}
