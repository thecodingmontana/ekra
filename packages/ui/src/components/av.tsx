import type { CSSProperties } from "react";
import { cn } from "../lib/utils";

// A person's avatar: their photo, or their initials on a colour of their own.

const COLORS = [
	"#5A67D8",
	"#C54B78",
	"#3B82C4",
	"#23918A",
	"#C48A1E",
	"#8662C9",
];

/** Stable colour per person so the same initials always look the same. */
export function avatarColor(seed: string) {
	let h = 0;
	for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
	return COLORS[Math.abs(h) % COLORS.length];
}

/** Sizes in px: sm 20, default 22, md 26, lg 36, xl 64. */
const SIZE = { sm: 20, default: 22, md: 26, lg: 36, xl: 64 } as const;

export function Av({
	name,
	image,
	size = "default",
	className,
}: {
	name: string;
	image?: string | null;
	size?: keyof typeof SIZE;
	className?: string;
}) {
	const style = { "--sz": `${SIZE[size]}px` } as CSSProperties;
	const shape =
		"inline-grid size-(--sz) shrink-0 select-none place-items-center rounded-full shadow-[0_0_0_1.5px_var(--background)]";
	if (image) {
		return (
			<img
				src={image}
				alt=""
				referrerPolicy="no-referrer"
				style={style}
				className={cn(shape, "object-cover", className)}
			/>
		);
	}
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => w[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
	return (
		<span
			style={{ ...style, "--c": avatarColor(name) } as CSSProperties}
			className={cn(
				shape,
				"bg-[color-mix(in_srgb,var(--c)_17%,var(--background))] font-semibold text-[calc(var(--sz)*0.4)] text-[color-mix(in_srgb,var(--c)_55%,var(--foreground))] leading-none tracking-[0.01em]",
				className,
			)}
		>
			{initials || "?"}
		</span>
	);
}
