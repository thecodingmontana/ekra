import { useQuery } from "@apollo/client/react";
import { dateTime } from "@ekra/core";
import { Av } from "@ekra/ui/components/av";
import { Sheet } from "@ekra/ui/components/modal";
import { cn } from "@ekra/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { StatusRing } from "@/components/progress-ring";
import {
	LEARNER_DETAIL,
	type LearnerAssignment,
	type LearnerDetailData,
} from "@/graphql/report";
import { KINDS } from "@/lib/content-kinds";
import { mainRole, ROLE_LABEL } from "@/lib/members";
import { ActivityLine, EmptyLine, TableSkeleton } from "./report-bits";

/** One person's side sheet: who they are, what they've been given, and what they did lately. */
export function LearnerSheet({
	slug,
	userId,
	onClose,
}: {
	slug: string;
	/** the person shown; none closes the sheet */
	userId: string | undefined;
	onClose: () => void;
}) {
	// keep showing the last person while the sheet slides away
	const [shown, setShown] = useState(userId);
	if (userId && userId !== shown) setShown(userId);
	const { data, loading } = useQuery<LearnerDetailData>(LEARNER_DETAIL, {
		variables: { slug, userId: shown ?? "" },
		skip: !shown,
	});
	const detail = data?.learnerDetail;

	return (
		<Sheet
			open={!!userId}
			onOpenChange={(o) => !o && onClose()}
			title={detail?.person.name ?? "Learner"}
			testId="learner-sheet"
			header={
				detail && (
					<div className="flex min-w-0 items-center gap-3">
						<Av
							name={detail.person.name}
							image={detail.person.image}
							size="lg"
						/>
						<div className="min-w-0">
							<p className="truncate font-semibold text-md">
								{detail.person.name}
							</p>
							<p className="flex min-w-0 flex-wrap gap-x-2 text-muted-foreground text-xs">
								<span>{ROLE_LABEL[mainRole(detail.person.role)]}</span>
								<span aria-hidden="true">·</span>
								<a
									href={`mailto:${detail.email}`}
									className="min-w-0 break-all underline-offset-2 hover:underline"
								>
									{detail.email}
								</a>
							</p>
						</div>
					</div>
				)
			}
		>
			{!detail ? (
				loading || !data ? (
					<div className="p-4">
						<TableSkeleton rows={4} />
					</div>
				) : (
					<EmptyLine icon="icon-[solar--user-cross-linear]">
						This person isn't a member of this organization.
					</EmptyLine>
				)
			) : (
				<div className="flex flex-col gap-5 px-4 py-4">
					<section aria-labelledby="sheet-assigned">
						<h3 id="sheet-assigned" className="mb-2 font-semibold text-sm">
							Assigned{" "}
							<span className="font-normal text-muted-foreground">
								{detail.assignments.length}
							</span>
						</h3>
						{detail.assignments.length > 0 ? (
							<ul className="flex flex-col rounded-[10px] border">
								{detail.assignments.map((a) => (
									<AssignmentLine key={a.content.id} slug={slug} a={a} />
								))}
							</ul>
						) : (
							<EmptyLine icon="icon-[solar--clipboard-list-linear]">
								Nothing assigned yet.
							</EmptyLine>
						)}
					</section>
					<section aria-labelledby="sheet-activity">
						<h3 id="sheet-activity" className="mb-1 font-semibold text-sm">
							Recent activity
						</h3>
						{detail.recent.length > 0 ? (
							<ul className="-mx-1 flex flex-col">
								{detail.recent.map((e) => (
									<ActivityLine
										key={`${e.at}-${e.kind}-${e.content.id}`}
										slug={slug}
										event={e}
										hidePerson
									/>
								))}
							</ul>
						) : (
							<EmptyLine icon="icon-[solar--history-linear]">
								No activity yet.
							</EmptyLine>
						)}
					</section>
				</div>
			)}
		</Sheet>
	);
}

function AssignmentLine({ slug, a }: { slug: string; a: LearnerAssignment }) {
	const kind = KINDS[a.content.kind];
	return (
		<li
			className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-3 py-2.5 first:border-t-0"
			data-testid="sheet-assignment"
		>
			<span
				className={cn(
					"grid size-7 shrink-0 place-items-center rounded-md",
					kind.tint,
				)}
				aria-hidden="true"
			>
				<span className={cn(kind.icon, "size-4")} />
			</span>
			<span className="flex min-w-0 flex-1 basis-40 flex-col">
				<Link
					to="/o/$slug/library/$id"
					params={{ slug, id: a.content.id }}
					className="truncate font-medium text-sm underline-offset-2 hover:underline"
				>
					{a.content.title}
				</Link>
				<span
					className="truncate text-muted-foreground text-xs"
					suppressHydrationWarning
				>
					{kind.label} · {a.dueAt ? `Due ${dateTime(a.dueAt)}` : "No due date"}
				</span>
			</span>
			<StatusRing status={a.status} percent={a.percent} />
		</li>
	);
}
