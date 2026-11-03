import { buttonVariants } from "@ekra/ui/components/button";
import { Spinner } from "@ekra/ui/components/spinner";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import { type ReactNode, useState } from "react";
import { PICTURE_TYPES, uploadPicture } from "@/lib/upload";

/** An on/off switch. */
export function Toggle({
	checked,
	onChange,
	label,
	testId,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	testId?: string;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			onClick={() => onChange(!checked)}
			data-testid={testId}
			className={cn(
				"inline-flex h-[18px] w-8 shrink-0 items-center rounded-full p-px outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
				checked ? "bg-brand" : "bg-input dark:bg-input/80",
			)}
		>
			<span
				className={cn(
					"block size-4 rounded-full bg-white shadow-sm transition-transform",
					checked && "translate-x-[14px]",
				)}
			/>
		</button>
	);
}

/** A row of mutually exclusive buttons. */
export function Segmented<T extends string | boolean>({
	value,
	onChange,
	options,
	label,
}: {
	value: T;
	onChange: (value: T) => void;
	options: readonly (readonly [T, string, string?])[];
	label: string;
}) {
	return (
		<fieldset
			aria-label={label}
			className="m-0 inline-flex w-fit min-w-0 max-w-full flex-wrap gap-0.5 rounded-lg border-0 bg-muted p-0.5 text-sm"
		>
			{options.map(([v, text, icon]) => (
				<button
					key={String(v)}
					type="button"
					aria-pressed={value === v}
					onClick={() => onChange(v)}
					className={cn(
						"inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium transition-colors",
						value === v
							? "bg-background text-foreground shadow-xs"
							: "text-muted-foreground hover:text-foreground",
					)}
					data-testid={`seg-${String(v)}`}
				>
					{icon && <span className={cn(icon, "size-3.5")} aria-hidden="true" />}
					{text}
				</button>
			))}
		</fieldset>
	);
}

/** A button that uploads a picture through the image pipeline and hands back its address. */
export function PictureButton({
	slug,
	onPicked,
	children,
	className,
	variant = "outline",
	size = "sm",
	testId,
}: {
	slug: string;
	onPicked: (src: string) => void;
	children: ReactNode;
	className?: string;
	variant?: "outline" | "ghost" | "default";
	size?: "sm" | "xs" | "default" | "icon-sm";
	testId?: string;
}) {
	const [busy, setBusy] = useState(false);
	return (
		<label
			className={cn(
				buttonVariants({ variant, size }),
				"cursor-pointer has-focus-visible:ring-4 has-focus-visible:ring-ring/50",
				busy && "pointer-events-none opacity-60",
				className,
			)}
		>
			{busy ? <Spinner className="size-3.5" /> : children}
			<input
				type="file"
				accept={PICTURE_TYPES}
				className="sr-only"
				disabled={busy}
				data-testid={testId}
				onChange={async (e) => {
					const file = e.target.files?.[0];
					e.target.value = "";
					if (!file) return;
					setBusy(true);
					try {
						onPicked((await uploadPicture(slug, file)).src);
					} catch (error) {
						toast.error("Couldn't upload the picture", {
							desc: (error as Error).message,
						});
					} finally {
						setBusy(false);
					}
				}}
			/>
		</label>
	);
}

/** A labelled field in the question editor. */
export function FieldLabel({
	children,
	hint,
}: {
	children: ReactNode;
	hint?: ReactNode;
}) {
	return (
		<div className="mb-1.5 flex items-baseline gap-2">
			<span className="font-medium text-sm">{children}</span>
			{hint && <span className="text-muted-foreground text-xs">{hint}</span>}
		</div>
	);
}

export const TEXTAREA =
	"w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export const KIND_LABEL = {
	multiple_choice: "Multiple choice",
	fill_blank: "Fill in the blank",
	hotspot: "Hotspot",
} as const;

export const KIND_ICON = {
	multiple_choice: "icon-[solar--checklist-minimalistic-linear]",
	fill_blank: "icon-[solar--text-field-linear]",
	hotspot: "icon-[solar--cursor-linear]",
} as const;
