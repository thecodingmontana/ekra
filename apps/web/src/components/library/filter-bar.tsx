import { Button } from "@ekra/ui/components/button";
import {
	Menu,
	MenuContent,
	MenuItem,
	MenuLabel,
	MenuSeparator,
	MenuTrigger,
} from "@ekra/ui/components/menu";
import { cn } from "@ekra/ui/lib/utils";

export type LibraryStatus = "all" | "published" | "draft";

const STATUSES: [Exclude<LibraryStatus, "all">, string][] = [
	["published", "Published"],
	["draft", "Drafts"],
];

/** A filter in use: what it is, and × to drop it. */
function Chip({
	label,
	value,
	onClear,
	testId,
}: {
	label: string;
	value: string;
	onClear: () => void;
	testId: string;
}) {
	return (
		<span
			className="inline-flex h-[26px] max-w-full items-center gap-1 rounded-md border border-brand/30 bg-brand/8 pr-0.5 pl-2 text-sm"
			data-testid={testId}
		>
			<span className="truncate">
				<span className="text-muted-foreground">{label}:</span>{" "}
				<span className="font-medium">{value}</span>
			</span>
			<button
				type="button"
				aria-label={`Remove the ${label.toLowerCase()} filter`}
				onClick={onClear}
				className="grid size-5 shrink-0 place-items-center rounded-[4px] text-muted-foreground hover:bg-background hover:text-foreground"
			>
				<span
					className="icon-[hugeicons--cancel-01] size-3"
					aria-hidden="true"
				/>
			</button>
		</span>
	);
}

/** Active filters as chips, Reset, and "Add filter" (categories; status for people who manage content). */
export function FilterBar({
	tags,
	allTags,
	status,
	canManage,
	onTags,
	onStatus,
	onReset,
}: {
	tags: string[];
	/** every category in the library */
	allTags: string[];
	status: LibraryStatus;
	canManage: boolean;
	onTags: (tags: string[]) => void;
	onStatus: (status: LibraryStatus) => void;
	onReset: () => void;
}) {
	const chosen = new Set(tags.map((t) => t.toLowerCase()));
	const toggle = (t: string) =>
		onTags(
			chosen.has(t.toLowerCase())
				? tags.filter((x) => x.toLowerCase() !== t.toLowerCase())
				: [...tags, t],
		);
	const active = tags.length > 0 || status !== "all";

	return (
		<>
			{tags.length > 0 && (
				<Chip
					label="Category"
					value={tags.join(", ")}
					onClear={() => onTags([])}
					testId="chip-category"
				/>
			)}
			{status !== "all" && (
				<Chip
					label="Status"
					value={STATUSES.find(([k]) => k === status)?.[1] ?? status}
					onClear={() => onStatus("all")}
					testId="chip-status"
				/>
			)}
			{active && (
				<Button
					variant="ghost"
					size="sm"
					className="text-brand hover:text-brand"
					onClick={onReset}
					data-testid="filters-reset"
				>
					Reset
				</Button>
			)}
			<Menu>
				<MenuTrigger
					render={<Button variant="ghost" size="sm" data-testid="add-filter" />}
				>
					<span
						className="icon-[solar--filter-linear] size-3.5"
						aria-hidden="true"
					/>
					Add filter
				</MenuTrigger>
				<MenuContent align="start" width={220}>
					<MenuLabel>Category</MenuLabel>
					{allTags.map((t) => (
						<MenuItem
							key={t}
							icon="icon-[solar--tag-linear]"
							checked={chosen.has(t.toLowerCase())}
							onSelect={() => toggle(t)}
							keepOpen
						>
							<span className="truncate">{t}</span>
						</MenuItem>
					))}
					{!allTags.length && (
						<MenuItem disabled onSelect={() => {}}>
							<span className="text-muted-foreground">No categories yet</span>
						</MenuItem>
					)}
					{canManage && (
						<>
							<MenuSeparator />
							<MenuLabel>Status</MenuLabel>
							{STATUSES.map(([k, n]) => (
								<MenuItem
									key={k}
									icon={
										k === "published"
											? "icon-[solar--check-circle-linear]"
											: "icon-[solar--pen-linear]"
									}
									checked={status === k}
									onSelect={() => onStatus(status === k ? "all" : k)}
									keepOpen
								>
									{n}
								</MenuItem>
							))}
						</>
					)}
				</MenuContent>
			</Menu>
		</>
	);
}

/** A small dropdown that picks one value (filters and sort). */
export function Pick({
	label,
	value,
	options,
	onChange,
	prefix = "",
	testId,
}: {
	label: string;
	value: string;
	options: readonly (readonly [string, string, ...string[]])[];
	onChange: (value: string) => void;
	prefix?: string;
	testId?: string;
}) {
	const current = options.find(([k]) => k === value)?.[1] ?? "";
	return (
		<Menu>
			<MenuTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						className="font-normal"
						aria-label={`${label}: ${current}`}
						data-testid={testId}
					/>
				}
			>
				{prefix}
				{current}
				<span
					className="icon-[solar--alt-arrow-down-linear] size-3.5 opacity-60"
					aria-hidden="true"
				/>
			</MenuTrigger>
			<MenuContent align="start" width={200}>
				{options.map(([k, n, icon]) => (
					<MenuItem
						key={k}
						icon={icon}
						checked={k === value}
						onSelect={() => onChange(k)}
					>
						{n}
					</MenuItem>
				))}
			</MenuContent>
		</Menu>
	);
}

const LAYOUTS = [
	["grid", "Grid", "icon-[solar--widget-linear]"],
	["list", "List", "icon-[solar--list-linear]"],
] as const;

/** Grid or list. */
export function LayoutToggle({
	view,
	onChange,
}: {
	view: "grid" | "list";
	onChange: (view: "grid" | "list") => void;
}) {
	return (
		<fieldset className="inline-flex gap-0.5 rounded-md bg-muted p-0.5">
			<legend className="sr-only">Layout</legend>
			{LAYOUTS.map(([k, n, icon]) => (
				<button
					key={k}
					type="button"
					aria-pressed={view === k}
					aria-label={n}
					data-testid={`layout-${k}`}
					onClick={() => onChange(k)}
					className={cn(
						"inline-flex h-6 items-center gap-[5px] rounded-[5px] px-[9px] font-medium text-xs transition-colors duration-140",
						view === k
							? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)]"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					<span className={cn(icon, "size-[13px]")} aria-hidden="true" />
					<span className="hidden sm:inline">{n}</span>
				</button>
			))}
		</fieldset>
	);
}
