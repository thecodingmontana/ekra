import { buttonVariants } from "@ekra/ui/components/button";
import { cn } from "@ekra/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import type { LearningPath, PathStep } from "@/graphql/path";
import { KINDS } from "@/lib/content-kinds";
import { allSteps, nextStep } from "@/lib/path-outline";

/** A path as learners see it: overall progress, Start or Continue, and its stages with each item's progress. */
export function PathLanding({
	slug,
	path,
}: {
	slug: string;
	path: LearningPath;
}) {
	const steps = allSteps(path);
	const done = steps.filter((s) => s.percent >= 100).length;
	const next = nextStep(path);
	const cta = done === 0 ? "Start path" : "Continue";

	return (
		<section className="flex flex-col gap-5" data-testid="path-landing">
			<div className="flex flex-wrap items-center gap-4 rounded-[10px] border bg-card px-4 py-3.5">
				<div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
					<span className="text-sm">
						<b className="font-semibold" data-testid="path-percent">
							{path.percent}%
						</b>
						<span className="text-muted-foreground">
							{" "}
							done · {done} of {steps.length}{" "}
							{steps.length === 1 ? "item" : "items"} finished
						</span>
					</span>
					<Bar percent={path.percent} label="Path progress" />
				</div>
				{next ? (
					<Link
						to="/o/$slug/library/$id"
						params={{ slug, id: next.content.id }}
						className={buttonVariants({ size: "lg" })}
						data-testid="start-path"
					>
						{cta}
						<span
							className="icon-[solar--arrow-right-linear] size-4"
							aria-hidden="true"
						/>
					</Link>
				) : (
					<span className="text-muted-foreground text-sm">
						{steps.length
							? done === steps.length
								? "You've finished this path."
								: "Nothing is open yet."
							: "Nothing in this path yet. Check back soon."}
					</span>
				)}
			</div>

			<div className="flex flex-col gap-1">
				<h2 className="m-0 font-semibold text-md">Path content</h2>
				<p className="m-0 text-muted-foreground text-sm">
					{path.stages.length} {path.stages.length === 1 ? "stage" : "stages"} ·{" "}
					{steps.length} {steps.length === 1 ? "item" : "items"}
					{path.sequential && " · taken in order"}
				</p>
			</div>
			<div className="overflow-hidden rounded-[10px] border bg-card">
				{path.stages.map((stage, si) => (
					<details
						key={stage.id}
						open
						className="group border-b last:border-b-0"
					>
						<summary className="flex cursor-pointer list-none items-center gap-2 bg-muted/40 px-4 py-2.5 font-semibold text-sm [&::-webkit-details-marker]:hidden">
							<span className="shrink-0 whitespace-nowrap font-mono font-normal text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
								Stage {si + 1}
							</span>
							<span className="min-w-0 flex-1 truncate">{stage.title}</span>
							<span className="font-normal text-muted-foreground text-xs">
								{stage.steps.length}{" "}
								{stage.steps.length === 1 ? "item" : "items"}
							</span>
							<span
								className="icon-[solar--alt-arrow-down-linear] size-3.5 text-muted-foreground transition-transform group-open:rotate-180"
								aria-hidden="true"
							/>
						</summary>
						<ul className="m-0 list-none p-0">
							{stage.steps.map((step) => (
								<li
									key={step.id}
									className="border-border/60 border-t"
									data-testid="path-step"
								>
									{step.locked ? (
										<div
											className="flex min-h-11 items-center gap-2.5 px-4 py-2 text-muted-foreground text-sm"
											title="Finish the items before this one first"
											data-testid="locked-step"
										>
											<StepLine step={step} />
										</div>
									) : (
										<Link
											to="/o/$slug/library/$id"
											params={{ slug, id: step.content.id }}
											className="flex min-h-11 items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-muted/50"
										>
											<StepLine step={step} />
										</Link>
									)}
								</li>
							))}
						</ul>
					</details>
				))}
			</div>
		</section>
	);
}

/** A step's icon (done, locked or its kind), title, kind and progress. */
function StepLine({ step }: { step: PathStep }) {
	const k = KINDS[step.content.kind];
	const done = step.percent >= 100;
	const [icon, label] = done
		? ["icon-[solar--check-circle-bold] text-brand", "Done"]
		: step.locked
			? ["icon-[solar--lock-keyhole-minimalistic-linear]", "Locked"]
			: [cn(k.icon, "text-muted-foreground"), null];
	return (
		<>
			<span
				className={cn(icon, "size-4 shrink-0")}
				{...(label
					? { role: "img", "aria-label": label }
					: { "aria-hidden": true })}
			/>
			<span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
				<span className="truncate">{step.content.title}</span>
				<span className="text-muted-foreground text-xs sm:ml-auto">
					{k.label}
				</span>
			</span>
			<span className="flex w-[84px] shrink-0 items-center gap-2">
				<Bar
					percent={step.percent}
					label={`${step.content.title} progress`}
					className="flex-1"
				/>
				<span className="w-8 text-right text-muted-foreground text-xs tabular-nums">
					{step.percent}%
				</span>
			</span>
		</>
	);
}

function Bar({
	percent,
	label,
	className,
}: {
	percent: number;
	label: string;
	className?: string;
}) {
	return (
		<div
			className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}
			role="progressbar"
			aria-label={label}
			aria-valuenow={percent}
			aria-valuemin={0}
			aria-valuemax={100}
		>
			<div
				className="h-full rounded-full bg-brand"
				style={{ width: `${percent}%` }}
			/>
		</div>
	);
}
