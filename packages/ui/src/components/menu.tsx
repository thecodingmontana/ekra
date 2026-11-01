import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import type { ReactElement, ReactNode } from "react";
import { cn } from "../lib/utils";

// Ported from zadaci (components/q/menu.tsx + .pop/.mi/.mh/.msep in ui.css), on Base UI's Menu instead of Radix.

export const Menu = MenuPrimitive.Root;

/** The element that opens the menu; pass your own button through `render`. */
export function MenuTrigger({
	render,
	...props
}: MenuPrimitive.Trigger.Props & { render: ReactElement }) {
	return <MenuPrimitive.Trigger render={render} {...props} />;
}

export function MenuContent({
	children,
	align = "end",
	side = "bottom",
	width,
}: {
	children: ReactNode;
	align?: "start" | "center" | "end";
	side?: "top" | "bottom" | "left" | "right";
	width?: number;
}) {
	return (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Positioner
				align={align}
				side={side}
				sideOffset={4}
				className="z-80 outline-none"
			>
				<MenuPrimitive.Popup
					style={{ width }}
					className="max-h-[min(420px,70vh)] min-w-[200px] max-w-[320px] origin-(--transform-origin) overflow-y-auto rounded-[10px] bg-popover p-1 text-base text-popover-foreground shadow-[0_12px_32px_-8px_rgba(28,25,20,0.16),0_2px_6px_-2px_rgba(28,25,20,0.06),0_0_0_1px_var(--border)] outline-none transition-[opacity,transform] duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:opacity-0 data-starting-style:-translate-y-1 data-starting-style:scale-[0.97] data-starting-style:opacity-0 motion-reduce:transition-none dark:shadow-[0_16px_40px_-10px_rgba(0,0,0,0.6),0_0_0_1px_var(--border)]"
				>
					{children}
				</MenuPrimitive.Popup>
			</MenuPrimitive.Positioner>
		</MenuPrimitive.Portal>
	);
}

export function MenuItem({
	icon,
	children,
	onSelect,
	danger,
	checked,
	disabled,
	r,
	keepOpen,
}: {
	icon?: string;
	children: ReactNode;
	onSelect: () => void;
	danger?: boolean;
	checked?: boolean;
	disabled?: boolean;
	/** something on the right: a role, a shortcut, an arrow */
	r?: ReactNode;
	/** for toggles: picking it leaves the menu open */
	keepOpen?: boolean;
}) {
	return (
		<MenuPrimitive.Item
			onClick={onSelect}
			closeOnClick={!keepOpen}
			disabled={disabled}
			className={cn(
				"flex min-h-[30px] w-full items-center gap-[9px] whitespace-nowrap rounded-[6px] px-2 text-left text-base outline-none data-disabled:opacity-50 data-highlighted:bg-muted",
				danger ? "text-destructive" : "text-foreground",
			)}
		>
			{icon && (
				<span
					aria-hidden="true"
					className={cn(
						icon,
						"size-[15px] shrink-0",
						danger ? "text-destructive" : "text-muted-foreground",
					)}
				/>
			)}
			{children}
			{r && (
				<span className="ml-auto flex items-center gap-1 text-muted-foreground text-xs">
					{r}
				</span>
			)}
			{checked && (
				<span className="ml-auto text-brand">
					<span
						aria-hidden="true"
						className="icon-[hugeicons--tick-02] size-3.5"
					/>
				</span>
			)}
		</MenuPrimitive.Item>
	);
}

export function MenuLabel({ children }: { children: ReactNode }) {
	return (
		<div className="px-2 pt-2 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
			{children}
		</div>
	);
}

export function MenuSeparator() {
	return <MenuPrimitive.Separator className="-mx-1 my-1 h-px bg-border/70" />;
}
