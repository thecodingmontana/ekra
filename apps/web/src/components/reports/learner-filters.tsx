import { Button } from "@ekra/ui/components/button";
import {
	Menu,
	MenuContent,
	MenuItem,
	MenuLabel,
	MenuSeparator,
	MenuTrigger,
} from "@ekra/ui/components/menu";
import { Chip } from "@/components/library/filter-bar";
import type { ReportContent } from "@/graphql/report";
import { KINDS } from "@/lib/content-kinds";
import { ROLE_LABEL } from "@/lib/members";
import {
	FILTER_ROLES,
	LEARNER_STATUSES,
	type LearnerFilters,
} from "@/lib/reports";

/** The learners table's filters in use as chips, "Clear all", and "Add filter" (status, role, learning content). */
export function LearnerFilterBar({
	filters,
	content,
	onChange,
}: {
	filters: LearnerFilters;
	/** what can be picked under "Learning content" */
	content: readonly ReportContent[];
	onChange: (filters: LearnerFilters) => void;
}) {
	const { status, role, content: contentId } = filters;
	const set = (patch: LearnerFilters) => onChange({ ...filters, ...patch });
	const picked = content.find((c) => c.id === contentId);

	return (
		<>
			<Menu>
				<MenuTrigger
					render={
						<Button variant="outline" size="sm" data-testid="add-filter" />
					}
				>
					<span
						className="icon-[solar--filter-linear] size-3.5"
						aria-hidden="true"
					/>
					Add filter
				</MenuTrigger>
				<MenuContent align="start" width={240}>
					<MenuLabel>Status</MenuLabel>
					{LEARNER_STATUSES.map(([k, label]) => (
						<MenuItem
							key={k}
							checked={status === k}
							onSelect={() => set({ status: status === k ? undefined : k })}
						>
							{label}
						</MenuItem>
					))}
					<MenuSeparator />
					<MenuLabel>Role</MenuLabel>
					{FILTER_ROLES.map((k) => (
						<MenuItem
							key={k}
							checked={role === k}
							onSelect={() => set({ role: role === k ? undefined : k })}
						>
							{ROLE_LABEL[k]}
						</MenuItem>
					))}
					<MenuSeparator />
					<MenuLabel>Learning content</MenuLabel>
					{content.map((c) => (
						<MenuItem
							key={c.id}
							icon={KINDS[c.kind].icon}
							checked={contentId === c.id}
							onSelect={() =>
								set({ content: contentId === c.id ? undefined : c.id })
							}
						>
							<span className="min-w-0 truncate">{c.title}</span>
						</MenuItem>
					))}
					{!content.length && (
						<MenuItem disabled onSelect={() => {}}>
							<span className="text-muted-foreground">
								Nothing assigned yet
							</span>
						</MenuItem>
					)}
				</MenuContent>
			</Menu>
			{status && (
				<Chip
					label="Status"
					value={LEARNER_STATUSES.find(([k]) => k === status)?.[1] ?? status}
					onClear={() => set({ status: undefined })}
					testId="chip-status"
				/>
			)}
			{role && (
				<Chip
					label="Role"
					value={ROLE_LABEL[role]}
					onClear={() => set({ role: undefined })}
					testId="chip-role"
				/>
			)}
			{contentId && (
				<Chip
					label="Learning content"
					value={picked?.title ?? "Not assigned to anyone"}
					onClear={() => set({ content: undefined })}
					testId="chip-content"
				/>
			)}
			{(status || role || contentId) && (
				<Button
					variant="ghost"
					size="sm"
					className="text-brand hover:text-brand"
					onClick={() => onChange({})}
					data-testid="filters-clear"
				>
					Clear all
				</Button>
			)}
		</>
	);
}
