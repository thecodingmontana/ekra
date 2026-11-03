import { useMutation, useQuery } from "@apollo/client/react";
import { REMINDERS, type ReminderKind } from "@ekra/core";
import { Av } from "@ekra/ui/components/av";
import { Button } from "@ekra/ui/components/button";
import { InputWithIcon } from "@ekra/ui/components/input-with-icon";
import { ConfirmModal, Modal, ModalBody } from "@ekra/ui/components/modal";
import { Spinner } from "@ekra/ui/components/spinner";
import { toast } from "@ekra/ui/lib/toast";
import { cn } from "@ekra/ui/lib/utils";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import {
	ASSIGNEES,
	type AssigneesData,
	ENROLL,
	type Enrollment,
	type Member,
	REMIND_ENROLLMENTS,
	REMOVE_ENROLLMENTS,
	type RemindData,
	UPDATE_ENROLLMENTS,
} from "@/graphql/enrollment";
import {
	CONTENT,
	type ContentData,
	LIBRARY,
	type LibraryData,
} from "@/graphql/library";
import {
	assigneesCsv,
	fromLocalInput,
	STATUS_LABEL,
	sendAgainLabel,
	toLocalInput,
} from "@/lib/assignees";
import { mainRole, ROLE_LABEL } from "@/lib/members";
import { reportError } from "@/lib/report-error";
import { prime, reloadOnEnter } from "@/lib/routing";

export const Route = createFileRoute("/_authed/o/$slug/library/$id_/assignees")(
	{
		shouldReload: reloadOnEnter,
		loader: async ({ context, params }) => {
			const [{ data }, { data: lib }] = await Promise.all([
				prime<ContentData, { slug: string; id: string }>(context.apolloClient, {
					query: CONTENT,
					variables: { slug: params.slug, id: params.id },
				}),
				prime<LibraryData, { slug: string; archived: boolean }>(
					context.apolloClient,
					{ query: LIBRARY, variables: { slug: params.slug, archived: false } },
				),
			]);
			// only people who manage content see who has it
			if (!data?.content || !lib?.library.canManage) throw notFound();
			await prime(context.apolloClient, {
				query: ASSIGNEES,
				variables: { slug: params.slug, contentId: params.id },
			});
			return { title: data.content.title };
		},
		head: ({ loaderData, match }) => ({
			meta: [
				{
					title: `Assignees · ${loaderData?.title ?? "Content"} · ${match.context.membership.organization.name}`,
				},
			],
		}),
		component: AssigneesPage,
	},
);

/** The reminder messages, the same words the email uses. */
const REMINDER_CHOICES = (Object.keys(REMINDERS) as ReminderKind[]).map(
	(kind) => ({
		kind,
		title: REMINDERS[kind].label,
		body: REMINDERS[kind].body,
	}),
);

const CELL = "border-border/70 border-b px-2 py-[9px] text-left";
const HEAD = cn(CELL, "font-medium text-muted-foreground text-xs");
const CHECK = "size-3.5 accent-(--brand)";
const DATE_INPUT =
	"h-[30px] w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const errorText = (e: unknown) =>
	e instanceof Error ? e.message : "Something went wrong";
const fail = (title: string) => (e: unknown) => {
	reportError(e);
	toast.error(title, { desc: errorText(e) });
};
const people = (n: number) => `${n} ${n === 1 ? "learner" : "learners"}`;
const when = (iso: string) =>
	new Date(iso).toLocaleString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});

/** Re-renders every 30 seconds while something waits on the clock. */
function useNow(active: boolean) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!active) return;
		setNow(Date.now());
		const t = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(t);
	}, [active]);
	return now;
}

function AssigneesPage() {
	const { slug, id } = Route.useParams();
	const { data: content } = useQuery<ContentData>(CONTENT, {
		variables: { slug, id },
	});
	const variables = { slug, contentId: id };
	const { data } = useQuery<AssigneesData>(ASSIGNEES, { variables });
	const refetchQueries = [{ query: ASSIGNEES, variables }];
	const [remove] = useMutation(REMOVE_ENROLLMENTS, { refetchQueries });
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
	const [enrolling, setEnrolling] = useState(false);
	const [editing, setEditing] = useState(false);
	const [reminding, setReminding] = useState<readonly string[] | null>(null);
	const [removing, setRemoving] = useState(false);

	const enrollments = data?.enrollments ?? [];
	const members = data?.members ?? [];
	const byUser = new Map(members.map((m) => [m.id, m]));
	const now = useNow(enrollments.some((e) => e.remindAgainAt));
	const q = search.trim().toLowerCase();
	const shown = enrollments.filter(
		(e) =>
			!q ||
			e.user.name.toLowerCase().includes(q) ||
			byUser.get(e.user.id)?.email.toLowerCase().includes(q),
	);
	const chosen = enrollments.filter((e) => selected.has(e.id));
	const allShown = shown.length > 0 && shown.every((e) => selected.has(e.id));
	const roleOf = (e: Enrollment) => {
		const m = byUser.get(e.user.id);
		return m ? ROLE_LABEL[mainRole(m.role)] : "";
	};

	function toggle(ids: readonly string[], on: boolean) {
		setSelected((s) => {
			const next = new Set(s);
			for (const i of ids) on ? next.add(i) : next.delete(i);
			return next;
		});
	}

	function exportCsv() {
		const csv = assigneesCsv(
			shown.map((e) => ({
				name: e.user.name,
				email: byUser.get(e.user.id)?.email ?? "",
				role: roleOf(e),
				startAt: e.startAt,
				dueAt: e.dueAt,
				status: e.status,
				percent: e.percent,
			})),
		);
		const url = URL.createObjectURL(
			new Blob([csv], { type: "text/csv;charset=utf-8" }),
		);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${(content?.content?.title ?? "assignees").replace(/[\\/:*?"<>|]+/g, "-")} assignees.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	return (
		<main className="mx-auto w-full min-w-0 max-w-[1080px] px-4 pt-5 pb-28 sm:px-6 sm:pt-7">
			<nav
				className="mb-5 flex min-w-0 items-center gap-2 text-muted-foreground text-sm"
				aria-label="Where you are"
			>
				<Link
					to="/o/$slug/library/$id"
					params={{ slug, id }}
					className="flex min-w-0 items-center gap-1.5 transition-colors hover:text-foreground"
					data-testid="assignees-back"
				>
					<span
						className="icon-[solar--alt-arrow-left-linear] size-3.5 shrink-0"
						aria-hidden="true"
					/>
					<span className="truncate">{content?.content?.title ?? "Back"}</span>
				</Link>
			</nav>

			<header className="mb-4 flex flex-wrap items-center gap-3">
				<h1 className="flex items-center gap-2 font-semibold text-xl">
					All Assignees
					<span
						className="inline-flex h-5 items-center rounded-[5px] bg-muted px-1.5 font-medium text-muted-foreground text-xs"
						data-testid="assignees-count"
					>
						{enrollments.length}
					</span>
				</h1>
			</header>

			<div className="mb-3 flex flex-wrap items-center gap-2">
				<div className="min-w-0 flex-1 basis-56 sm:max-w-[320px]">
					<InputWithIcon
						icon="icon-[solar--magnifer-linear]"
						className="h-[30px]"
						placeholder="Search learners"
						aria-label="Search learners"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>
				<div className="ml-auto flex items-center gap-2">
					<Button
						variant="outline"
						onClick={exportCsv}
						disabled={shown.length === 0}
						data-testid="export-csv"
					>
						<span
							className="icon-[solar--download-minimalistic-linear] size-3.5"
							aria-hidden="true"
						/>
						Export CSV
					</Button>
					<Button onClick={() => setEnrolling(true)} data-testid="enroll-open">
						<span
							className="icon-[solar--user-plus-linear] size-3.5"
							aria-hidden="true"
						/>
						Enroll Learner
					</Button>
				</div>
			</div>

			<div className="relative overflow-x-auto rounded-[10px] border bg-card">
				<table className="w-full min-w-[760px] border-collapse text-sm">
					<thead>
						<tr>
							<th className={cn(CELL, "w-9 pl-3.5")}>
								<input
									type="checkbox"
									className={CHECK}
									aria-label="Select all"
									checked={allShown}
									onChange={(e) =>
										toggle(
											shown.map((s) => s.id),
											e.target.checked,
										)
									}
								/>
							</th>
							<th className={HEAD}>Full name</th>
							<th className={HEAD}>Start date</th>
							<th className={HEAD}>Due date</th>
							<th className={HEAD}>Status</th>
							<th className={CELL}>
								<span className="sr-only">Actions</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{shown.map((e) => {
							const wait = sendAgainLabel(e.remindAgainAt, now);
							return (
								<tr
									key={e.id}
									data-testid="assignee-row"
									className={cn(selected.has(e.id) && "bg-muted/50")}
								>
									<td className={cn(CELL, "pl-3.5")}>
										<input
											type="checkbox"
											className={CHECK}
											aria-label={`Select ${e.user.name}`}
											checked={selected.has(e.id)}
											onChange={(ev) => toggle([e.id], ev.target.checked)}
										/>
									</td>
									<td className={CELL}>
										<span className="flex items-center gap-2.5">
											<Av name={e.user.name} image={e.user.image} size="md" />
											<span className="flex min-w-0 flex-col">
												<b className="truncate font-medium">{e.user.name}</b>
												<span className="truncate text-muted-foreground text-xs">
													{roleOf(e)}
												</span>
											</span>
										</span>
									</td>
									<td
										className={cn(CELL, "whitespace-nowrap")}
										suppressHydrationWarning
									>
										{when(e.startAt)}
									</td>
									<td
										className={cn(CELL, "whitespace-nowrap")}
										data-testid="assignee-due"
										suppressHydrationWarning
									>
										{e.dueAt ? (
											when(e.dueAt)
										) : (
											<span className="text-muted-foreground">No due date</span>
										)}
									</td>
									<td className={CELL}>
										<StatusRing status={e.status} percent={e.percent} />
									</td>
									<td className={cn(CELL, "pr-3 text-right")}>
										<Button
											variant="outline"
											size="sm"
											disabled={!!wait}
											onClick={() => setReminding([e.id])}
											data-testid="remind-one"
										>
											{!wait && (
												<span
													className="icon-[solar--bell-linear] size-3.5"
													aria-hidden="true"
												/>
											)}
											<span suppressHydrationWarning>
												{wait ?? "Send Reminder"}
											</span>
										</Button>
									</td>
								</tr>
							);
						})}
						{shown.length === 0 && (
							<tr>
								<td
									colSpan={6}
									className="px-4 py-10 text-center text-muted-foreground text-sm"
								>
									{enrollments.length === 0
										? "Nobody has this yet. Enroll learners to give it to them."
										: "No learners match your search."}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{chosen.length > 0 && (
				<div
					className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4"
					data-testid="selection-bar"
				>
					<div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[10px] bg-foreground p-1 text-background text-sm shadow-lg">
						<span className="whitespace-nowrap px-2.5 font-medium">
							{people(chosen.length)}
						</span>
						<BarButton
							icon="icon-[solar--calendar-linear]"
							onClick={() => setEditing(true)}
						>
							Edit Due Date
						</BarButton>
						<BarButton
							icon="icon-[solar--bell-linear]"
							onClick={() => setReminding(chosen.map((c) => c.id))}
						>
							Send Reminder
						</BarButton>
						<BarButton
							icon="icon-[solar--trash-bin-minimalistic-linear]"
							onClick={() => setRemoving(true)}
							danger
						>
							Remove
						</BarButton>
						<button
							type="button"
							className="grid size-7 shrink-0 place-items-center rounded-md opacity-70 hover:bg-background/15 hover:opacity-100"
							aria-label="Clear selection"
							onClick={() => setSelected(new Set())}
						>
							<span
								className="icon-[solar--close-linear] size-4"
								aria-hidden="true"
							/>
						</button>
					</div>
				</div>
			)}

			<EnrollModal
				open={enrolling}
				onOpenChange={setEnrolling}
				members={members.filter(
					(m) => !enrollments.some((e) => e.user.id === m.id),
				)}
			/>
			<DueDateModal
				open={editing}
				onOpenChange={setEditing}
				enrollments={chosen}
				onDone={() => setSelected(new Set())}
			/>
			<ReminderModal
				ids={reminding}
				names={enrollments
					.filter((e) => reminding?.includes(e.id))
					.map((e) => e.user.name)}
				onClose={() => setReminding(null)}
			/>
			<ConfirmModal
				open={removing}
				onOpenChange={setRemoving}
				title={`Remove ${people(chosen.length)}?`}
				body={`${chosen.map((c) => c.user.name).join(", ")} will no longer have ${content?.content?.title ?? "this"} in their learning. Their progress is kept.`}
				ok="Remove"
				danger
				icon="icon-[solar--trash-bin-minimalistic-linear]"
				onConfirm={async () => {
					try {
						await remove({
							variables: { slug, ids: chosen.map((c) => c.id) },
						});
						toast.success(`Removed ${people(chosen.length)}`);
						setSelected(new Set());
						setRemoving(false);
					} catch (e) {
						fail("Couldn't remove them")(e);
					}
				}}
			/>
		</main>
	);
}

function BarButton({
	icon,
	danger,
	onClick,
	children,
}: {
	icon: string;
	danger?: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 transition-colors hover:bg-background/15",
				danger && "text-tint-red",
			)}
		>
			<span className={cn(icon, "size-3.5")} aria-hidden="true" />
			<span className="max-sm:sr-only">{children}</span>
		</button>
	);
}

const RING_TONE: Record<Enrollment["status"], string> = {
	completed: "text-tint-green",
	overdue: "text-tint-red",
	in_progress: "text-tint-amber",
	not_started: "text-muted-foreground",
};

/** A small ring filled to the percent, with the status and the percent beside it. */
function StatusRing({
	status,
	percent,
}: {
	status: Enrollment["status"];
	percent: number;
}) {
	const r = 8;
	const c = 2 * Math.PI * r;
	return (
		<span className="flex items-center gap-2" data-testid="assignee-status">
			<svg
				viewBox="0 0 20 20"
				className={cn("size-5 shrink-0 -rotate-90", RING_TONE[status])}
				aria-hidden="true"
			>
				<circle
					cx="10"
					cy="10"
					r={r}
					fill="none"
					stroke="currentColor"
					strokeOpacity={0.18}
					strokeWidth="2.5"
				/>
				<circle
					cx="10"
					cy="10"
					r={r}
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeDasharray={c}
					strokeDashoffset={c * (1 - Math.min(100, Math.max(0, percent)) / 100)}
				/>
			</svg>
			<span className="flex flex-col leading-tight">
				<span className="whitespace-nowrap text-muted-foreground text-xs">
					{STATUS_LABEL[status]}
				</span>
				<span className="font-medium text-xs">{percent}%</span>
			</span>
		</span>
	);
}

function EnrollModal({
	open,
	onOpenChange,
	members,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	members: readonly Member[];
}) {
	const { slug, id } = Route.useParams();
	const [enroll] = useMutation(ENROLL, {
		refetchQueries: [{ query: ASSIGNEES, variables: { slug, contentId: id } }],
	});
	const [search, setSearch] = useState("");
	const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
	const [startAt, setStartAt] = useState("");
	const [dueAt, setDueAt] = useState("");
	const [busy, setBusy] = useState(false);

	// a fresh form each time it opens, starting now
	useEffect(() => {
		if (!open) return;
		setSearch("");
		setPicked(new Set());
		setStartAt(toLocalInput(new Date().toISOString()));
		setDueAt("");
	}, [open]);

	const q = search.trim().toLowerCase();
	const shown = members.filter(
		(m) =>
			!q ||
			m.name.toLowerCase().includes(q) ||
			m.email.toLowerCase().includes(q),
	);
	const badDue = !!dueAt && !!startAt && new Date(dueAt) <= new Date(startAt);

	async function submit() {
		if (picked.size === 0 || badDue) return;
		setBusy(true);
		try {
			await enroll({
				variables: {
					slug,
					contentId: id,
					userIds: [...picked],
					startAt: fromLocalInput(startAt),
					dueAt: fromLocalInput(dueAt),
				},
			});
			toast.success(`Enrolled ${people(picked.size)}`);
			onOpenChange(false);
		} catch (e) {
			fail("Couldn't enroll them")(e);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title="Enroll learners"
			sub="Pick who gets this, and when it starts and is due."
			busy={busy}
			footer={
				<>
					<span className="text-muted-foreground text-sm">
						{picked.size} selected
					</span>
					<Button
						variant="ghost"
						className="ml-auto"
						onClick={() => onOpenChange(false)}
						disabled={busy}
					>
						Cancel
					</Button>
					<Button
						onClick={() => void submit()}
						disabled={busy || picked.size === 0 || badDue}
						aria-busy={busy}
						data-testid="enroll-submit"
					>
						{busy && <Spinner />}
						Enroll
					</Button>
				</>
			}
		>
			<ModalBody>
				<InputWithIcon
					icon="icon-[solar--magnifer-linear]"
					className="h-[30px]"
					placeholder="Search people"
					aria-label="Search people"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<ul
					className="max-h-[280px] overflow-y-auto rounded-[10px] border"
					aria-label="People"
				>
					{shown.map((m) => (
						<li
							key={m.id}
							className="border-border/70 border-b last:border-b-0"
						>
							<label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-muted/60">
								<input
									type="checkbox"
									className={CHECK}
									checked={picked.has(m.id)}
									data-testid="enroll-pick"
									onChange={(e) =>
										setPicked((s) => {
											const next = new Set(s);
											e.target.checked ? next.add(m.id) : next.delete(m.id);
											return next;
										})
									}
								/>
								<Av name={m.name} image={m.image} size="md" />
								<span className="flex min-w-0 flex-col text-sm">
									<b className="truncate font-medium">{m.name}</b>
									<span className="truncate text-muted-foreground text-xs">
										{m.email} · {ROLE_LABEL[mainRole(m.role)]}
									</span>
								</span>
							</label>
						</li>
					))}
					{shown.length === 0 && (
						<li className="px-3 py-6 text-center text-muted-foreground text-sm">
							{members.length === 0
								? "Everyone has this already."
								: "Nobody matches your search."}
						</li>
					)}
				</ul>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="flex flex-col gap-1.5 text-sm">
						<span className="font-medium">Start date</span>
						<input
							type="datetime-local"
							className={DATE_INPUT}
							value={startAt}
							onChange={(e) => setStartAt(e.target.value)}
							data-testid="enroll-start"
						/>
					</label>
					<label className="flex flex-col gap-1.5 text-sm">
						<span className="font-medium">
							Due date{" "}
							<span className="font-normal text-muted-foreground">
								(optional)
							</span>
						</span>
						<input
							type="datetime-local"
							className={DATE_INPUT}
							value={dueAt}
							min={startAt || undefined}
							aria-invalid={badDue || undefined}
							onChange={(e) => setDueAt(e.target.value)}
							data-testid="enroll-due"
						/>
					</label>
				</div>
				{badDue && (
					<p className="text-destructive text-sm" role="alert">
						The due date must be after the start.
					</p>
				)}
			</ModalBody>
		</Modal>
	);
}

function DueDateModal({
	open,
	onOpenChange,
	enrollments,
	onDone,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	enrollments: readonly Enrollment[];
	onDone: () => void;
}) {
	const { slug } = Route.useParams();
	const [update] = useMutation(UPDATE_ENROLLMENTS);
	const [dueAt, setDueAt] = useState("");
	const [none, setNone] = useState(false);
	const [busy, setBusy] = useState(false);

	// opening it starts from the first selected person's due date, if any
	// biome-ignore lint/correctness/useExhaustiveDependencies: once per opening
	useEffect(() => {
		if (!open) return;
		const first = enrollments[0];
		setDueAt(toLocalInput(first?.dueAt ?? null));
		setNone(false);
	}, [open]);

	// the due date can't come before anyone's start
	const latestStart = Math.max(
		...enrollments.map((e) => new Date(e.startAt).getTime()),
	);
	const badDue = !none && !!dueAt && new Date(dueAt).getTime() <= latestStart;

	async function submit() {
		if ((!none && !dueAt) || badDue) return;
		setBusy(true);
		try {
			await update({
				variables: {
					slug,
					ids: enrollments.map((e) => e.id),
					dueAt: none ? null : fromLocalInput(dueAt),
				},
			});
			toast.success(
				`Due date changed for ${enrollments.length === 1 ? enrollments[0]?.user.name : people(enrollments.length)}`,
			);
			onOpenChange(false);
			onDone();
		} catch (e) {
			fail("Couldn't change the due date")(e);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			size="sm"
			title="Edit due date"
			sub={`For ${people(enrollments.length)}.`}
			busy={busy}
			footer={
				<>
					<Button
						variant="ghost"
						className="ml-auto"
						onClick={() => onOpenChange(false)}
						disabled={busy}
					>
						Cancel
					</Button>
					<Button
						onClick={() => void submit()}
						disabled={busy || (!none && !dueAt) || badDue}
						aria-busy={busy}
						data-testid="due-save"
					>
						{busy && <Spinner />}
						Save
					</Button>
				</>
			}
		>
			<ModalBody>
				<label className="flex flex-col gap-1.5 text-sm">
					<span className="font-medium">Due date</span>
					<input
						type="datetime-local"
						className={cn(DATE_INPUT, none && "opacity-50")}
						value={dueAt}
						disabled={none}
						aria-invalid={badDue || undefined}
						onChange={(e) => setDueAt(e.target.value)}
						data-testid="due-input"
					/>
				</label>
				<label className="flex cursor-pointer items-center gap-2.5 text-sm">
					<input
						type="checkbox"
						className={CHECK}
						checked={none}
						onChange={(e) => setNone(e.target.checked)}
						data-testid="due-none"
					/>
					No due date
				</label>
				{badDue && (
					<p className="text-destructive text-sm" role="alert">
						The due date must be after the start.
					</p>
				)}
			</ModalBody>
		</Modal>
	);
}

function ReminderModal({
	ids,
	names,
	onClose,
}: {
	ids: readonly string[] | null;
	names: readonly string[];
	onClose: () => void;
}) {
	const { slug, id } = Route.useParams();
	const [remind] = useMutation<RemindData>(REMIND_ENROLLMENTS, {
		refetchQueries: [{ query: ASSIGNEES, variables: { slug, contentId: id } }],
	});
	const [kind, setKind] = useState<ReminderKind>("running_out");
	const [busy, setBusy] = useState(false);

	async function submit() {
		if (!ids) return;
		setBusy(true);
		try {
			const { data } = await remind({
				variables: { slug, ids: [...ids], kind },
			});
			const sent = data?.remindEnrollments.sent ?? 0;
			const waiting = data?.remindEnrollments.waiting ?? 0;
			if (sent > 0)
				toast.success(`Reminder sent to ${people(sent)}`, {
					desc: waiting
						? `${people(waiting)} got one in the last 30 minutes and will wait.`
						: undefined,
				});
			else
				toast.info("Nobody was reminded", {
					desc: "They all got a reminder in the last 30 minutes.",
				});
			onClose();
		} catch (e) {
			fail("Couldn't send the reminder")(e);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Modal
			open={!!ids}
			onOpenChange={(o) => !o && onClose()}
			title="Send reminder"
			sub={`They get an email right away: ${names.join(", ")}.`}
			busy={busy}
			footer={
				<>
					<Button
						variant="ghost"
						className="ml-auto"
						onClick={onClose}
						disabled={busy}
					>
						Cancel
					</Button>
					<Button
						onClick={() => void submit()}
						disabled={busy}
						aria-busy={busy}
						data-testid="remind-send"
					>
						{busy && <Spinner />}
						Send Reminder
					</Button>
				</>
			}
		>
			<ModalBody>
				<fieldset className="flex flex-col gap-2">
					<legend className="mb-1 font-medium text-muted-foreground text-xs">
						Message
					</legend>
					{REMINDER_CHOICES.map((r) => (
						<label
							key={r.kind}
							className={cn(
								"flex cursor-pointer items-start gap-2.5 rounded-[10px] border p-3 text-sm transition-colors hover:bg-muted/50",
								kind === r.kind && "border-brand bg-brand/5",
							)}
						>
							<input
								type="radio"
								name="reminder"
								className="mt-0.5 size-3.5 accent-(--brand)"
								checked={kind === r.kind}
								onChange={() => setKind(r.kind)}
								data-testid={`remind-${r.kind}`}
							/>
							<span className="flex flex-col gap-0.5">
								<b className="font-medium">{r.title}</b>
								<span className="text-muted-foreground">{r.body}</span>
							</span>
						</label>
					))}
				</fieldset>
			</ModalBody>
		</Modal>
	);
}
