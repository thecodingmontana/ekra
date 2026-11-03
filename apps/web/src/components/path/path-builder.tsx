import { Button } from "@ekra/ui/components/button";
import {
	Menu,
	MenuContent,
	MenuItem,
	MenuSeparator,
	MenuTrigger,
} from "@ekra/ui/components/menu";
import { ConfirmModal } from "@ekra/ui/components/modal";
import { cn } from "@ekra/ui/lib/utils";
import { useState } from "react";
import { InlineTitle } from "@/components/course/inline-title";
import type { LearningPath, PathStage } from "@/graphql/path";
import { dropPosition } from "@/lib/course-outline";
import { allSteps, stepTarget } from "@/lib/path-outline";
import { LibraryPicker } from "./library-picker";
import { PathStepRow } from "./path-step-row";
import { type PathEdits, usePathEdits } from "./use-path-edits";

type Over = { stageId: string; beforeId: string | null };

/** The path for its trainers: stages and the library items in them, added, renamed, reordered and removed here. */
export function PathBuilder({
	slug,
	path,
}: {
	slug: string;
	path: LearningPath;
}) {
	const edits = usePathEdits(slug, path.id);
	const [renaming, setRenaming] = useState<string | null>(null);
	const [dragging, setDragging] = useState<string | null>(null);
	const [over, setOver] = useState<Over | null>(null);
	const [doomed, setDoomed] = useState<PathStage | null>(null);
	// the stage content is being added to
	const [addingTo, setAddingTo] = useState<string | null>(null);
	const stepCount = allSteps(path).length;

	const addStage = async () => {
		const id = await edits.addStage(`Stage ${path.stages.length + 1}`);
		if (id) setRenaming(id);
	};

	const drop = () => {
		if (!dragging || !over) return;
		const target = path.stages.find((s) => s.id === over.stageId);
		setDragging(null);
		setOver(null);
		if (!target) return;
		const ids = target.steps.map((s) => s.id);
		const position = dropPosition(ids, dragging, over.beforeId);
		// dropped where it already is
		if (ids.indexOf(dragging) === position) return;
		void edits.moveStep(dragging, target.id, position);
	};

	return (
		<section className="flex flex-col gap-3" data-testid="path-builder">
			<div className="flex items-center gap-2">
				<h2 className="m-0 font-semibold text-md">Path outline</h2>
				<span className="text-muted-foreground text-sm">
					{path.stages.length} {path.stages.length === 1 ? "stage" : "stages"} ·{" "}
					{stepCount} {stepCount === 1 ? "item" : "items"}
				</span>
				<Button
					variant="outline"
					className="ml-auto"
					onClick={() => void addStage()}
					data-testid="add-stage"
				>
					<span
						className="icon-[solar--add-circle-linear] size-3.5"
						aria-hidden="true"
					/>
					Add stage
				</Button>
			</div>
			<label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
				<input
					type="checkbox"
					checked={path.sequential}
					onChange={(e) => void edits.setSequential(e.target.checked)}
					className="size-4 accent-brand"
					data-testid="sequential"
				/>
				<span>
					Take in order
					<span className="text-muted-foreground">
						{" "}
						· each item unlocks when the ones before it are done
					</span>
				</span>
			</label>

			{path.stages.length === 0 && (
				<div className="flex flex-col items-center gap-1.5 rounded-[10px] border border-dashed px-6 py-14 text-center">
					<span
						className="icon-[solar--routing-2-linear] mb-1 size-[22px] text-muted-foreground/70"
						aria-hidden="true"
					/>
					<h3 className="m-0 font-semibold text-md">Start with a stage</h3>
					<p className="m-0 max-w-[380px] text-muted-foreground text-sm">
						Stages group the path's content. Each holds courses, pages, quizzes,
						wikis or assignments from the library.
					</p>
				</div>
			)}

			{path.stages.map((stage, si) => (
				<StageCard
					key={stage.id}
					slug={slug}
					path={path}
					stage={stage}
					index={si}
					edits={edits}
					renaming={renaming === stage.id}
					setRenaming={setRenaming}
					over={dragging ? over : null}
					setOver={setOver}
					setDragging={setDragging}
					onDrop={drop}
					onDelete={() => setDoomed(stage)}
					onAdd={() => setAddingTo(stage.id)}
				/>
			))}

			<LibraryPicker
				slug={slug}
				excludeIds={new Set(allSteps(path).map((s) => s.content.id))}
				title="Add content"
				sub="Courses, pages, quizzes, wikis and assignments from the library. Each goes in the path once."
				empty="Everything that can go in a path is in it already. Create more in the library, then add it here."
				open={!!addingTo}
				onOpenChange={(o) => !o && setAddingTo(null)}
				onPick={(item) =>
					addingTo ? edits.addStep(addingTo, item.id) : Promise.resolve()
				}
			/>
			<ConfirmModal
				open={!!doomed}
				onOpenChange={(o) => !o && setDoomed(null)}
				danger
				title={`Delete ${doomed?.title ?? ""}?`}
				body="The stage leaves the path with its items. The content itself stays in the library, with learners' progress on it."
				ok="Delete stage"
				onConfirm={async () => {
					if (!doomed) return;
					await edits.deleteStage(doomed.id);
					setDoomed(null);
				}}
			/>
		</section>
	);
}

function StageCard({
	slug,
	path,
	stage,
	index,
	edits,
	renaming,
	setRenaming,
	over,
	setOver,
	setDragging,
	onDrop,
	onDelete,
	onAdd,
}: {
	slug: string;
	path: LearningPath;
	stage: PathStage;
	index: number;
	edits: PathEdits;
	renaming: boolean;
	setRenaming: (id: string | null) => void;
	over: Over | null;
	setOver: (over: Over | null) => void;
	setDragging: (id: string | null) => void;
	onDrop: () => void;
	onDelete: () => void;
	onAdd: () => void;
}) {
	const overHere = over?.stageId === stage.id;
	const move = (id: string, dir: 1 | -1) => {
		const to = stepTarget(path, id, dir);
		return to ? () => void edits.moveStep(id, to.stageId, to.position) : null;
	};

	return (
		<div
			className={cn(
				"rounded-[10px] border bg-card transition-shadow",
				overHere && "ring-2 ring-brand/30",
			)}
			data-testid="builder-stage"
		>
			<div className="flex items-center gap-2 px-3 py-2">
				<span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
					Stage {index + 1}
				</span>
				{renaming ? (
					<InlineTitle
						value={stage.title}
						label="Stage title"
						onSave={(t) => edits.renameStage(stage.id, t)}
						onDone={() => setRenaming(null)}
						className="font-semibold"
					/>
				) : (
					<button
						type="button"
						className="min-w-0 flex-1 truncate text-left font-semibold"
						onClick={() => setRenaming(stage.id)}
						title="Rename"
						data-testid="stage-title"
					>
						{stage.title}
					</button>
				)}
				<span className="ml-auto shrink-0 text-muted-foreground text-xs">
					{stage.steps.length} {stage.steps.length === 1 ? "item" : "items"}
				</span>
				<Menu>
					<MenuTrigger
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Actions for ${stage.title}`}
								className="text-muted-foreground"
							/>
						}
					>
						<span
							className="icon-[solar--menu-dots-bold] size-4"
							aria-hidden="true"
						/>
					</MenuTrigger>
					<MenuContent>
						<MenuItem
							icon="icon-[solar--pen-linear]"
							onSelect={() => setRenaming(stage.id)}
						>
							Rename
						</MenuItem>
						<MenuSeparator />
						<MenuItem
							icon="icon-[solar--trash-bin-minimalistic-linear]"
							danger
							onSelect={onDelete}
						>
							Delete stage
						</MenuItem>
					</MenuContent>
				</Menu>
			</div>
			<ul
				className="m-0 list-none p-0"
				onDragOver={(e) => {
					e.preventDefault();
					setOver({ stageId: stage.id, beforeId: null });
				}}
				onDrop={(e) => {
					e.preventDefault();
					onDrop();
				}}
			>
				{stage.steps.map((step, i) => (
					<PathStepRow
						key={step.id}
						slug={slug}
						step={step}
						dropBefore={overHere && over?.beforeId === step.id}
						onMove={{ up: move(step.id, -1), down: move(step.id, 1) }}
						onRemove={() => void edits.removeStep(step.id)}
						onDragStart={() => setDragging(step.id)}
						onDragEnd={() => {
							setDragging(null);
							setOver(null);
						}}
						onDragOver={(after) =>
							setOver({
								stageId: stage.id,
								beforeId: after ? (stage.steps[i + 1]?.id ?? null) : step.id,
							})
						}
					/>
				))}
				<li
					className={cn(
						"relative flex flex-wrap items-center gap-1.5 border-border/60 border-t px-3 py-2",
						overHere &&
							over?.beforeId === null &&
							"before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded-full before:bg-brand",
					)}
				>
					{stage.steps.length === 0 && (
						<span className="mr-auto text-muted-foreground text-sm">
							Nothing in this stage yet.
						</span>
					)}
					<Button
						size="sm"
						variant="ghost"
						onClick={onAdd}
						data-testid="add-content"
					>
						<span
							className="icon-[solar--add-circle-linear] size-3.5"
							aria-hidden="true"
						/>
						Add content
					</Button>
				</li>
			</ul>
		</div>
	);
}
