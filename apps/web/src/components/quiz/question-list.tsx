import { Button } from "@ekra/ui/components/button";
import {
	Menu,
	MenuContent,
	MenuItem,
	MenuLabel,
	MenuSeparator,
	MenuTrigger,
} from "@ekra/ui/components/menu";
import { Spinner } from "@ekra/ui/components/spinner";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import { useRef, useState } from "react";
import type { QuizQuestion } from "@/graphql/quiz";
import type { QuestionKind } from "@/lib/quiz-builder";
import { PICTURE_TYPES, uploadPicture } from "@/lib/upload";
import { KIND_ICON, KIND_LABEL } from "./controls";

/** The quiz's questions in order: pick one to edit, drag or use its menu to reorder, add new ones. */
export function QuestionList({
	slug,
	questions,
	selectedId,
	onSelect,
	onAdd,
	onMove,
	onDelete,
	onSettings,
}: {
	slug: string;
	questions: QuizQuestion[];
	selectedId: string | null;
	onSelect: (id: string) => void;
	onAdd: (kind: QuestionKind, image?: string) => Promise<void>;
	onMove: (q: QuizQuestion, position: number) => Promise<void>;
	onDelete: (q: QuizQuestion) => void;
	onSettings: () => void;
}) {
	const file = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [dragging, setDragging] = useState<QuizQuestion | null>(null);
	const [over, setOver] = useState<number | null>(null);

	const add = async (kind: QuestionKind, picture?: File) => {
		setBusy(true);
		try {
			const image = picture
				? (await uploadPicture(slug, picture)).src
				: undefined;
			await onAdd(kind, image);
		} catch (e) {
			toast.error("Couldn't upload the picture", {
				desc: (e as Error).message,
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<nav
			aria-label="Questions"
			className="flex flex-col rounded-[10px] border bg-card md:sticky md:top-4"
		>
			<div className="flex items-center gap-2 border-b py-1.5 pr-1.5 pl-3">
				<h2 className="m-0 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
					Questions ({questions.length})
				</h2>
				<Menu>
					<MenuTrigger
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								className="ml-auto"
								aria-label="Add a question"
								disabled={busy}
								data-testid="add-question"
							/>
						}
					>
						{busy ? (
							<Spinner className="size-3.5" />
						) : (
							<span
								className="icon-[solar--add-circle-linear] size-4"
								aria-hidden="true"
							/>
						)}
					</MenuTrigger>
					<MenuContent align="end">
						<MenuLabel>New question</MenuLabel>
						{(["multiple_choice", "fill_blank"] as const).map((k) => (
							<MenuItem
								key={k}
								icon={KIND_ICON[k]}
								onSelect={() => void add(k)}
							>
								{KIND_LABEL[k]}
							</MenuItem>
						))}
						<MenuItem
							icon={KIND_ICON.hotspot}
							onSelect={() => file.current?.click()}
							r="pick a picture"
						>
							{KIND_LABEL.hotspot}
						</MenuItem>
					</MenuContent>
				</Menu>
				<input
					ref={file}
					type="file"
					accept={PICTURE_TYPES}
					className="sr-only"
					tabIndex={-1}
					aria-hidden="true"
					data-testid="hotspot-file"
					onChange={(e) => {
						const f = e.target.files?.[0];
						e.target.value = "";
						if (f) void add("hotspot", f);
					}}
				/>
			</div>
			<ol
				className="m-0 flex max-h-[60vh] list-none flex-col gap-1 overflow-y-auto p-1.5 md:max-h-[calc(100vh-220px)]"
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => {
					e.preventDefault();
					if (dragging && over != null) {
						const from = questions.indexOf(dragging);
						void onMove(dragging, over > from ? over - 1 : over);
					}
					setDragging(null);
					setOver(null);
				}}
			>
				{questions.length === 0 && (
					<li className="px-2 py-3 text-muted-foreground text-sm">
						No questions yet.
					</li>
				)}
				{questions.map((q, i) => (
					<li
						key={q.id}
						draggable
						onDragStart={(e) => {
							e.dataTransfer.effectAllowed = "move";
							e.dataTransfer.setData("text/plain", q.prompt);
							setDragging(q);
						}}
						onDragEnd={() => {
							setDragging(null);
							setOver(null);
						}}
						onDragOver={(e) => {
							const box = e.currentTarget.getBoundingClientRect();
							setOver(e.clientY > box.top + box.height / 2 ? i + 1 : i);
						}}
						className={cn(
							"group relative flex items-start gap-1 rounded-lg transition-colors",
							q.id === selectedId ? "bg-muted" : "hover:bg-muted/60",
							dragging &&
								over === i &&
								"before:absolute before:inset-x-1 before:-top-[3px] before:h-0.5 before:rounded-full before:bg-brand",
							dragging &&
								over === i + 1 &&
								i === questions.length - 1 &&
								"after:absolute after:inset-x-1 after:-bottom-[3px] after:h-0.5 after:rounded-full after:bg-brand",
						)}
						data-testid="question-row"
					>
						<button
							type="button"
							onClick={() => onSelect(q.id)}
							aria-current={q.id === selectedId ? "true" : undefined}
							className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
						>
							<span className="mt-px grid size-5 shrink-0 place-items-center rounded-md bg-background font-semibold text-[11px] shadow-xs">
								{i + 1}
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate font-medium text-sm">
									{q.prompt}
								</span>
								<span className="mt-0.5 flex items-center gap-1 text-muted-foreground text-xs">
									<span
										className={cn(KIND_ICON[q.kind], "size-3")}
										aria-hidden="true"
									/>
									{KIND_LABEL[q.kind]}
									{q.required && " · required"}
								</span>
							</span>
						</button>
						<Menu>
							<MenuTrigger
								render={
									<Button
										variant="ghost"
										size="icon-xs"
										className="mt-1.5 mr-1 text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-popup-open:opacity-100"
										aria-label={`Question ${i + 1} options`}
									/>
								}
							>
								<span
									className="icon-[solar--menu-dots-bold] size-3.5"
									aria-hidden="true"
								/>
							</MenuTrigger>
							<MenuContent align="end">
								<MenuItem
									icon="icon-[solar--arrow-up-linear]"
									disabled={i === 0}
									onSelect={() => void onMove(q, i - 1)}
								>
									Move up
								</MenuItem>
								<MenuItem
									icon="icon-[solar--arrow-down-linear]"
									disabled={i === questions.length - 1}
									onSelect={() => void onMove(q, i + 1)}
								>
									Move down
								</MenuItem>
								<MenuSeparator />
								<MenuItem
									icon="icon-[solar--trash-bin-minimalistic-linear]"
									danger
									onSelect={() => onDelete(q)}
								>
									Delete
								</MenuItem>
							</MenuContent>
						</Menu>
					</li>
				))}
			</ol>
			<button
				type="button"
				onClick={onSettings}
				className="flex items-start gap-2.5 border-t px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
				data-testid="result-screen"
			>
				<span
					className="icon-[solar--cup-star-linear] mt-0.5 size-4 shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
				<span>
					<span className="block font-medium text-sm">Result screen</span>
					<span className="block text-muted-foreground text-xs">
						Pass mark and passed / failed messages
					</span>
				</span>
			</button>
		</nav>
	);
}
