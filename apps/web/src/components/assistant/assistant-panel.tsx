import { useMutation } from "@apollo/client/react";
import { ConfirmModal } from "@ekra/ui/components/modal";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import { useEffect, useState } from "react";
import { CLEAR_AI_CHAT } from "@/graphql/ai";
import { assistantThread } from "@/lib/assistant";
import { AssistantChat } from "./assistant-chat";
import { ASSISTANT, useAssistant } from "./assistant-context";

/**
 * The assistant in a side panel you open from anywhere (the sidebar or ⌘J). Each person has one chat per
 * organization, kept until they clear it. It can grow to a centred window.
 */
export function AssistantPanel({
	slug,
	orgId,
	userId,
	manager,
}: {
	slug: string;
	orgId: string;
	userId: string;
	manager: boolean;
}) {
	const { setOpen } = useAssistant();
	const [full, setFull] = useState(false);
	const [clearing, setClearing] = useState(false);
	// a new key after clearing gives the chat a fresh, empty start
	const [round, setRound] = useState(0);
	const [clear] = useMutation(CLEAR_AI_CHAT);

	// Esc closes the panel, unless a dialog is open on top of it
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || e.defaultPrevented) return;
			if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
			setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [setOpen]);

	const head =
		"grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
	return (
		<>
			{full && (
				<button
					type="button"
					aria-label="Back to side panel"
					className="fixed inset-0 z-40 bg-black/40 animate-in fade-in duration-150"
					onClick={() => setFull(false)}
				/>
			)}
			<aside
				aria-label={ASSISTANT}
				data-testid="assistant-panel"
				className={cn(
					"ai-drawer-in fixed z-50 flex flex-col bg-background",
					full
						? "inset-x-0 inset-y-6 mx-auto w-[min(980px,calc(100vw-48px))] rounded-xl border shadow-2xl"
						: "inset-y-0 right-0 w-[min(620px,100vw)] border-l shadow-[-18px_0_40px_-24px_rgba(0,0,0,0.25)]",
				)}
			>
				<div className="flex h-[46px] shrink-0 items-center gap-1 border-b pr-2.5 pl-4">
					<span
						aria-hidden
						className="icon-[hugeicons--ai-magic] size-4 text-brand"
					/>
					<b className="ml-1 font-semibold">{ASSISTANT}</b>
					<span className="flex-1" />
					<button
						type="button"
						aria-label="Clear history"
						title="Clear history"
						className={head}
						onClick={() => setClearing(true)}
					>
						<span aria-hidden className="icon-[solar--eraser-linear] size-4" />
					</button>
					<button
						type="button"
						aria-label={full ? "Back to side panel" : "Expand"}
						title={full ? "Side panel" : "Expand"}
						className={cn(head, "max-md:hidden")}
						onClick={() => setFull(!full)}
					>
						<span
							aria-hidden
							className={cn(
								"size-4",
								full
									? "icon-[solar--minimize-square-linear]"
									: "icon-[solar--maximize-square-linear]",
							)}
						/>
					</button>
					<button
						type="button"
						aria-label="Close"
						title="Close (Esc)"
						className={head}
						onClick={() => setOpen(false)}
					>
						<span
							aria-hidden
							className="icon-[solar--close-circle-linear] size-4"
						/>
					</button>
				</div>
				<div
					className={cn(
						"flex min-h-0 flex-1 flex-col",
						full && "mx-auto w-full max-w-[760px]",
					)}
				>
					<AssistantChat
						key={round}
						slug={slug}
						threadId={assistantThread(orgId, userId)}
						manager={manager}
					/>
				</div>
				<ConfirmModal
					open={clearing}
					onOpenChange={setClearing}
					title="Clear the chat history?"
					body={`Every message in this chat is deleted. Changes ${ASSISTANT} made stay.`}
					ok="Clear history"
					danger
					icon="icon-[solar--eraser-linear]"
					onConfirm={() =>
						clear({ variables: { slug } })
							.then(() => {
								setRound((r) => r + 1);
								toast.success("Chat history cleared");
							})
							.catch(() => toast.error("Couldn't clear the history"))
					}
				/>
			</aside>
		</>
	);
}
