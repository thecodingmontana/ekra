import { Dialog } from "@base-ui/react/dialog";
import { type ReactNode, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Input } from "./input";

// Dialogs on Base UI's Dialog (focus trap, Esc, labelling): a dimmed backdrop and a card that rises in;
// on phones the card is a sheet from the bottom.

const BACKDROP =
	"fixed inset-0 z-75 bg-[rgba(24,22,19,0.28)] transition-opacity duration-180 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none dark:bg-black/55";
const VIEWPORT =
	"fixed inset-0 z-76 flex items-end justify-center overflow-y-auto sm:items-start sm:px-4 sm:pt-[10vh] sm:pb-4";
const POPUP =
	"flex max-h-[92vh] w-full flex-col rounded-t-[14px] bg-popover text-popover-foreground shadow-[0_12px_32px_-8px_rgba(28,25,20,0.16),0_2px_6px_-2px_rgba(28,25,20,0.06),0_0_0_1px_var(--border)] outline-none transition-[opacity,translate,scale] duration-260 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:translate-y-1.5 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-ending-style:duration-160 data-starting-style:translate-y-2 data-starting-style:scale-[0.97] data-starting-style:opacity-0 motion-reduce:transition-opacity sm:max-h-[80vh] sm:rounded-xl dark:shadow-[0_16px_40px_-10px_rgba(0,0,0,0.6),0_0_0_1px_var(--border)]";

export function Modal({
	open,
	onOpenChange,
	title,
	sub,
	size,
	children,
	footer,
	busy,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	sub?: ReactNode;
	size?: "sm" | "lg";
	children: ReactNode;
	footer?: ReactNode;
	/** an action is running: Esc, the backdrop and × don't close it until it finishes */
	busy?: boolean;
}) {
	return (
		<Dialog.Root
			open={open}
			onOpenChange={(o) => {
				if (busy && !o) return;
				onOpenChange(o);
			}}
		>
			<Dialog.Portal>
				<Dialog.Backdrop className={BACKDROP} />
				<Dialog.Viewport className={VIEWPORT}>
					<Dialog.Popup
						className={cn(
							POPUP,
							size === "sm"
								? "sm:max-w-[420px]"
								: size === "lg"
									? "sm:max-w-[720px]"
									: "sm:max-w-[560px]",
						)}
					>
						<div className="flex items-center gap-2 px-4 pt-3.5">
							<div className="min-w-0">
								<Dialog.Title className="m-0 font-semibold text-md">
									{title}
								</Dialog.Title>
								{sub && (
									<Dialog.Description className="mt-0.5 text-muted-foreground text-sm">
										{sub}
									</Dialog.Description>
								)}
							</div>
							<Dialog.Close
								render={
									<Button
										variant="ghost"
										size="icon-sm"
										className="ml-auto text-muted-foreground"
									/>
								}
								aria-label="Close"
								disabled={busy}
							>
								<span
									className="icon-[solar--close-linear] size-4"
									aria-hidden="true"
								/>
							</Dialog.Close>
						</div>
						{children}
						{footer && (
							<div className="flex items-center gap-2 border-t px-4 py-3">
								{footer}
							</div>
						)}
					</Dialog.Popup>
				</Dialog.Viewport>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

/** The body of a Modal: padded, scrolls when long. */
export function ModalBody({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex flex-col gap-3.5 overflow-y-auto overscroll-contain px-4 py-3.5",
				className,
			)}
			{...props}
		/>
	);
}

/** "Are you sure?": an icon, a title, what will happen, and optionally typing a name to confirm. */
export function ConfirmModal({
	open,
	onOpenChange,
	title,
	body,
	ok,
	danger,
	icon,
	typeName,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	body: ReactNode;
	ok: string;
	danger?: boolean;
	icon?: string;
	typeName?: string;
	onConfirm: () => Promise<unknown> | unknown;
}) {
	const [text, setText] = useState("");
	const [busy, setBusy] = useState(false);
	const ready = !typeName || text === typeName;

	return (
		<Dialog.Root
			open={open}
			onOpenChange={(o) => {
				if (busy) return;
				if (!o) setText("");
				onOpenChange(o);
			}}
		>
			<Dialog.Portal>
				<Dialog.Backdrop className={BACKDROP} />
				<Dialog.Viewport className={VIEWPORT}>
					<Dialog.Popup className={cn(POPUP, "sm:max-w-[420px]")}>
						<div className="flex flex-col gap-2.5 px-4 pt-[18px] pb-3.5">
							<div className="flex items-start gap-3">
								<span
									className={cn(
										"grid size-[34px] shrink-0 place-items-center rounded-[9px]",
										danger
											? "bg-tint-red/13 text-tint-red"
											: "bg-tint-amber/13 text-tint-amber",
									)}
								>
									<span
										className={cn(
											icon ??
												(danger
													? "icon-[solar--trash-bin-minimalistic-linear]"
													: "icon-[solar--archive-linear]"),
											"size-[17px]",
										)}
										aria-hidden="true"
									/>
								</span>
								<div className="min-w-0 flex-1">
									<Dialog.Title className="mt-1 mb-1.5 font-semibold text-[15px]">
										{title}
									</Dialog.Title>
									<Dialog.Description className="m-0 text-[13px] text-muted-foreground leading-[1.55]">
										{body}
									</Dialog.Description>
								</div>
							</div>
							{typeName && (
								<div className="mt-1.5 flex flex-col gap-1.5">
									<label
										htmlFor="confirm-in"
										className="text-muted-foreground text-sm"
									>
										Type{" "}
										<b className="font-semibold text-foreground">{typeName}</b>{" "}
										to confirm
									</label>
									<Input
										id="confirm-in"
										autoComplete="off"
										value={text}
										onChange={(e) => setText(e.target.value)}
									/>
								</div>
							)}
						</div>
						<div className="flex items-center gap-2 border-t px-4 py-3">
							<span className="flex-1" />
							<Dialog.Close
								render={<Button variant="outline" />}
								disabled={busy}
							>
								Cancel
							</Dialog.Close>
							<Button
								variant={danger ? "destructive" : "default"}
								disabled={!ready || busy}
								aria-busy={busy}
								data-testid="confirm-ok"
								onClick={async () => {
									setBusy(true);
									try {
										await onConfirm();
										setText("");
										onOpenChange(false);
									} catch {
										// the caller already showed the error; keep the dialog open to retry
									} finally {
										setBusy(false);
									}
								}}
							>
								{ok}
							</Button>
						</div>
					</Dialog.Popup>
				</Dialog.Viewport>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
