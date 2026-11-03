import { cn } from "@ekra/ui/lib/utils";
import { type Area, type Point, toFraction } from "@/lib/quiz-builder";
import { addClick } from "@/lib/quiz-player";
import { boxStyle } from "./hotspot-editor";

export type HotspotData = { image: string; clickCount: number };

/** Hotspot for a learner: click the picture to place markers (click a marker to remove it); `right` shows the areas. */
export function AnswerHotspot({
	data,
	value,
	onChange,
	locked,
	right,
}: {
	data: HotspotData;
	value: Point[];
	onChange: (value: Point[]) => void;
	locked?: boolean;
	right?: Area[];
}) {
	const full = value.length >= data.clickCount;
	return (
		<div>
			{!locked && (
				<p className="m-0 mb-3 text-muted-foreground text-sm">
					Click{" "}
					{data.clickCount === 1
						? "the right place"
						: `the ${data.clickCount} right places`}{" "}
					on the picture. Click a marker to take it away.{" "}
					<span className="tabular-nums">
						{value.length} / {data.clickCount}
					</span>
				</p>
			)}
			<div
				className={cn(
					"relative select-none overflow-hidden rounded-[10px] border bg-muted",
					!locked && !full && "cursor-crosshair",
				)}
				onPointerUp={(e) => {
					if (locked || e.target !== e.currentTarget.firstChild) return;
					onChange(
						addClick(
							value,
							toFraction(
								e.clientX,
								e.clientY,
								e.currentTarget.getBoundingClientRect(),
							),
							data.clickCount,
						),
					);
				}}
				data-testid="hotspot-answer"
			>
				<img
					src={data.image}
					alt="Where to click"
					draggable={false}
					className="block h-auto w-full"
				/>
				{right?.map((a, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: areas have no ids
						key={i}
						style={boxStyle(a)}
						className="pointer-events-none absolute rounded-[4px] border-2 border-tint-green bg-tint-green/15"
					/>
				))}
				{value.map((p, i) => (
					<button
						// biome-ignore lint/suspicious/noArrayIndexKey: markers have no ids
						key={i}
						type="button"
						disabled={locked}
						aria-label={`Marker ${i + 1}, remove it`}
						onClick={() => onChange(value.filter((_, j) => j !== i))}
						style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
						className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-brand font-semibold text-brand-foreground text-xs shadow-[0_2px_8px_rgba(0,0,0,0.35)] outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/60 enabled:hover:scale-110"
						data-testid="hotspot-marker"
					>
						{i + 1}
					</button>
				))}
			</div>
		</div>
	);
}
