import { Button } from "@ekra/ui/components/button";
import { useState } from "react";
import {
	type Area,
	areaBetween,
	type Point,
	toFraction,
} from "@/lib/quiz-builder";
import { FieldLabel, PictureButton } from "./controls";

export type HotspotPayload = { image: string; areas: Area[] };

/** A box drawn over a picture, placed in fractions of its size. */
export const boxStyle = (a: Area) => ({
	left: `${a.x * 100}%`,
	top: `${a.y * 100}%`,
	width: `${a.w * 100}%`,
	height: `${a.h * 100}%`,
});

/** Hotspot: a picture with the right places to click drawn on it as boxes. */
export function HotspotEditor({
	slug,
	value,
	onChange,
}: {
	slug: string;
	value: HotspotPayload;
	onChange: (value: HotspotPayload) => void;
}) {
	const [start, setStart] = useState<Point | null>(null);
	const [now, setNow] = useState<Point | null>(null);
	const at = (e: React.PointerEvent<HTMLElement>) =>
		toFraction(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
	const drawing = start && now ? areaBetween(start, now, 0) : null;

	return (
		<div>
			<FieldLabel hint="Drag on the picture to mark each right place to click">
				Picture
			</FieldLabel>
			<div className="relative overflow-hidden rounded-lg border bg-muted">
				<div
					className="relative cursor-crosshair touch-none select-none"
					onPointerDown={(e) => {
						if (
							e.target !== e.currentTarget &&
							!(e.target instanceof HTMLImageElement)
						)
							return;
						e.currentTarget.setPointerCapture(e.pointerId);
						setStart(at(e));
						setNow(at(e));
					}}
					onPointerMove={(e) => start && setNow(at(e))}
					onPointerUp={(e) => {
						const area = start ? areaBetween(start, at(e)) : null;
						setStart(null);
						setNow(null);
						if (area && value.areas.length < 10)
							onChange({ ...value, areas: [...value.areas, area] });
					}}
					onPointerCancel={() => {
						setStart(null);
						setNow(null);
					}}
					data-testid="hotspot-canvas"
				>
					<img
						src={value.image}
						alt="Where learners click"
						draggable={false}
						className="block h-auto w-full"
					/>
					{value.areas.map((a, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: areas have no ids
							key={i}
							style={boxStyle(a)}
							className="absolute rounded-[4px] border-2 border-brand bg-brand/20"
							data-testid="hotspot-area"
						>
							<span className="absolute -top-2.5 -left-2.5 grid size-5 place-items-center rounded-full bg-brand font-semibold text-[11px] text-brand-foreground">
								{i + 1}
							</span>
							<button
								type="button"
								aria-label={`Remove area ${i + 1}`}
								onPointerDown={(e) => e.stopPropagation()}
								onClick={() =>
									onChange({
										...value,
										areas: value.areas.filter((_, j) => j !== i),
									})
								}
								className="absolute -top-2.5 -right-2.5 grid size-5 place-items-center rounded-full bg-foreground text-background shadow"
								data-testid="remove-area"
							>
								<span
									className="icon-[solar--close-linear] size-3"
									aria-hidden="true"
								/>
							</button>
						</div>
					))}
					{drawing && (
						<div
							style={boxStyle(drawing)}
							className="pointer-events-none absolute rounded-[4px] border-2 border-brand border-dashed bg-brand/10"
						/>
					)}
				</div>
			</div>
			<div className="mt-2 flex flex-wrap items-center gap-2">
				<span className="text-muted-foreground text-sm">
					{value.areas.length === 0
						? "No areas yet"
						: `${value.areas.length} ${value.areas.length === 1 ? "area" : "areas"}: learners click each once`}
				</span>
				<span className="flex-1" />
				{value.areas.length > 0 && (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onChange({ ...value, areas: [] })}
					>
						Clear areas
					</Button>
				)}
				<PictureButton
					slug={slug}
					onPicked={(image) => onChange({ image, areas: [] })}
					testId="replace-hotspot-picture"
				>
					<span
						className="icon-[solar--refresh-linear] size-3.5"
						aria-hidden="true"
					/>
					Replace picture
				</PictureButton>
			</div>
		</div>
	);
}
